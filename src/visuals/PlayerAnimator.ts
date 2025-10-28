import type { AnimationGroup, Nullable, Observer } from "babylonjs";

export type LocomotionState = "idle" | "run" | "sprint";

interface PlayerAnimatorClips {
  idle?: AnimationGroup | null;
  run?: AnimationGroup | null;
  sprint?: AnimationGroup | null;
  dodge?: AnimationGroup | null;
  attack?: AnimationGroup | null;
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

  constructor(clips: PlayerAnimatorClips) {
    this.clips = clips;
    this.configureLoop(this.clips.idle ?? null);
    this.configureLoop(this.clips.run ?? null);
    this.configureLoop(this.clips.sprint ?? null);
    this.configureOneShot(this.clips.dodge ?? null);
    this.configureOneShot(this.clips.attack ?? null);

    this.playLocomotionClip("idle");
  }

  /**
   * Updates locomotion animations based on movement speed and sprinting flag.
   */
  updateLocomotion(moveSpeed: number, sprinting: boolean): void {
    const speedThreshold = 0.1;
    let target: LocomotionState = "idle";

    if (moveSpeed > speedThreshold) {
      target = sprinting ? "sprint" : "run";
    }

    this.desiredLocomotion = target;
    this.logLocomotionRequest(target);

    if (this.activeOneShot) {
      return;
    }

    this.playLocomotionClip(target);
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
    this.playOneShot(clip);
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
    this.playLocomotionClip(this.desiredLocomotion);
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
  }

  private configureOneShot(group: AnimationGroup | null): void {
    if (!group) {
      return;
    }

    group.loopAnimation = false;
    group.stop();
    group.reset();
  }

  private playLocomotionClip(state: LocomotionState): void {
    const clip = this.resolveLocomotionClip(state);

    if (this.activeLoop === clip) {
      if (clip && !clip.isPlaying) {
        clip.start(true);
      }
      this.currentLocomotion = state;
      if (this.debugLoggingActive) {
        console.log(
          `[DBG] locomotion state=${state} group=${clip?.name ?? "none"} loop=${clip?.loopAnimation ?? false}`
        );
      }
      return;
    }

    this.stopActiveLoop();

    if (clip) {
      clip.reset();
      clip.start(true);
    }

    this.activeLoop = clip;
    this.currentLocomotion = state;

    if (this.debugLoggingActive) {
      console.log(
        `[DBG] locomotion state=${state} group=${clip?.name ?? "none"} loop=${clip?.loopAnimation ?? false}`
      );
    }
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
      this.playLocomotionClip(this.desiredLocomotion);
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
    if (!this.activeLoop) {
      return;
    }

    this.activeLoop.stop();
    this.activeLoop = null;
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
