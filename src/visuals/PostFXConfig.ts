import {
  Color3,
  ColorCurves,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  Scene,
} from "babylonjs";

export interface PostFXSettings {
  bloomEnabled: boolean;
  bloomWeight: number;
  bloomThreshold: number;
  bloomKernel: number;
  vignetteWeight: number;
  vignetteColor: Color3;
  vignetteBlendMode: number;
  exposure: number;
  contrast: number;
  saturation: number;
  globalSaturation: number;
  shadowsHue: number;
  shadowsDensity: number;
  shadowsSaturation: number;
  shadowsValue: number;
  highlightsHue: number;
  highlightsDensity: number;
  highlightsSaturation: number;
  highlightsValue: number;
  fxaaEnabled: boolean;
}

const createDefaultSettings = (): PostFXSettings => ({
  bloomEnabled: true,
  bloomWeight: 0.22,
  bloomThreshold: 0.72,
  bloomKernel: 48,
  vignetteWeight: 0.55,
  vignetteColor: new Color3(0.05, 0.05, 0.07),
  vignetteBlendMode: ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY,
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
});

const createNeutralSettings = (): PostFXSettings => ({
  bloomEnabled: false,
  bloomWeight: 0,
  bloomThreshold: 1,
  bloomKernel: 24,
  vignetteWeight: 0,
  vignetteColor: new Color3(0, 0, 0),
  vignetteBlendMode: ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY,
  exposure: 1,
  contrast: 1,
  saturation: 1,
  globalSaturation: 0,
  shadowsHue: 0,
  shadowsDensity: 0,
  shadowsSaturation: 0,
  shadowsValue: 0,
  highlightsHue: 0,
  highlightsDensity: 0,
  highlightsSaturation: 0,
  highlightsValue: 0,
  fxaaEnabled: false,
});

export interface PostFXPresetConfig {
  bloomEnabled?: boolean;
  bloomWeight?: number;
  bloomThreshold?: number;
  bloomKernel?: number;
  vignetteWeight?: number;
  vignetteColor?: [number, number, number] | { r: number; g: number; b: number };
  vignetteBlendMode?: number | "multiply" | "opaque";
  exposure?: number;
  contrast?: number;
  saturation?: number;
  globalSaturation?: number;
  shadowsHue?: number;
  shadowsDensity?: number;
  shadowsSaturation?: number;
  shadowsValue?: number;
  highlightsHue?: number;
  highlightsDensity?: number;
  highlightsSaturation?: number;
  highlightsValue?: number;
  fxaaEnabled?: boolean;
}

export class PostFXConfig {
  private static pipeline: DefaultRenderingPipeline | null = null;
  static settings: PostFXSettings = createDefaultSettings();

  static getDefaultSettings(): PostFXSettings {
    return createDefaultSettings();
  }

