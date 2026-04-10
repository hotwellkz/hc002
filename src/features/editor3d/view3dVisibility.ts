import type { Opening3dMeshSpec } from "@/core/domain/opening3dAssemblySpecs";
import type { ProfileMaterialType } from "@/core/domain/profile";
import type { Project } from "@/core/domain/project";
import type { CalculationSolidSpec } from "@/core/domain/wallCalculation3dSpecs";

import type { WallRenderMeshSpec } from "./wallMeshSpec";

function layerOn(v: boolean | undefined): boolean {
  return v !== false;
}

/** ГКЛ в модели профиля: `ProfileLayer.materialType === "gypsum"`. */
export function isProfileMaterialGypsumBoard(mt: ProfileMaterialType | "default"): boolean {
  return mt === "gypsum";
}

/** Слой оболочки стены (послойный профиль): OSB / EPS-подобные. */
export function isWallMeshSpecVisible(spec: WallRenderMeshSpec, project: Project): boolean {
  const vs = project.viewState;
  const mt = spec.materialType;
  if (isProfileMaterialGypsumBoard(mt)) {
    return layerOn(vs.show3dLayerGypsum);
  }
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

/** Расчётные объёмы: SIP/EPS — слой утеплителя; пиломатериал — каркас. */
export function isCalculationSolidVisible(spec: CalculationSolidSpec, project: Project): boolean {
  const vs = project.viewState;
  switch (spec.source) {
    case "sip":
      if (isProfileMaterialGypsumBoard(spec.materialType)) {
        return layerOn(vs.show3dLayerGypsum);
      }
      return layerOn(vs.show3dLayerEps);
    case "lumber":
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
  if (spec.kind === "door_leaf" || spec.kind === "door_frame" || spec.kind === "door_handle") {
    return vs.show3dLayerDoors !== false;
  }
  return vs.show3dLayerWindows !== false;
}

export function hasDoorGeometry3d(project: Project): boolean {
  return project.openings.some((o) => o.kind === "door" && o.wallId != null && o.offsetFromStartMm != null && o.isEmptyOpening !== true);
}

export type WallMeshMaterialCategory = "osb" | "eps" | "gypsum" | "other";

export function wallMeshMaterialCategory(mt: ProfileMaterialType | "default"): WallMeshMaterialCategory {
  if (mt === "osb") {
    return "osb";
  }
  if (mt === "eps" || mt === "xps" || mt === "insulation") {
    return "eps";
  }
  if (mt === "gypsum") {
    return "gypsum";
  }
  return "other";
}
