import type { AnimationGroup, Nullable, Observer } from "babylonjs";

export type LocomotionState = "idle" | "run" | "sprint";

interface PlayerAnimatorClips {
  idle?: AnimationGroup | null;
  run?: AnimationGroup | null;
  sprint?: AnimationGroup | null;
  dodge?: AnimationGroup | null;
  attack?: AnimationGroup | null;
}

export interface LocomotionUpdate {
  speed: number;
  normalizedSpeed: number;
  sprinting: boolean;
  deltaTime?: number;
}

/**
 * Controls the player's character animation blending between locomotion states and one-shot actions.
 */
export class PlayerAnimator {
  private readonly clips: PlayerAnimatorClips;
  private activeLoop: AnimationGroup | null = null;
  private activeOneShot: Nullable<AnimationGroup> = null;
  private oneShotObserver: Nullable<Observer<AnimationGroup>> = null;
  private desiredLocomotion: LocomotionState = "idle";
  private currentLocomotion: LocomotionState = "idle";
  private lastLocomotionRequest: LocomotionState | null = null;
  private debugLoggingActive: boolean = false;
  private readonly locomotionClips: Record<LocomotionState, AnimationGroup | null>;
  private blendSource: AnimationGroup | null = null;
  private blendTarget: AnimationGroup | null = null;
  private blendElapsed: number = 0;
  private readonly blendDuration: number = 0.18;
  private lastNormalizedSpeed: number = 0;

  constructor(clips: PlayerAnimatorClips) {
    this.clips = clips;
    this.configureLoop(this.clips.idle ?? null);
    this.configureLoop(this.clips.run ?? null);
    this.configureLoop(this.clips.sprint ?? null);
    this.configureOneShot(this.clips.dodge ?? null);
    this.configureOneShot(this.clips.attack ?? null);

    this.locomotionClips = {
      idle: this.clips.idle ?? null,
      run: this.clips.run ?? null,
      sprint: this.clips.sprint ?? null,
    };

    this.forceLocomotionState("idle");
  }

  /**
   * Updates locomotion animations based on movement speed and sprinting flag.
   */
  updateLocomotion(params: LocomotionUpdate): void {
    const { normalizedSpeed, sprinting, deltaTime = 0 } = params;
    const target = this.selectLocomotionState(normalizedSpeed, sprinting);

    this.desiredLocomotion = target;
    this.logLocomotionRequest(target);

    if (!this.activeOneShot && (this.currentLocomotion !== target || !this.activeLoop)) {
      this.beginLocomotionBlend(target);
    }

    this.applyLocomotionBlend(deltaTime);

    if (this.activeLoop) {
      if (this.currentLocomotion === "idle") {
        this.activeLoop.weight = 1;
        this.activeLoop.speedRatio = 1;
      } else {
        const ratio = 0.6 + Math.min(1, Math.max(0, normalizedSpeed)) * 0.6;
        this.activeLoop.speedRatio = ratio;
      }
    }

    this.lastNormalizedSpeed = normalizedSpeed;
  }

  private selectLocomotionState(normalizedSpeed: number, sprinting: boolean): LocomotionState {
    if (normalizedSpeed < 0.1) {
      return "idle";
    }

    if (sprinting && (this.locomotionClips.sprint ?? null)) {
      return "sprint";
    }

    return "run";
  }

  private beginLocomotionBlend(state: LocomotionState): void {
    const targetClip = this.resolveLocomotionClip(state);
    const previous = this.activeLoop;

    if (!targetClip) {
      this.stopActiveLoop();
      this.currentLocomotion = state;
      return;
    }

    if (targetClip === previous) {
      this.blendSource = null;
      this.blendTarget = null;
      this.blendElapsed = 0;
      this.currentLocomotion = state;
      if (!targetClip.isPlaying) {
        targetClip.start(true);
      }
      targetClip.weight = 1;
      this.activeLoop = targetClip;
      return;
    }

    targetClip.reset();
    targetClip.start(true);
    targetClip.weight = 0;

    if (previous && previous !== targetClip) {
      previous.weight = 1;
    }

    this.blendSource = previous && previous !== targetClip ? previous : null;
    this.blendTarget = targetClip;
    this.blendElapsed = 0;
    this.currentLocomotion = state;
    this.activeLoop = targetClip;
  }

