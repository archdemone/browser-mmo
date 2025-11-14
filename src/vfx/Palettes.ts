export interface VfxPalette {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
}

const PALETTES: Record<string, VfxPalette> = {
  "warrior-steel": {
    id: "warrior-steel",
    label: "Warrior Steel",
    primary: "#f2f0e6",
    secondary: "#a8a4a0",
    accent: "#ffb347",
    neutral: "#3a352f",
  },
  ember: {
    id: "ember",
    label: "Ember",
    primary: "#ff7a2c",
    secondary: "#ffce85",
    accent: "#ffe066",
    neutral: "#5b3a29",
  },
  frost: {
    id: "frost",
    label: "Frost",
    primary: "#c8f1ff",
    secondary: "#91d7f0",
    accent: "#5fb8e9",
    neutral: "#274c59",
  },
  void: {
    id: "void",
    label: "Void",
    primary: "#b79bff",
    secondary: "#6c4cff",
    accent: "#ff66b3",
    neutral: "#1d1733",
  },
};

export function listPalettes(): VfxPalette[] {
  return Object.values(PALETTES);
}

export function getPalette(id?: string): VfxPalette {
  if (id && PALETTES[id]) {
    return PALETTES[id];
  }
  return PALETTES["warrior-steel"];
}

export function registerPalette(palette: VfxPalette): void {
  PALETTES[palette.id] = palette;
}

