import { useEffect, useMemo } from "react";
import { FrontSide, MeshStandardMaterial } from "three";

import { meshStandardPresetForMaterialType } from "./materials3d";

/**
 * Один набор материалов на всю группу расчёта 3D: одинаковый wood/EPS для всех досок и панелей,
 * без сотен независимых meshStandardMaterial (и без расхождений по tone/shading).
 */
export function useSharedCalculationMeshMaterials(): {
  readonly lumber: MeshStandardMaterial;
  readonly eps: MeshStandardMaterial;
} {
  const mats = useMemo(() => {
    const w = meshStandardPresetForMaterialType("wood");
    const e = meshStandardPresetForMaterialType("eps");
    const lumber = new MeshStandardMaterial({
      color: w.color,
      roughness: Math.min(0.78, w.roughness + 0.12),
      metalness: w.metalness,
      side: FrontSide,
    });
    const eps = new MeshStandardMaterial({
      color: e.color,
      roughness: e.roughness,
      metalness: e.metalness,
      side: FrontSide,
    });
    return { lumber, eps };
  }, []);

  useEffect(() => {
    return () => {
      mats.lumber.dispose();
      mats.eps.dispose();
    };
  }, [mats]);

  return mats;
}