  private applyLocomotionBlend(deltaTime: number): void {
    if (this.blendTarget) {
      this.blendElapsed += deltaTime;
      const duration = Math.max(0.01, this.blendDuration);
      const t = Math.min(1, this.blendElapsed / duration);

      if (this.blendSource && this.blendSource !== this.blendTarget) {
        this.blendSource.weight = 1 - t;
      }

      this.blendTarget.weight = t;

      if (t >= 1) {
        if (this.blendSource && this.blendSource !== this.blendTarget) {
          this.blendSource.stop();
          this.blendSource.weight = 0;
        }
        this.blendSource = null;
        this.blendTarget = null;
        this.blendElapsed = 0;
        if (this.activeLoop) {
          this.activeLoop.weight = 1;
        }
      }
      return;
    }

    if (this.activeLoop) {
      if (!this.activeLoop.isPlaying) {
        this.activeLoop.start(true);
      }
      this.activeLoop.weight = 1;
    }
  }

  private forceLocomotionState(state: LocomotionState): void {
    const clip = this.resolveLocomotionClip(state);
    this.stopActiveLoop();
    if (clip) {
      clip.reset();
      clip.start(true);
      clip.weight = 1;
    }
    this.activeLoop = clip ?? null;
    this.currentLocomotion = state;
    this.desiredLocomotion = state;
    this.blendSource = null;
    this.blendTarget = null;
    this.blendElapsed = 0;
  }

  /**
   * Plays the dodge roll animation as a one-shot override.
   */
  playDodgeRoll(): void {
    const clip = this.clips.dodge ?? null;
    if (!clip) {
      console.warn("[QA] PlayerAnimator dodge clip missing, safe no-op.");
      return;
    }

    if (this.debugLoggingActive) {
      console.log(`[DBG] dodge start group=${clip.name}`);
    }

    this.playOneShot(clip);
    // TODO: During the dodge animation, apply a burst of movement and temporary invulnerability.
  }

  /**
   * Plays the attack animation as a one-shot override.
   * Uses bone-specific targeting to only animate upper body during movement.
   */
  playAttack(options?: { forceRestart?: boolean }): void {
    const clip = this.clips.attack ?? null;
    if (!clip) {
      console.warn("[QA] PlayerAnimator attack clip missing, safe no-op.");
      return;
    }

    const forceRestart = options?.forceRestart ?? false;

    if (!forceRestart && this.isAttackPlaying()) {
      return;
    }

    if (forceRestart && this.activeOneShot === clip) {
      clip.stop();
    }

    if (this.debugLoggingActive) {
      console.log("[DBG] attack start");
    }
    
    // If player is moving, use overlay approach
    if (this.currentLocomotion !== "idle") {
      this.playOneShotOverlay(clip);
    } else {
      // If stationary, use normal one-shot
      this.playOneShot(clip);
    }
    // TODO: Trigger the CombatSystem damage application when the attack connects.
  }

  isAttackPlaying(): boolean {
    return !!this.activeOneShot && this.activeOneShot === (this.clips.attack ?? null);
  }

  cancelAttack(): void {
    const attackClip = this.clips.attack ?? null;
    if (!attackClip) {
      return;
    }

    if (this.activeOneShot !== attackClip) {
      return;
    }

    this.stopActiveOneShot();
    this.forceLocomotionState(this.desiredLocomotion);
  }

  getAttackDuration(): number {
    return this.computeClipDuration(this.clips.attack ?? null);
  }

  private configureLoop(group: AnimationGroup | null): void {
    if (!group) {
      return;
    }

    group.loopAnimation = true;
    group.stop();
    group.reset();
    group.weight = 0;
    group.speedRatio = 1;
  }

  private configureOneShot(group: AnimationGroup | null): void {
    if (!group) {
      return;
    }

    group.loopAnimation = false;
    group.stop();
    group.reset();
  }

  private resolveLocomotionClip(state: LocomotionState): AnimationGroup | null {
    if (state === "sprint") {
      return this.clips.sprint ?? this.resolveLocomotionClip("run");
    }

    if (state === "run") {
      return this.clips.run ?? this.resolveLocomotionClip("idle");
    }

    return this.clips.idle ?? null;
  }

