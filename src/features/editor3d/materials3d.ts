import type { ProfileMaterialType } from "@/core/domain/profile";

/** Инженерный preview: цвет Three.js (hex), без внешних текстур. */
export interface MeshStandardPreset3d {
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
}

const FALLBACK: MeshStandardPreset3d = {
  color: 0x8a93a3,
  roughness: 0.52,
  metalness: 0.06,
};

const TABLE: Readonly<Record<ProfileMaterialType, MeshStandardPreset3d>> = {
  osb: { color: 0xb8956b, roughness: 0.62, metalness: 0.04 },
  eps: { color: 0xd8e4ec, roughness: 0.45, metalness: 0.02 },
  xps: { color: 0xc9e0ea, roughness: 0.4, metalness: 0.03 },
  wood: { color: 0xa67c52, roughness: 0.58, metalness: 0.03 },
  steel: { color: 0x9aa3ad, roughness: 0.35, metalness: 0.55 },
  gypsum: { color: 0xd4d6da, roughness: 0.65, metalness: 0.02 },
  concrete: { color: 0x7a8088, roughness: 0.85, metalness: 0.02 },
  membrane: { color: 0x5c6570, roughness: 0.55, metalness: 0.08 },
  insulation: { color: 0xe8ecf0, roughness: 0.48, metalness: 0.02 },
  custom: { ...FALLBACK },
};

export function meshStandardPresetForMaterialType(mt: ProfileMaterialType): MeshStandardPreset3d {
  return TABLE[mt] ?? FALLBACK;
}

export function meshStandardPresetForLayerOrDefault(mt: ProfileMaterialType | "default"): MeshStandardPreset3d {
  if (mt === "default") {
    return FALLBACK;
  }
  return meshStandardPresetForMaterialType(mt);
}
