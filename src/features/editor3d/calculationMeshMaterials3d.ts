import { useEffect, useMemo } from "react";
import { FrontSide, MeshStandardMaterial } from "three";

import type { ProfileMaterialType } from "@/core/domain/profile";
import { meshStandardPresetForMaterialType } from "./materials3d";

/**
 * Один набор материалов на всю группу расчёта 3D: одинаковый wood/EPS для всех досок и панелей,
 * без сотен независимых meshStandardMaterial (и без расхождений по tone/shading).
 */
export function useSharedCalculationMeshMaterials(): {
  readonly lumber: MeshStandardMaterial;
  readonly eps: MeshStandardMaterial;
  readonly byMaterialType: ReadonlyMap<ProfileMaterialType, MeshStandardMaterial>;
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
    const byMaterialType = new Map<ProfileMaterialType, MeshStandardMaterial>();
    const all: ProfileMaterialType[] = ["osb", "eps", "xps", "wood", "steel", "gypsum", "concrete", "membrane", "insulation", "custom"];
    for (const mt of all) {
      if (mt === "wood") {
        byMaterialType.set(mt, lumber);
        continue;
      }
      if (mt === "eps") {
        byMaterialType.set(mt, eps);
        continue;
      }
      const p = meshStandardPresetForMaterialType(mt);
      byMaterialType.set(
        mt,
        new MeshStandardMaterial({
          color: p.color,
          roughness: p.roughness,
          metalness: p.metalness,
          side: FrontSide,
        }),
      );
    }
    return { lumber, eps, byMaterialType };
  }, []);

  useEffect(() => {
    return () => {
      mats.lumber.dispose();
      mats.eps.dispose();
      for (const m of mats.byMaterialType.values()) {
        if (m !== mats.lumber && m !== mats.eps) {
          m.dispose();
        }
      }
    };
  }, [mats]);

  return mats;
}
