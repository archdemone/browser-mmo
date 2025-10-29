import { ImageProcessingConfiguration } from "babylonjs";
import {
  PostFXConfig,
  PostFXOverrideId,
  PostFXPresetConfig,
} from "./PostFXConfig";

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

type LightControlKey = keyof LightPresetConfig;

export type VisualControlId =
  | PostFXOverrideId
  | `lights.${LightControlKey}`
  | "effects.intensity";

export type VisualControlGroup = "PostFX" | "Lighting" | "Effects";

export interface VisualControlDefinition {
  id: VisualControlId;
  label: string;
  min: number;
  max: number;
  step?: number;
  group: VisualControlGroup;
}

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

const DEFAULT_LIGHT_STATE: LightPresetConfig = {
  warmLightIntensity: DEFAULT_PRESETS.gameplay.lights?.warmLightIntensity ?? 0.8,
  warmLightRange: DEFAULT_PRESETS.gameplay.lights?.warmLightRange ?? 6,
  coolFillIntensity: DEFAULT_PRESETS.gameplay.lights?.coolFillIntensity ?? 0.7,
  coolFillRange: DEFAULT_PRESETS.gameplay.lights?.coolFillRange ?? 22,
  hemiIntensity: DEFAULT_PRESETS.gameplay.lights?.hemiIntensity ?? 0.55,
};

const VISUAL_PRESET_PATH = "/assets/visual/postfx_presets.json";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const POSTFX_CONTROL_DEFINITIONS: VisualControlDefinition[] = [
  { id: "postfx.bloomEnabled", label: "Bloom Enabled", min: 0, max: 1, step: 1, group: "PostFX" },
  { id: "postfx.bloomWeight", label: "Bloom Weight", min: 0, max: 1.5, step: 0.01, group: "PostFX" },
  { id: "postfx.bloomThreshold", label: "Bloom Threshold", min: 0, max: 1, step: 0.01, group: "PostFX" },
  { id: "postfx.bloomKernel", label: "Bloom Kernel", min: 0, max: 128, step: 1, group: "PostFX" },
  { id: "postfx.vignetteWeight", label: "Vignette Weight", min: 0, max: 1, step: 0.01, group: "PostFX" },
  { id: "postfx.vignetteColor.r", label: "Vignette Red", min: 0, max: 1, step: 0.01, group: "PostFX" },
  { id: "postfx.vignetteColor.g", label: "Vignette Green", min: 0, max: 1, step: 0.01, group: "PostFX" },
  { id: "postfx.vignetteColor.b", label: "Vignette Blue", min: 0, max: 1, step: 0.01, group: "PostFX" },
  { id: "postfx.vignetteBlendMode", label: "Vignette Blend Mode", min: 0, max: 1, step: 1, group: "PostFX" },
  { id: "postfx.exposure", label: "Exposure", min: 0.2, max: 1.5, step: 0.01, group: "PostFX" },
  { id: "postfx.contrast", label: "Contrast", min: 0.5, max: 1.5, step: 0.01, group: "PostFX" },
  { id: "postfx.saturation", label: "Saturation", min: 0, max: 1.5, step: 0.01, group: "PostFX" },
  { id: "postfx.globalSaturation", label: "Global Saturation", min: -50, max: 50, step: 1, group: "PostFX" },
  { id: "postfx.shadowsHue", label: "Shadows Hue", min: 0, max: 360, step: 1, group: "PostFX" },
  { id: "postfx.shadowsDensity", label: "Shadows Density", min: 0, max: 100, step: 1, group: "PostFX" },
  { id: "postfx.shadowsSaturation", label: "Shadows Saturation", min: -100, max: 100, step: 1, group: "PostFX" },
  { id: "postfx.shadowsValue", label: "Shadows Value", min: -50, max: 50, step: 1, group: "PostFX" },
  { id: "postfx.highlightsHue", label: "Highlights Hue", min: 0, max: 360, step: 1, group: "PostFX" },
  { id: "postfx.highlightsDensity", label: "Highlights Density", min: 0, max: 100, step: 1, group: "PostFX" },
  { id: "postfx.highlightsSaturation", label: "Highlights Saturation", min: -100, max: 100, step: 1, group: "PostFX" },
  { id: "postfx.highlightsValue", label: "Highlights Value", min: -50, max: 50, step: 1, group: "PostFX" },
  { id: "postfx.fxaaEnabled", label: "FXAA Enabled", min: 0, max: 1, step: 1, group: "PostFX" },
];

