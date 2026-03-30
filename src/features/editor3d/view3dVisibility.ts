import type { Opening3dMeshSpec } from "@/core/domain/opening3dAssemblySpecs";
import type { ProfileMaterialType } from "@/core/domain/profile";
import type { Project } from "@/core/domain/project";
import type { CalculationSolidSpec } from "@/core/domain/wallCalculation3dSpecs";

import type { WallRenderMeshSpec } from "./wallMeshSpec";

function layerOn(v: boolean | undefined): boolean {
  return v !== false;
}

/** Слой оболочки стены (послойный профиль): OSB / EPS-подобные. */
export function isWallMeshSpecVisible(spec: WallRenderMeshSpec, project: Project): boolean {
  const vs = project.viewState;
  const mt = spec.materialType;
  if (mt === "osb") {
    return layerOn(vs.show3dLayerOsb);
  }
  if (mt === "eps" || mt === "xps" || mt === "insulation") {
    return layerOn(vs.show3dLayerEps);
  }
  if (mt === "default") {
    return layerOn(vs.show3dLayerOsb) || layerOn(vs.show3dLayerEps);
  }
  return layerOn(vs.show3dLayerOsb) || layerOn(vs.show3dLayerEps);
}

/** Расчётные объёмы: SIP/EPS и швы — категория EPS; пиломатериал — каркас. */
export function isCalculationSolidVisible(spec: CalculationSolidSpec, project: Project): boolean {
  const vs = project.viewState;
  switch (spec.source) {
    case "sip":
    case "sip_seam":
      return layerOn(vs.show3dLayerEps);
    case "lumber":
    case "lumber_seam":
      return layerOn(vs.show3dLayerFrame);
    default:
      return true;
  }
}

/** Окна и обрамление проёмов строятся из project.openings и openingFramingPieces. */
export function hasWindowGeometry3d(_project: Project): boolean {
  return true;
}

/** Видимость мешей из opening3dAssemblySpecs. */
export function isOpening3dMeshVisible(spec: Opening3dMeshSpec, project: Project): boolean {
  const vs = project.viewState;
  if (spec.kind === "opening_framing") {
    return vs.show3dLayerFrame !== false;
  }
  return vs.show3dLayerWindows !== false;
}

export function hasDoorGeometry3d(_project: Project): boolean {
  return false;
}

export type WallMeshMaterialCategory = "osb" | "eps" | "other";

export function wallMeshMaterialCategory(mt: ProfileMaterialType | "default"): WallMeshMaterialCategory {
  if (mt === "osb") {
    return "osb";
  }
  if (mt === "eps" || mt === "xps" || mt === "insulation") {
    return "eps";
  }
  return "other";
}
