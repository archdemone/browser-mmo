export interface PlayerProfile {
  level: number;
  xp: number;
  gold: number;
}

/**
 * Stores persistent player progress and run state across scene transitions.
 */
class SaveServiceImpl {
  private readonly profile: PlayerProfile = {
    level: 1,
    xp: 0,
    gold: 0,
  };

  private currentHP: number = 100;
  private maxHP: number = 100;
  private readonly xpPerLevel: number = 100;

  getProfile(): PlayerProfile {
    return { ...this.profile };
  }

  addXP(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    this.profile.xp += Math.floor(amount);

    while (this.profile.xp >= this.xpPerLevel) {
      this.profile.xp -= this.xpPerLevel;
      this.profile.level += 1;
      console.log(`[QA] Player leveled up to ${this.profile.level}`);
    }
  }

  addGold(amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }

    const delta = Math.floor(amount);
    this.profile.gold = Math.max(0, this.profile.gold + delta);
  }

  getXPThreshold(): number {
    return this.xpPerLevel;
  }

  getHP(): number {
    return this.currentHP;
  }

  getMaxHP(): number {
    return this.maxHP;
  }

  setHP(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    this.currentHP = Math.min(this.maxHP, Math.max(0, Math.floor(value)));
  }

  resetHPFull(): void {
    this.currentHP = this.maxHP;
  }
}

export const SaveService = new SaveServiceImpl();
