import {
  SkillComponent,
  SkillData,
  VfxDefaults,
} from "../skills/skills.schema";
import {
  ImpactDecalPreset,
  ParticleBurstPreset,
  ResolvedVfxSet,
  ScreenShakePreset,
  TrailPreset,
  buildVfxCommands,
  ShockwavePreset,
} from "./VfxPrimitives";
import { VfxPalette, getPalette } from "./Palettes";

export type VfxSource = "none" | "skillDefault" | "componentOverride" | "live";

export interface ResolvedField<T> {
  value?: T;
  source: VfxSource;
}

export interface ResolvedComponentVfx {
  palette: ResolvedField<VfxPalette>;
  impact: ResolvedField<ImpactDecalPreset>;
  particles: ResolvedField<ParticleBurstPreset>;
  trail: ResolvedField<TrailPreset>;
  shockwave: ResolvedField<ShockwavePreset>;
  screenShake: ResolvedField<ScreenShakePreset>;
  resolvedSet: ResolvedVfxSet;
}

export interface LiveVfxOverrides {
  palette?: string;
  impact?: VfxDefaults["impact"];
  particles?: VfxDefaults["particles"];
  trail?: VfxDefaults["trail"];
  screenShake?: VfxDefaults["screenShake"];
}

export function resolveComponentVfx(
  skill: SkillData,
  component: SkillComponent,
  liveOverrides: LiveVfxOverrides = {}
): ResolvedComponentVfx {
  const skillDefaults = skill.vfxDefaults ?? {};
  const componentOverrides = component.vfxOverrides ?? {};

  const paletteField = resolvePaletteField(
    skillDefaults.palette,
    componentOverrides.palette,
    liveOverrides.palette
  );

  const palette = paletteField.value ?? getPalette();

  const impactField = resolveImpact(
    palette,
    skillDefaults.impact,
    componentOverrides.impact,
    liveOverrides.impact
  );

  const trailField = resolveTrail(
    palette,
    skillDefaults.trail,
    componentOverrides.trail,
    liveOverrides.trail
  );

  const particlesField = resolveParticles(
    palette,
    skillDefaults.particles,
    componentOverrides.particles,
    liveOverrides.particles
  );

  const screenShakeField = resolveScreenShake(
    skillDefaults.screenShake,
    componentOverrides.screenShake,
    liveOverrides.screenShake
  );

  const shockwaveField = resolveShockwave(
    palette,
    component,
    impactField.value
  );

  const resolvedSet = buildVfxCommands({
    paletteId: palette.id,
    impact: impactField.value,
    particles: particlesField.value,
    trail: trailField.value,
    shockwave: shockwaveField.value,
    screenShake: screenShakeField.value,
  });

  return {
    palette: paletteField,
    impact: impactField,
    particles: particlesField,
    trail: trailField,
    shockwave: shockwaveField,
    screenShake: screenShakeField,
    resolvedSet,
  };
}

function resolvePaletteField(
  skillPalette?: string,
  componentPalette?: string,
  livePalette?: string
): ResolvedField<VfxPalette> {
  if (livePalette) {
    return { value: getPalette(livePalette), source: "live" };
  }
  if (componentPalette) {
    return { value: getPalette(componentPalette), source: "componentOverride" };
  }
  if (skillPalette) {
    return { value: getPalette(skillPalette), source: "skillDefault" };
  }
  return { value: getPalette(), source: "none" };
}

type ImpactConfig = VfxDefaults["impact"];
type TrailConfig = VfxDefaults["trail"];
type ParticleConfig = VfxDefaults["particles"];
type ScreenShakeConfig = VfxDefaults["screenShake"];

function resolveImpact(
  palette: VfxPalette,
  skillImpact?: ImpactConfig,
  componentImpact?: ImpactConfig,
  liveImpact?: ImpactConfig
): ResolvedField<ImpactDecalPreset> {
  const value =
    liveImpact ?? componentImpact ?? skillImpact;
  if (!value) {
    return { source: "none" };
  }
  const source: VfxSource = liveImpact
    ? "live"
    : componentImpact
    ? "componentOverride"
    : "skillDefault";

  const preset: ImpactDecalPreset = {
    type: "impactDecal",
    shape: value.type,
    size: value.size,
    color: value.color ?? palette.accent,
    duration: 0.6,
    fadeOut: 0.2,
  };

  return { value: preset, source };
}

function resolveParticles(
  palette: VfxPalette,
  skillParticles?: ParticleConfig,
  componentParticles?: ParticleConfig,
  liveParticles?: ParticleConfig
): ResolvedField<ParticleBurstPreset> {
  const value =
    liveParticles ?? componentParticles ?? skillParticles;
  if (!value) {
    return { source: "none" };
  }
  const source: VfxSource = liveParticles
    ? "live"
    : componentParticles
    ? "componentOverride"
    : "skillDefault";

  const preset: ParticleBurstPreset = {
    type: "particleBurst",
    count: value.count,
    size: value.size,
    lifetime: value.lifetime,
    spread: 45,
    speed: 6,
    color: palette.primary,
  };

  return { value: preset, source };
}

function resolveTrail(
  palette: VfxPalette,
  skillTrail?: TrailConfig,
  componentTrail?: TrailConfig,
  liveTrail?: TrailConfig
): ResolvedField<TrailPreset> {
  const value =
    liveTrail ?? componentTrail ?? skillTrail;
  if (!value) {
    return { source: "none" };
  }
  const source: VfxSource = liveTrail
    ? "live"
    : componentTrail
    ? "componentOverride"
    : "skillDefault";

  const preset: TrailPreset = {
    type: "trail",
    width: value.width,
    duration: value.duration,
    color: palette.secondary,
  };

  return { value: preset, source };
}

function resolveScreenShake(
  skillShake?: ScreenShakeConfig,
  componentShake?: ScreenShakeConfig,
  liveShake?: ScreenShakeConfig
): ResolvedField<ScreenShakePreset> {
  const value =
    liveShake ?? componentShake ?? skillShake;
  if (!value) {
    return { source: "none" };
  }
  const source: VfxSource = liveShake
    ? "live"
    : componentShake
    ? "componentOverride"
    : "skillDefault";

  const preset: ScreenShakePreset = {
    type: "screenShake",
    amplitude: value.amplitude,
    duration: value.duration,
  };

  return { value: preset, source };
}

function resolveShockwave(
  palette: VfxPalette,
  component: SkillComponent,
  impact?: ImpactDecalPreset
): ResolvedField<ShockwavePreset> {
  if (impact && impact.shape === "burst") {
    return {
      value: {
        type: "shockwave",
        radius: impact.size,
        thickness: 0.2,
        duration: impact.duration,
        color: impact.color ?? palette.accent,
      },
      source: "componentOverride",
    };
  }

  if (component.shape?.type === "ring") {
    return {
      value: {
        type: "shockwave",
        radius: component.shape.outer,
        thickness: component.shape.outer - component.shape.inner,
        duration: 0.6,
        color: palette.accent,
      },
      source: "none",
    };
  }

  return { source: "none" };
}
