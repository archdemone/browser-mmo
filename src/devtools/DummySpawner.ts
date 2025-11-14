export type DummyFormation = "single" | "pack" | "line";

export interface DummySpawnConfig {
  formation: DummyFormation;
  count: number;
  armor: number;
  maxHealth: number;
  moveSpeed: number;
}

export type DummySpawnListener = (config: DummySpawnConfig) => void;

const DEFAULT_CONFIG: DummySpawnConfig = {
  formation: "single",
  count: 1,
  armor: 0,
  maxHealth: 1000,
  moveSpeed: 0,
};

export class DummySpawner {
  private readonly listeners = new Set<DummySpawnListener>();
  private config: DummySpawnConfig = { ...DEFAULT_CONFIG };

  subscribe(listener: DummySpawnListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConfig(): DummySpawnConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<DummySpawnConfig>): DummySpawnConfig {
    this.config = { ...this.config, ...partial };
    return this.getConfig();
  }

  spawn(): void {
    const snapshot = this.getConfig();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn("[DummySpawner] spawn listener failed", error);
      }
    });
  }
}

