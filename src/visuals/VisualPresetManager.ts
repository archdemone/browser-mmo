import { PostFXConfig, PostFXPresetConfig } from "./PostFXConfig";

export interface LightPresetConfig {
  warmLightIntensity?: number;
  warmLightRange?: number;
  coolFillIntensity?: number;
  coolFillRange?: number;
  hemiIntensity?: number;
}

export interface VisualPresetDefinition {
  postfx?: PostFXPresetConfig | null;
  lights?: LightPresetConfig | null;
}

type PresetRecord = Record<string, VisualPresetDefinition>;

const DEFAULT_PRESETS: PresetRecord = {
  gameplay: {
    postfx: {
      bloomEnabled: true,
      bloomWeight: 0.22,
      bloomThreshold: 0.72,
      bloomKernel: 48,
      vignetteWeight: 0.55,
      vignetteColor: [0.05, 0.05, 0.07],
      vignetteBlendMode: "multiply",
      exposure: 0.88,
      contrast: 1.05,
      saturation: 0.9,
      globalSaturation: -12,
      shadowsHue: 210,
      shadowsDensity: 55,
      shadowsSaturation: 45,
      shadowsValue: -6,
      highlightsHue: 40,
      highlightsDensity: 18,
      highlightsSaturation: 12,
      highlightsValue: 4,
      fxaaEnabled: false,
    },
    lights: {
      warmLightIntensity: 0.8,
      warmLightRange: 6.0,
      coolFillIntensity: 0.7,
      coolFillRange: 21.8,
      hemiIntensity: 0.55,
    },
  },
  cinematic: {
    postfx: {
      bloomEnabled: true,
      bloomWeight: 0.32,
      bloomThreshold: 0.65,
      bloomKernel: 52,
      vignetteWeight: 0.72,
      vignetteColor: [0.04, 0.04, 0.06],
      vignetteBlendMode: "multiply",
      exposure: 0.85,
      contrast: 1.08,
      saturation: 0.82,
      globalSaturation: -18,
      shadowsHue: 210,
      shadowsDensity: 60,
      shadowsSaturation: 52,
      shadowsValue: -10,
      highlightsHue: 34,
      highlightsDensity: 20,
      highlightsSaturation: 8,
      highlightsValue: 2,
      fxaaEnabled: false,
    },
    lights: {
      warmLightIntensity: 0.92,
      warmLightRange: 6.6,
      coolFillIntensity: 0.62,
      coolFillRange: 24,
      hemiIntensity: 0.5,
    },
  },
};