  static applyPreset(
    preset?: PostFXPresetConfig | null,
    intensityScale: number = 1
  ): void {
    const defaults = createDefaultSettings();
    if (!preset || typeof preset !== "object") {
      PostFXConfig.settings = defaults;
      return;
    }

    const settings = { ...defaults };
    const neutral = createNeutralSettings();
    const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
    const scale = clamp01(intensityScale);

    const assignNumber = <K extends keyof PostFXSettings>(
      key: K,
      value: unknown
    ) => {
      if (value === undefined) {
        return;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        settings[key] = value as PostFXSettings[K];
      } else {
        console.warn(
          `[PostFXConfig] Invalid numeric value for ${String(key)} in preset. Received:`,
          value
        );
      }
    };

    const assignBoolean = <K extends keyof PostFXSettings>(
      key: K,
      value: unknown
    ) => {
      if (value === undefined) {
        return;
      }
      if (typeof value === "boolean") {
        settings[key] = value as PostFXSettings[K];
      } else {
        console.warn(
          `[PostFXConfig] Invalid boolean value for ${String(key)} in preset. Received:`,
          value
        );
      }
    };

    assignBoolean("bloomEnabled", preset.bloomEnabled);
    assignNumber("bloomWeight", preset.bloomWeight);
    assignNumber("bloomThreshold", preset.bloomThreshold);
    assignNumber("bloomKernel", preset.bloomKernel);
    assignNumber("vignetteWeight", preset.vignetteWeight);
    assignNumber("exposure", preset.exposure);
    assignNumber("contrast", preset.contrast);
    assignNumber("saturation", preset.saturation);
    assignNumber("globalSaturation", preset.globalSaturation);
    assignNumber("shadowsHue", preset.shadowsHue);
    assignNumber("shadowsDensity", preset.shadowsDensity);
    assignNumber("shadowsSaturation", preset.shadowsSaturation);
    assignNumber("shadowsValue", preset.shadowsValue);
    assignNumber("highlightsHue", preset.highlightsHue);
    assignNumber("highlightsDensity", preset.highlightsDensity);
    assignNumber("highlightsSaturation", preset.highlightsSaturation);
    assignNumber("highlightsValue", preset.highlightsValue);
    assignBoolean("fxaaEnabled", preset.fxaaEnabled);

    if (preset.vignetteColor !== undefined) {
      const color = preset.vignetteColor;
      if (Array.isArray(color) && color.length === 3) {
        const [r, g, b] = color;
        if ([r, g, b].every((component) => typeof component === "number")) {
          settings.vignetteColor = new Color3(r, g, b);
        } else {
          console.warn("[PostFXConfig] Vignette color array must contain numbers.", color);
        }
      } else if (
        typeof color === "object" &&
        color !== null &&
        "r" in color &&
        "g" in color &&
        "b" in color
      ) {
        const r = (color as { r: unknown }).r;
        const g = (color as { g: unknown }).g;
        const b = (color as { b: unknown }).b;
        if ([r, g, b].every((component) => typeof component === "number")) {
          settings.vignetteColor = new Color3(r as number, g as number, b as number);
        } else {
          console.warn("[PostFXConfig] Vignette color object must contain numeric r/g/b.", color);
        }
      } else {
        console.warn("[PostFXConfig] Unsupported vignette color value.", color);
      }
    }

    if (preset.vignetteBlendMode !== undefined) {
      const blend = preset.vignetteBlendMode;
      if (typeof blend === "number") {
        settings.vignetteBlendMode = blend;
      } else if (typeof blend === "string") {
        if (blend.toLowerCase() === "multiply") {
          settings.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
        } else if (blend.toLowerCase() === "opaque") {
          settings.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_OPAQUE;
        } else {
          console.warn("[PostFXConfig] Unknown vignette blend mode string.", blend);
        }
      } else {
        console.warn("[PostFXConfig] Unsupported vignette blend mode value.", blend);
      }
    }

    const lerp = (from: number, to: number): number => from + (to - from) * scale;

    settings.bloomEnabled = scale > 0 && settings.bloomEnabled;
    settings.bloomWeight = lerp(neutral.bloomWeight, settings.bloomWeight);
    settings.bloomThreshold = lerp(
      neutral.bloomThreshold,
      settings.bloomThreshold
    );
    settings.bloomKernel = Math.max(
      0,
      Math.round(lerp(neutral.bloomKernel, settings.bloomKernel))
    );
    settings.vignetteWeight = lerp(neutral.vignetteWeight, settings.vignetteWeight);
    settings.vignetteColor = Color3.Lerp(
      neutral.vignetteColor,
      settings.vignetteColor,
      scale
    );
    settings.vignetteBlendMode = scale > 0
      ? settings.vignetteBlendMode
      : neutral.vignetteBlendMode;
    settings.exposure = lerp(neutral.exposure, settings.exposure);
    settings.contrast = lerp(neutral.contrast, settings.contrast);
    settings.saturation = lerp(neutral.saturation, settings.saturation);
    settings.globalSaturation = lerp(
      neutral.globalSaturation,
      settings.globalSaturation
    );
    settings.shadowsHue = lerp(neutral.shadowsHue, settings.shadowsHue);
    settings.shadowsDensity = lerp(
      neutral.shadowsDensity,
      settings.shadowsDensity
    );
    settings.shadowsSaturation = lerp(
      neutral.shadowsSaturation,
      settings.shadowsSaturation
    );
    settings.shadowsValue = lerp(neutral.shadowsValue, settings.shadowsValue);
    settings.highlightsHue = lerp(neutral.highlightsHue, settings.highlightsHue);
    settings.highlightsDensity = lerp(
      neutral.highlightsDensity,
      settings.highlightsDensity
    );
    settings.highlightsSaturation = lerp(
      neutral.highlightsSaturation,
      settings.highlightsSaturation
    );
    settings.highlightsValue = lerp(
      neutral.highlightsValue,
      settings.highlightsValue
    );
    settings.fxaaEnabled = scale > 0 && settings.fxaaEnabled;

    PostFXConfig.settings = settings;
  }

  static apply(scene: Scene): DefaultRenderingPipeline | null {
    const camera = scene.activeCamera;
    if (!camera) {
      console.warn("[QA] PostFXConfig could not apply without an active camera.");
      return null;
    }

    PostFXConfig.dispose();

    const pipeline = new DefaultRenderingPipeline("hideout.postfx", true, scene, [camera]);
    const settings = PostFXConfig.settings;

    pipeline.bloomEnabled = settings.bloomEnabled;
    pipeline.bloomWeight = settings.bloomWeight;
    pipeline.bloomThreshold = settings.bloomThreshold;
    pipeline.bloomKernel = settings.bloomKernel;
    pipeline.fxaaEnabled = settings.fxaaEnabled;

    const imageProcessing = pipeline.imageProcessing;
    imageProcessing.exposure = settings.exposure;
    imageProcessing.contrast = settings.contrast;
    imageProcessing.colorSaturation = settings.saturation;
    imageProcessing.vignetteEnabled = true;
    imageProcessing.vignetteBlendMode = settings.vignetteBlendMode;
    imageProcessing.vignetteWeight = settings.vignetteWeight;
    imageProcessing.vignetteColor = settings.vignetteColor;

    const curves = new ColorCurves();
    curves.globalSaturation = settings.globalSaturation;
    curves.shadowsHue = settings.shadowsHue;
    curves.shadowsDensity = settings.shadowsDensity;
    curves.shadowsSaturation = settings.shadowsSaturation;
    curves.shadowsValue = settings.shadowsValue;
    curves.highlightsHue = settings.highlightsHue;
    curves.highlightsDensity = settings.highlightsDensity;
    curves.highlightsSaturation = settings.highlightsSaturation;
    curves.highlightsValue = settings.highlightsValue;
    imageProcessing.colorCurvesEnabled = true;
    imageProcessing.colorCurves = curves;

    PostFXConfig.pipeline = pipeline;
    return pipeline;
  }

  static dispose(): void {
    if (PostFXConfig.pipeline) {
      PostFXConfig.pipeline.dispose();
      PostFXConfig.pipeline = null;
    }
  }

  static reset(): void {
    PostFXConfig.settings = createDefaultSettings();
  }
}
