export type BrushType =
  | "floor"
  | "wall"
  | "ramp"
  | "pillar"
  | "prop_crate"
  | "prop_bones"
  | "light_torch"
  | "light_fill"
  | "enemy_spawn"
  | "player_spawn";

export type LightParams = {
  color: [number, number, number];
  intensity: number;
  range: number;
};

export type PlacedEntity = {
  type: BrushType;
  pos: { x: number; y: number; z: number };
  rotY: number;
  scale: number;
  params?: LightParams;
};

export const DEFAULT_TORCH_LIGHT: LightParams = {
  color: [0.95, 0.58, 0.32],
  intensity: 0.9,
  range: 6,
};

export const DEFAULT_FILL_LIGHT: LightParams = {
  color: [0.52, 0.68, 0.95],
  intensity: 0.65,
  range: 14,
};
