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
  vignetteWeight: 0.35,  // reduced from 0.55 for less aggressive edge darkening
  vignetteColor: new Color3(0.05, 0.05, 0.07),
  vignetteBlendMode: ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY,
  exposure: 0.95,         // increased from 0.88 for better overall brightness
  contrast: 1.05,
  saturation: 0.9,
  globalSaturation: -12,
  shadowsHue: 210,
  shadowsDensity: 55,
  shadowsSaturation: 45,
  shadowsValue: -2,       // increased from -6 to reduce extreme shadow darkening
  highlightsHue: 40,
  highlightsDensity: 18,
  highlightsSaturation: 12,
  highlightsValue: 4,
  fxaaEnabled: false,
});

export class PostFXConfig {
  private static pipeline: DefaultRenderingPipeline | null = null;
  static settings: PostFXSettings = createDefaultSettings();

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