const VISUAL_PRESET_PATH = "/assets/visual/postfx_presets.json";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export class VisualPresetManager {
  private static presets: PresetRecord = { ...DEFAULT_PRESETS };
  private static order: string[] = Object.keys(DEFAULT_PRESETS);
  private static activePreset: string = "gameplay";
  private static loading: Promise<void> | null = null;
  private static initialized = false;
  private static effectIntensity = 1;

  static async initialize(): Promise<void> {
    if (VisualPresetManager.initialized) {
      return;
    }

    if (VisualPresetManager.loading) {
      return VisualPresetManager.loading;
    }

    VisualPresetManager.loading = VisualPresetManager.loadPresetsFromJson();
    await VisualPresetManager.loading;
    VisualPresetManager.initialized = true;
  }

  static getActivePresetName(): string {
    return VisualPresetManager.activePreset;
  }

  static getActivePreset(): VisualPresetDefinition {
    return VisualPresetManager.presets[VisualPresetManager.activePreset] ??
      DEFAULT_PRESETS.gameplay;
  }

  static getEffectIntensity(): number {
    return VisualPresetManager.effectIntensity;
  }

  static setEffectIntensity(value: number): void {
    if (Number.isFinite(value)) {
      const clamped = Math.max(0, Math.min(1, value));
      VisualPresetManager.effectIntensity = clamped;
    } else {
      console.warn(
        "[VisualPresetManager] Ignoring non-finite effect intensity value:",
        value
      );
    }
  }

  static cyclePreset(): string {
    const currentIndex = VisualPresetManager.order.indexOf(
      VisualPresetManager.activePreset
    );
    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % VisualPresetManager.order.length
      : 0;

    VisualPresetManager.activePreset = VisualPresetManager.order[nextIndex];
    return VisualPresetManager.activePreset;
  }

  static setActivePreset(name: string): void {
    if (VisualPresetManager.presets[name]) {
      VisualPresetManager.activePreset = name;
    } else {
      console.warn(
        `[VisualPresetManager] Attempted to activate unknown preset "${name}". Keeping ${VisualPresetManager.activePreset}.`
      );
    }
  }

  static getPreset(name: string): VisualPresetDefinition | undefined {
    return VisualPresetManager.presets[name];
  }

  static getPresetNames(): string[] {
    return [...VisualPresetManager.order];
  }

  static applyActivePreset(): void {
    const preset = VisualPresetManager.getActivePreset();
    PostFXConfig.applyPreset(
      preset.postfx ?? undefined,
      VisualPresetManager.effectIntensity
    );
  }

  private static async loadPresetsFromJson(): Promise<void> {
    try {
      const response = await fetch(VISUAL_PRESET_PATH, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: unknown = await response.json();
      if (!data || typeof data !== "object") {
        throw new Error("Preset JSON did not contain an object.");
      }

      const parsed = VisualPresetManager.sanitizePresetRecord(
        data as Record<string, unknown>
      );

      if (Object.keys(parsed).length === 0) {
        throw new Error("No valid presets were found in JSON.");
      }

      VisualPresetManager.presets = { ...DEFAULT_PRESETS, ...parsed };
      VisualPresetManager.order = VisualPresetManager.buildPresetOrder(parsed);

      if (!VisualPresetManager.presets[VisualPresetManager.activePreset]) {
        VisualPresetManager.activePreset = VisualPresetManager.order[0] ?? "gameplay";
      }
    } catch (error) {
      console.warn(
        "[VisualPresetManager] Failed to load visual presets JSON. Falling back to defaults.",
        error
      );
      VisualPresetManager.presets = { ...DEFAULT_PRESETS };
      VisualPresetManager.order = Object.keys(DEFAULT_PRESETS);
      VisualPresetManager.activePreset = "gameplay";
    } finally {
      VisualPresetManager.loading = null;
    }
  }

  private static sanitizePresetRecord(raw: Record<string, unknown>): PresetRecord {
    const result: PresetRecord = {};

    for (const [name, value] of Object.entries(raw)) {
      if (!value || typeof value !== "object") {
        console.warn(
          `[VisualPresetManager] Preset "${name}" is not an object. Skipping.`
        );
        continue;
      }

      const preset = value as { postfx?: unknown; lights?: unknown };
      const sanitized: VisualPresetDefinition = {};

      if ("postfx" in preset) {
        sanitized.postfx = VisualPresetManager.sanitizePostFXPreset(
          preset.postfx,
          name
        );
      }

      if ("lights" in preset) {
        sanitized.lights = VisualPresetManager.sanitizeLightPreset(
          preset.lights,
          name
        );
      }

      if (sanitized.postfx || sanitized.lights) {
        result[name] = sanitized;
      } else {
        console.warn(
          `[VisualPresetManager] Preset "${name}" did not contain any valid settings. Skipping.`
        );
      }
    }

    return result;
  }

  private static sanitizePostFXPreset(
    raw: unknown,
    presetName: string
  ): PostFXPresetConfig | undefined {
    if (!raw || typeof raw !== "object") {
      console.warn(
        `[VisualPresetManager] PostFX preset for "${presetName}" is invalid. Expected object.`
      );
      return undefined;
    }

    return raw as PostFXPresetConfig;
  }

  private static sanitizeLightPreset(
    raw: unknown,
    presetName: string
  ): LightPresetConfig | undefined {
    if (!raw || typeof raw !== "object") {
      console.warn(
        `[VisualPresetManager] Light preset for "${presetName}" is invalid. Expected object.`
      );
      return undefined;
    }

    const result: LightPresetConfig = {};
    const obj = raw as Record<string, unknown>;

    const maybeAssign = (
      key: keyof LightPresetConfig,
      label: string
    ) => {
      const value = obj[label];
      if (value === undefined) {
        return;
      }
      if (isFiniteNumber(value)) {
        result[key] = value;
      } else {
        console.warn(
          `[VisualPresetManager] Light preset "${presetName}" has invalid value for ${label}. Expected number, received`,
          value
        );
      }
    };

    maybeAssign("warmLightIntensity", "warmLightIntensity");
    maybeAssign("warmLightRange", "warmLightRange");
    maybeAssign("coolFillIntensity", "coolFillIntensity");
    maybeAssign("coolFillRange", "coolFillRange");
    maybeAssign("hemiIntensity", "hemiIntensity");

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private static buildPresetOrder(parsed: PresetRecord): string[] {
    const names = new Set<string>();
    const ordered: string[] = [];

    for (const key of Object.keys(DEFAULT_PRESETS)) {
      names.add(key);
      ordered.push(key);
    }

    for (const key of Object.keys(parsed)) {
      if (!names.has(key)) {
        names.add(key);
        ordered.push(key);
      }
    }

    return ordered;
  }
}