const LIGHT_CONTROL_DEFINITIONS: VisualControlDefinition[] = [
  { id: "lights.warmLightIntensity", label: "Warm Intensity", min: 0, max: 2, step: 0.01, group: "Lighting" },
  { id: "lights.warmLightRange", label: "Warm Range", min: 0, max: 20, step: 0.1, group: "Lighting" },
  { id: "lights.coolFillIntensity", label: "Cool Fill Intensity", min: 0, max: 2, step: 0.01, group: "Lighting" },
  { id: "lights.coolFillRange", label: "Cool Fill Range", min: 0, max: 40, step: 0.1, group: "Lighting" },
  { id: "lights.hemiIntensity", label: "Hemi Intensity", min: 0, max: 2, step: 0.01, group: "Lighting" },
];

const EFFECT_CONTROL_DEFINITIONS: VisualControlDefinition[] = [
  { id: "effects.intensity", label: "FX Intensity", min: 0, max: 1, step: 0.01, group: "Effects" },
];

const ALL_CONTROL_DEFINITIONS: VisualControlDefinition[] = [
  ...POSTFX_CONTROL_DEFINITIONS,
  ...LIGHT_CONTROL_DEFINITIONS,
  ...EFFECT_CONTROL_DEFINITIONS,
];

const CONTROL_DEFINITION_LOOKUP: Map<VisualControlId, VisualControlDefinition> = new Map(
  ALL_CONTROL_DEFINITIONS.map((definition) => [definition.id, definition])
);

