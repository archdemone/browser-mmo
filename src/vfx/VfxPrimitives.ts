import { VfxPalette, getPalette } from "./Palettes";

export type VfxPrimitiveType =
  | "impactDecal"
  | "particleBurst"
  | "trail"
  | "shockwave"
  | "screenShake";

export interface ImpactDecalPreset {
  type: "impactDecal";
  shape: "circle" | "line" | "burst";
  size: number;
  color: string;
  duration: number;
  fadeOut?: number;
}

export interface ParticleBurstPreset {
  type: "particleBurst";
  count: number;
  size: number;
  lifetime: number;
  speed?: number;
  spread?: number;
  color?: string;
}

export interface TrailPreset {
  type: "trail";
  width: number;
  duration: number;
  color?: string;
}

export interface ShockwavePreset {
  type: "shockwave";
  radius: number;
  thickness: number;
  duration: number;
  color?: string;
}

export interface ScreenShakePreset {
  type: "screenShake";
  amplitude: number;
  duration: number;
}

export type VfxPrimitive =
  | ImpactDecalPreset
  | ParticleBurstPreset
  | TrailPreset
  | ShockwavePreset
  | ScreenShakePreset;

export interface VfxCommand<T extends VfxPrimitiveType = VfxPrimitiveType> {
  primitive: T;
  payload: Extract<VfxPrimitive, { type: T }>;
}

export interface VfxContext {
  queue(command: VfxCommand): void;
  now(): number;
}

export interface ResolvedVfxSet {
  palette: VfxPalette;
  commands: VfxCommand[];
}

export function playImpactDecal(
  context: VfxContext,
  preset: ImpactDecalPreset
): void {
  context.queue({ primitive: "impactDecal", payload: preset });
}

export function playParticleBurst(
  context: VfxContext,
  preset: ParticleBurstPreset
): void {
  context.queue({ primitive: "particleBurst", payload: preset });
}

export function playTrail(
  context: VfxContext,
  preset: TrailPreset
): void {
  context.queue({ primitive: "trail", payload: preset });
}

export function playShockwave(
  context: VfxContext,
  preset: ShockwavePreset
): void {
  context.queue({ primitive: "shockwave", payload: preset });
}

export function playScreenShake(
  context: VfxContext,
  preset: ScreenShakePreset
): void {
  context.queue({ primitive: "screenShake", payload: preset });
}

export interface ComponentVfxConfig {
  paletteId?: string;
  impact?: ImpactDecalPreset;
  particles?: ParticleBurstPreset;
  trail?: TrailPreset;
  shockwave?: ShockwavePreset;
  screenShake?: ScreenShakePreset;
}

export function buildVfxCommands(config: ComponentVfxConfig): ResolvedVfxSet {
  const palette = getPalette(config.paletteId);
  const commands: VfxCommand[] = [];
  if (config.impact) {
    commands.push({ primitive: "impactDecal", payload: config.impact });
  }
  if (config.particles) {
    commands.push({ primitive: "particleBurst", payload: config.particles });
  }
  if (config.trail) {
    commands.push({ primitive: "trail", payload: config.trail });
  }
  if (config.shockwave) {
    commands.push({ primitive: "shockwave", payload: config.shockwave });
  }
  if (config.screenShake) {
    commands.push({ primitive: "screenShake", payload: config.screenShake });
  }

  return { palette, commands };
}