  private playOneShot(group: AnimationGroup): void {
    if (this.activeOneShot === group) {
      group.stop();
    }

    this.stopActiveOneShot();
    this.stopActiveLoop();

    this.activeOneShot = group;
    group.reset();
    group.start(false);

    this.oneShotObserver = group.onAnimationGroupEndObservable.add(() => {
      if (this.oneShotObserver) {
        group.onAnimationGroupEndObservable.remove(this.oneShotObserver);
        this.oneShotObserver = null;
      }

      if (this.activeOneShot !== group) {
        return;
      }

      this.activeOneShot = null;
      if (this.debugLoggingActive) {
        console.log(`[DBG] dodge end group=${group.name}`);
      }
      this.forceLocomotionState(this.desiredLocomotion);
    });
  }

  /**
   * Plays a one-shot animation as an overlay without stopping locomotion.
   * Uses animation weights to blend attack with locomotion.
   */
  private playOneShotOverlay(group: AnimationGroup): void {
    if (this.activeOneShot === group) {
      group.stop();
    }

    this.stopActiveOneShot();
    // NOTE: Unlike playOneShot, we DON'T call this.stopActiveLoop()
    // This allows locomotion animation to continue playing underneath

    this.activeOneShot = group;
    group.reset();
    
    // Set attack animation weight to blend with locomotion
    group.weight = 0.4; // 40% attack, 60% locomotion
    
    // If locomotion is playing, keep it dominant
    if (this.activeLoop) {
      this.activeLoop.weight = 0.8; // 80% locomotion, 20% attack
    }
    
    group.start(false);

    this.oneShotObserver = group.onAnimationGroupEndObservable.add(() => {
      if (this.oneShotObserver) {
        group.onAnimationGroupEndObservable.remove(this.oneShotObserver);
        this.oneShotObserver = null;
      }

      if (this.activeOneShot !== group) {
        return;
      }

      this.activeOneShot = null;
      
      // Restore locomotion weight to full
      if (this.activeLoop) {
        this.activeLoop.weight = 1.0;
      }
      
      if (this.debugLoggingActive) {
        console.log(`[DBG] attack overlay end group=${group.name}`);
      }
      // Don't resume locomotion since it was never stopped
    });
  }

  private computeClipDuration(clip: AnimationGroup | null): number {
    if (!clip) {
      return 0;
    }

    let from = clip.from;
    let to = clip.to;
    let fps = 0;

    if (clip.targetedAnimations.length > 0) {
      const first = clip.targetedAnimations[0].animation;
      if (first) {
        fps = first.framePerSecond ?? fps;
        if (typeof from !== "number") {
          const keys = first.getKeys();
          if (keys.length > 0) {
            from = keys[0].frame;
            to = keys[keys.length - 1].frame;
          }
        }
      }
    }

    if (typeof from !== "number" || typeof to !== "number") {
      return 0;
    }
    if (fps <= 0) {
      fps = 60;
    }
    const frameCount = Math.max(0, to - from);
    if (frameCount === 0) {
      return 0;
    }
    const speedRatio = clip.speedRatio || 1;
    if (speedRatio === 0) {
      return 0;
    }
    return frameCount / fps / Math.abs(speedRatio);
  }

  private stopActiveLoop(): void {
    if (this.activeLoop) {
      this.activeLoop.stop();
      this.activeLoop.weight = 0;
    }

    if (this.blendSource && this.blendSource !== this.activeLoop) {
      this.blendSource.stop();
      this.blendSource.weight = 0;
    }

    if (this.blendTarget && this.blendTarget !== this.activeLoop) {
      this.blendTarget.stop();
      this.blendTarget.weight = 0;
    }

    this.activeLoop = null;
    this.blendSource = null;
    this.blendTarget = null;
    this.blendElapsed = 0;
  }

  private stopActiveOneShot(): void {
    if (!this.activeOneShot) {
      return;
    }

    if (this.oneShotObserver) {
      this.activeOneShot.onAnimationGroupEndObservable.remove(this.oneShotObserver);
      this.oneShotObserver = null;
    }

    this.activeOneShot.stop();
    this.activeOneShot = null;
  }

  private logLocomotionRequest(state: LocomotionState): void {
    if (this.lastLocomotionRequest === state) {
      return;
    }

    if (this.debugLoggingActive) {
      console.log(`[DBG] locomotion request state=${state}`);
    }
    this.lastLocomotionRequest = state;
  }

  setDebugLoggingActive(active: boolean): void {
    this.debugLoggingActive = active;
  }

  static createEmpty(): PlayerAnimator {
    return new PlayerAnimator({});
  }
}