export class VisualPresetManager {
  private static presets: PresetRecord = { ...DEFAULT_PRESETS };
  private static order: string[] = Object.keys(DEFAULT_PRESETS);
  private static activePreset: string = "gameplay";
  private static loading: Promise<void> | null = null;
  private static initialized = false;
  private static effectIntensity = 1;
  private static postfxOverrides: Partial<Record<PostFXOverrideId, number>> = {};
  private static lightOverrides: Partial<Record<LightControlKey, number>> = {};
  private static currentLightState: Partial<LightPresetConfig> = {
    ...DEFAULT_LIGHT_STATE,
  };

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
      VisualPresetManager.effectIntensity,
      VisualPresetManager.getPostFXOverrides()
    );
  }

  static getVisualControlDefinitions(): VisualControlDefinition[] {
    return ALL_CONTROL_DEFINITIONS.map((definition) => ({ ...definition }));
  }

  static getControlDefinition(id: VisualControlId): VisualControlDefinition | undefined {
    return CONTROL_DEFINITION_LOOKUP.get(id);
  }

  static getControlValue(id: VisualControlId): number | undefined {
    if (id === "effects.intensity") {
      return VisualPresetManager.effectIntensity;
    }

    if (id.startsWith("postfx.")) {
      return VisualPresetManager.readPostFXControlValue(id as PostFXOverrideId);
    }

    if (id.startsWith("lights.")) {
      const key = id.split(".")[1] as LightControlKey | undefined;
      if (!key) {
        return undefined;
      }
      const override = VisualPresetManager.lightOverrides[key];
      if (override !== undefined) {
        return override;
      }
      const state = VisualPresetManager.currentLightState[key];
      return typeof state === "number" ? state : undefined;
    }

    return undefined;
  }

  static setControlValue(id: VisualControlId, value: number): boolean {
    if (!Number.isFinite(value)) {
      console.warn("[VisualPresetManager] Ignoring non-finite control value for", id, value);
      return false;
    }

    const definition = CONTROL_DEFINITION_LOOKUP.get(id);
    const min = definition?.min ?? Number.NEGATIVE_INFINITY;
    const max = definition?.max ?? Number.POSITIVE_INFINITY;
    let clamped = Math.max(min, Math.min(max, value));
    if (
      definition?.step !== undefined &&
      definition.step >= 1 &&
      definition.max <= 1 &&
      definition.min >= 0
    ) {
      clamped = clamped >= 0.5 ? 1 : 0;
    } else if (definition?.step !== undefined && definition.step >= 1 && definition.max > 1) {
      clamped = Math.round(clamped);
    }

    if (id === "effects.intensity") {
      VisualPresetManager.setEffectIntensity(clamped);
      return true;
    }

    if (id.startsWith("postfx.")) {
      VisualPresetManager.postfxOverrides[id as PostFXOverrideId] = clamped;
      return true;
    }

    if (id.startsWith("lights.")) {
      const key = id.split(".")[1] as LightControlKey | undefined;
      if (!key) {
        return false;
      }
      VisualPresetManager.lightOverrides[key] = clamped;
      return true;
    }

    return false;
  }

  static clearOverrides(): void {
    VisualPresetManager.postfxOverrides = {};
    VisualPresetManager.lightOverrides = {};
  }

  static getPostFXOverrides(): Partial<Record<PostFXOverrideId, number>> {
    return { ...VisualPresetManager.postfxOverrides };
  }

  static getLightOverrides(): Partial<LightPresetConfig> {
    const result: Partial<LightPresetConfig> = {};
    for (const [key, value] of Object.entries(VisualPresetManager.lightOverrides)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        result[key as LightControlKey] = value;
      }
    }
    return result;
  }

  static updateCurrentLightState(state: Partial<LightPresetConfig>): void {
    VisualPresetManager.currentLightState = {
      ...VisualPresetManager.currentLightState,
      ...state,
    };
  }

  private static readPostFXControlValue(id: PostFXOverrideId): number | undefined {
    const settings = PostFXConfig.settings;
    switch (id) {
      case "postfx.bloomEnabled":
        return settings.bloomEnabled ? 1 : 0;
      case "postfx.bloomWeight":
        return settings.bloomWeight;
      case "postfx.bloomThreshold":
        return settings.bloomThreshold;
      case "postfx.bloomKernel":
        return settings.bloomKernel;
      case "postfx.vignetteWeight":
        return settings.vignetteWeight;
      case "postfx.vignetteColor.r":
        return settings.vignetteColor.r;
      case "postfx.vignetteColor.g":
        return settings.vignetteColor.g;
      case "postfx.vignetteColor.b":
        return settings.vignetteColor.b;
      case "postfx.vignetteBlendMode":
        return settings.vignetteBlendMode === ImageProcessingConfiguration.VIGNETTEMODE_OPAQUE ? 1 : 0;
      case "postfx.exposure":
        return settings.exposure;
      case "postfx.contrast":
        return settings.contrast;
      case "postfx.saturation":
        return settings.saturation;
      case "postfx.globalSaturation":
        return settings.globalSaturation;
      case "postfx.shadowsHue":
        return settings.shadowsHue;
      case "postfx.shadowsDensity":
        return settings.shadowsDensity;
      case "postfx.shadowsSaturation":
        return settings.shadowsSaturation;
      case "postfx.shadowsValue":
        return settings.shadowsValue;
      case "postfx.highlightsHue":
        return settings.highlightsHue;
      case "postfx.highlightsDensity":
        return settings.highlightsDensity;
      case "postfx.highlightsSaturation":
        return settings.highlightsSaturation;
      case "postfx.highlightsValue":
        return settings.highlightsValue;
      case "postfx.fxaaEnabled":
        return settings.fxaaEnabled ? 1 : 0;
      default:
        return undefined;
    }
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
