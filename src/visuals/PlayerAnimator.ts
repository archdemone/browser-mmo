import type { AnimationGroup, Nullable, Observer } from "babylonjs";

export type LocomotionState = "idle" | "run" | "sprint";

interface PlayerAnimatorGroups {
  idleGroup: AnimationGroup | null;
  runGroup: AnimationGroup | null;
  sprintGroup: AnimationGroup | null;
  dodgeGroup: AnimationGroup | null;
  attackGroup: AnimationGroup | null;
}

/**
 * Controls the player's character animation blending between locomotion states and one-shot actions.
 */
export class PlayerAnimator {
  private readonly locomotionGroups: Partial<Record<LocomotionState, AnimationGroup>>;
  private readonly dodgeGroup: AnimationGroup | null;
  private readonly attackGroup: AnimationGroup | null;
  private desiredLocomotion: LocomotionState;
  private currentLocomotion: LocomotionState;
  private activeOneShot: Nullable<AnimationGroup> = null;
  private oneShotObserver: Nullable<Observer<AnimationGroup>> = null;
  private lastLocomotionRequest: LocomotionState | null = null;

  constructor(groups: PlayerAnimatorGroups) {
    this.locomotionGroups = {};

    if (groups.idleGroup) {
      this.locomotionGroups.idle = groups.idleGroup;
      this.locomotionGroups.idle.loopAnimation = true;
    }
    if (groups.runGroup) {
      this.locomotionGroups.run = groups.runGroup;
      this.locomotionGroups.run.loopAnimation = true;
    }
    if (groups.sprintGroup) {
      this.locomotionGroups.sprint = groups.sprintGroup;
      this.locomotionGroups.sprint.loopAnimation = true;
    }

    this.dodgeGroup = groups.dodgeGroup ?? null;
    this.attackGroup = groups.attackGroup ?? null;

    if (this.dodgeGroup) this.dodgeGroup.loopAnimation = false;
    if (this.attackGroup) this.attackGroup.loopAnimation = false;

    this.desiredLocomotion = "idle";
    this.currentLocomotion = "idle";
    this.stopAllLocomotion();
    this.logLocomotionRequest("idle");
    const initial = this.resolveLocomotionGroup("idle");
    if (initial) {
      this.playLocomotion(initial, "idle");
    }
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

    // Choose the best available locomotion group based on target preference
    const group = this.resolveLocomotionGroup(target);
    if (!group) {
      // No available group at all; nothing to play
      return;
    }
    this.playLocomotion(group, target);
  }

  /**
   * Plays the dodge roll animation as a one-shot override.
   */
  playDodgeRoll(): void {
    console.log("[PlayerAnimator] Request dodge roll");
    if (!this.dodgeGroup) {
      console.warn("[QA] Dodge animation unavailable; ignoring dodge input.");
      return;
    }
    this.playOneShot(this.dodgeGroup);
    // TODO: During the dodge animation, apply a burst of movement and temporary invulnerability.
  }

  /**
   * Plays the attack animation as a one-shot override.
   */
  playAttack(): void {
    console.log("[PlayerAnimator] Request attack");
    if (!this.attackGroup) {
      console.warn("[QA] Attack animation unavailable; ignoring attack input.");
      return;
    }
    this.playOneShot(this.attackGroup);
    // TODO: Trigger the CombatSystem damage application when the attack connects.
  }

  private playLocomotion(group: AnimationGroup, state: LocomotionState): void {
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
      if (group) group.stop();
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
      const next = this.resolveLocomotionGroup(this.desiredLocomotion);
      if (next) {
        this.playLocomotion(next, this.desiredLocomotion);
      }
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

  private resolveLocomotionGroup(target: LocomotionState): AnimationGroup | null {
    // Try target -> sensible fallback order
    if (target === "sprint") {
      return (
        this.locomotionGroups.sprint ??
        this.locomotionGroups.run ??
        this.locomotionGroups.idle ??
        null
      ) as AnimationGroup | null;
    }

    if (target === "run") {
      return (this.locomotionGroups.run ?? this.locomotionGroups.idle ?? null) as AnimationGroup | null;
    }

    // idle
    return (this.locomotionGroups.idle ?? null) as AnimationGroup | null;
  }
}
