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

    console.log("[PlayerAnimator] Request dodge roll");
    this.playOneShot(clip);
    // TODO: During the dodge animation, apply a burst of movement and temporary invulnerability.
  }

  /**
   * Plays the attack animation as a one-shot override.
   */
  playAttack(): void {
    const clip = this.clips.attack ?? null;
    if (!clip) {
      console.warn("[QA] PlayerAnimator attack clip missing, safe no-op.");
      return;
    }

    console.log("[PlayerAnimator] Request attack");
    this.playOneShot(clip);
    // TODO: Trigger the CombatSystem damage application when the attack connects.
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
      return;
    }

    this.stopActiveLoop();

    if (clip) {
      clip.reset();
      clip.start(true);
    }

    this.activeLoop = clip;
    this.currentLocomotion = state;
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
      this.playLocomotionClip(this.desiredLocomotion);
    });
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

    console.log(`[PlayerAnimator] Request ${state} locomotion`);
    this.lastLocomotionRequest = state;
  }

  static createEmpty(): PlayerAnimator {
    return new PlayerAnimator({});
  }
}
