import type { AnimationGroup, Nullable, Observer } from "babylonjs";

export type LocomotionState = "idle" | "run" | "sprint";

interface PlayerAnimatorGroups {
  idle: AnimationGroup;
  run: AnimationGroup;
  sprint: AnimationGroup;
  dodge: AnimationGroup;
  attack: AnimationGroup;
}

/**
 * Controls the player's character animation blending between locomotion states and one-shot actions.
 */
export class PlayerAnimator {
  private readonly locomotionGroups: Record<LocomotionState, AnimationGroup>;
  private readonly dodgeGroup: AnimationGroup;
  private readonly attackGroup: AnimationGroup;
  private desiredLocomotion: LocomotionState;
  private currentLocomotion: LocomotionState;
  private activeOneShot: Nullable<AnimationGroup> = null;
  private oneShotObserver: Nullable<Observer<AnimationGroup>> = null;
  private lastLocomotionRequest: LocomotionState | null = null;

  constructor(groups: PlayerAnimatorGroups) {
    this.locomotionGroups = {
      idle: groups.idle,
      run: groups.run,
      sprint: groups.sprint,
    };

    this.dodgeGroup = groups.dodge;
    this.attackGroup = groups.attack;

    this.locomotionGroups.idle.loopAnimation = true;
    this.locomotionGroups.run.loopAnimation = true;
    this.locomotionGroups.sprint.loopAnimation = true;

    this.dodgeGroup.loopAnimation = false;
    this.attackGroup.loopAnimation = false;

    this.desiredLocomotion = "idle";
    this.currentLocomotion = "idle";
    this.stopAllLocomotion();
    this.logLocomotionRequest("idle");
    this.playLocomotion("idle");
  }

  /**
   * Updates locomotion animations based on movement speed and sprinting flag.
   */
  updateLocomotion(moveSpeed: number, sprinting: boolean): void {
    const threshold = 0.1;
    let target: LocomotionState = "run";

    if (moveSpeed < threshold) {
      target = "idle";
    } else if (sprinting) {
      target = "sprint";
    } else {
      target = "run";
    }

    this.desiredLocomotion = target;
    this.logLocomotionRequest(target);

    if (this.activeOneShot) {
      return;
    }

    this.playLocomotion(target);
  }

  /**
   * Plays the dodge roll animation as a one-shot override.
   */
  playDodgeRoll(): void {
    console.log("[PlayerAnimator] Request dodge roll");
    this.playOneShot(this.dodgeGroup);
    // TODO: During the dodge animation, apply a burst of movement and temporary invulnerability.
  }

  /**
   * Plays the attack animation as a one-shot override.
   */
  playAttack(): void {
    console.log("[PlayerAnimator] Request attack");
    this.playOneShot(this.attackGroup);
    // TODO: Trigger the CombatSystem damage application when the attack connects.
  }

  private playLocomotion(state: LocomotionState): void {
    const group = this.locomotionGroups[state];

    if (this.currentLocomotion === state && group.isPlaying) {
      return;
    }

    this.stopAllLocomotion();
    group.reset();
    group.start(true);
    this.currentLocomotion = state;
  }

  private stopAllLocomotion(): void {
    for (const group of Object.values(this.locomotionGroups)) {
      group.stop();
    }
  }

  private playOneShot(group: AnimationGroup): void {
    if (this.activeOneShot === group) {
      group.stop();
    }

    this.stopActiveOneShot();
    this.stopAllLocomotion();

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
      this.playLocomotion(this.desiredLocomotion);
    });
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
}
