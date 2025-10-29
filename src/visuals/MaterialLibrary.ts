import {
  AbstractMesh,
  Color3,
  PBRMaterial,
  Scene,
  Texture,
  TransformNode,
} from "babylonjs";

type ColorTuple = [number, number, number];

interface StoneFloorMaterialConfig {
  materialName?: string;
  albedoTexture: string;
  normalTexture: string;
  roughnessTexture: string;
  albedoTint?: ColorTuple;
  metallic?: number;
  roughness?: number;
  uvScale?: number;
  uvOffset?: [number, number];
  brokenVariant?: {
    albedoTint?: ColorTuple;
    emissiveTint?: ColorTuple;
  };
}

interface PaladinMaterialDefinition {
  key: string;
  meshNames: string[];
  albedoTint?: ColorTuple;
  metallic?: number;
  roughness?: number;
  maskTexture?: string;
  maskIntensity?: number;
}

interface PaladinArmorMaterialConfig {
  definitions: PaladinMaterialDefinition[];
}

interface StoneFloorMaterialSet {
  base: PBRMaterial;
  broken: PBRMaterial;
}

const STONE_CONFIG_PATH = "/assets/materials/stone_floor.mat.json";
const PALADIN_CONFIG_PATH = "/assets/materials/paladin_armor.mat.json";

const jsonCache = new Map<string, Promise<any>>();
const textureCache = new Map<string, Texture>();

async function loadConfig<TConfig>(path: string): Promise<TConfig> {
  let cached = jsonCache.get(path);
  if (!cached) {
    cached = fetch(path).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load material config at ${path}`);
      }
      return response.json();
    });
    jsonCache.set(path, cached);
  }
  return cached as Promise<TConfig>;
}

function loadTexture(scene: Scene, url: string): Texture {
  const cached = textureCache.get(url);
  if (cached && cached.isReadyOrNotBlocking()) {
    return cached;
  }

  const texture = new Texture(url, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE, undefined, undefined, undefined, false);
  textureCache.set(url, texture);
  return texture;
}

function applyUvTransform(texture: Texture | null, scale: number, offset?: [number, number]): void {
  if (!texture) {
    return;
  }

  texture.uScale = scale;
  texture.vScale = scale;
  if (offset) {
    texture.uOffset = offset[0];
    texture.vOffset = offset[1];
  }
}

function toColor(values: ColorTuple | undefined, fallback: Color3): Color3 {
  if (!values) {
    return fallback;
  }
  return Color3.FromArray(values);
}


export class MaterialLibrary {
  static async buildStoneFloorMaterials(scene: Scene): Promise<StoneFloorMaterialSet> {
    const config = await loadConfig<StoneFloorMaterialConfig>(STONE_CONFIG_PATH);
    const uvScale = config.uvScale ?? 1;
    const uvOffset = config.uvOffset;

    const baseMaterial = new PBRMaterial(config.materialName ?? "hideout.stoneFloor", scene);
    baseMaterial.albedoColor = toColor(config.albedoTint, new Color3(0.22, 0.22, 0.26));
    baseMaterial.metallic = config.metallic ?? 0.05;
    baseMaterial.roughness = config.roughness ?? 0.9;
    baseMaterial.environmentIntensity = 0.8;

    // Swap these PNGs in assets/textures later when we get the real stone scans.
    const albedo = loadTexture(scene, config.albedoTexture);
    baseMaterial.albedoTexture = albedo;
    const normal = loadTexture(scene, config.normalTexture);
    baseMaterial.bumpTexture = normal;
    const roughness = loadTexture(scene, config.roughnessTexture);
    roughness.gammaSpace = false;
    baseMaterial.metallicTexture = roughness;
    // Use green channel for roughness, blue for metallness (standard PBR setup)
    baseMaterial.useRoughnessFromMetallicTextureGreen = true;
    baseMaterial.useMetallnessFromMetallicTextureBlue = true;

    applyUvTransform(albedo, uvScale, uvOffset);
    applyUvTransform(normal, uvScale, uvOffset);
    applyUvTransform(roughness, uvScale, uvOffset);

    const brokenClone = baseMaterial.clone(`${baseMaterial.name}.broken`);
    const brokenMaterial = brokenClone instanceof PBRMaterial ? brokenClone : baseMaterial;
    brokenMaterial.albedoColor = toColor(
      config.brokenVariant?.albedoTint,
      baseMaterial.albedoColor.scale(0.92)
    );

    if (config.brokenVariant?.emissiveTint) {
      brokenMaterial.emissiveColor = Color3.FromArray(config.brokenVariant.emissiveTint);
    }

    return {
      base: baseMaterial,
      broken: brokenMaterial,
    };
  }

  static async applyPaladinMaterials(scene: Scene, root: TransformNode): Promise<void> {
    const config = await loadConfig<PaladinArmorMaterialConfig>(PALADIN_CONFIG_PATH);
    const meshes = root.getChildMeshes(false);

    const source = meshes.find((mesh) => mesh.material instanceof PBRMaterial)?.material as
      | PBRMaterial
      | undefined;

    if (!source) {
      console.warn("[MaterialLibrary] Unable to locate paladin base material");
      return;
    }

    const baseAlbedo = source.albedoTexture as Texture | null;
    const baseNormal = source.bumpTexture as Texture | null;
    const baseAmbient = source.ambientTexture as Texture | null;

    const built = new Map<string, PBRMaterial>();

    for (const def of config.definitions ?? []) {
      if (built.has(def.key)) {
        continue;
      }

      const material = new PBRMaterial(`paladin.${def.key}`, scene);
      material.albedoColor = toColor(def.albedoTint, Color3.White());
      material.backFaceCulling = true;
      material.environmentIntensity = 0.85;

      if (baseAlbedo) {
        material.albedoTexture = baseAlbedo;
      }
      if (baseNormal) {
        material.bumpTexture = baseNormal;
      }
      if (baseAmbient) {
        material.ambientTexture = baseAmbient;
      }

      material.metallic = def.metallic ?? source.metallic ?? 0.4;
      material.roughness = def.roughness ?? source.roughness ?? 0.6;

      if (def.maskTexture) {
        const mask = loadTexture(scene, def.maskTexture);
        mask.level = def.maskIntensity ?? 1;
        material.metallicTexture = mask;
        // Use standard channel mapping: blue for metallness, green for roughness
        material.useMetallnessFromMetallicTextureBlue = true;
        material.useRoughnessFromMetallicTextureGreen = true;
      }

      built.set(def.key, material);

      for (const mesh of meshes) {
        if (!(mesh instanceof AbstractMesh)) {
          continue;
        }

        if (def.meshNames.includes(mesh.name)) {
          mesh.material = material;
        }
      }
    }

    try {
      source.dispose(false, false);
    } catch (error) {
      console.warn("[MaterialLibrary] Failed to dispose source paladin material", error);
    }

    // To adjust how shiny each armor plate is, tweak paladin_armor.mat.json without touching code.
  }
}
