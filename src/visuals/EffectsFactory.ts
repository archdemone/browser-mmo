// Creates visual effects such as spell projectiles, impacts, and ambient particles.
// TODO: Manage pooling of particle systems and animation resources for reuse.

export class EffectsFactory {
  private static globalIntensity = 1;

  static setGlobalIntensity(value: number): void {
    if (!Number.isFinite(value)) {
      console.warn("[EffectsFactory] Ignoring non-finite FX intensity value:", value);
      return;
    }

    EffectsFactory.globalIntensity = Math.max(0, Math.min(1, value));
  }

  static getGlobalIntensity(): number {
    return EffectsFactory.globalIntensity;
  }

  // TODO: Provide APIs to spawn ability effects tied to combat events.
  spawnEffect(effectId: string): void {
    void effectId;
    // TODO: Instantiate Babylon particle systems or meshes for the requested effect.
  }
}
