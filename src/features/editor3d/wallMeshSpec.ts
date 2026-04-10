import { getLayerById } from "@/core/domain/layerOps";
import { getProfileById } from "@/core/domain/profileOps";
import type { Profile, ProfileMaterialType } from "@/core/domain/profile";
import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";
import { wallLengthMm } from "@/core/domain/wallCalculationGeometry";
import { openingSillLevelMm, openingTopLevelMmForShell } from "@/core/domain/doorGeometry";
import { subtractOpeningFacesFromWallRect, type WallOpeningFaceMm } from "@/core/domain/wallFaceOpeningSubdivide";
import { doorAlongWallOccupiedIntervalMm } from "@/core/domain/frameGklDoorAlongGeometry";
import {
  coreLayerNormalOffsetsMm,
  isInsulationCoreMaterial,
  resolveWallProfileLayerStripsMm,
} from "@/core/domain/wallProfileLayers";

const MM_TO_M = 0.001;
const MIN_LEN_MM = 1;

/**
 * План XY (мм) → Three.js Y-up: X, план Y → Z, вертикаль → Y.
 */
export interface WallRenderMeshSpec {
  /** Стабильный ключ для React (wallId или wallId+layerId). */
  readonly reactKey: string;
  readonly wallId: string;
  readonly layerId?: string;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly materialType: ProfileMaterialType | "default";
}

function wallBottomElevationMm(wall: Wall, project: Project): number {
  if (wall.baseElevationMm != null && Number.isFinite(wall.baseElevationMm)) {
    return wall.baseElevationMm;
  }
  return getLayerById(project, wall.layerId)?.elevationMm ?? 0;
}

/** Нормаль к толщине и единичный вектор вдоль стены в плане XZ. */
function thicknessNormalUnit(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): { readonly nx: number; readonly nz: number; readonly lenMm: number; readonly ux: number; readonly uy: number } {
  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const lenMm = Math.hypot(dxMm, dyMm);
  if (lenMm < MIN_LEN_MM) {
    return { nx: 1, nz: 0, lenMm: 0, ux: 1, uy: 0 };
  }
  const ux = dxMm / lenMm;
  const uy = dyMm / lenMm;
  const nx = -dyMm / lenMm;
  const nz = -dxMm / lenMm;
  return { nx, nz, lenMm, ux, uy };
}

function openingsOnWallFaceMm(wall: Wall, project: Project): WallOpeningFaceMm[] {
  const L = wallLengthMm(wall);
  const out: WallOpeningFaceMm[] = [];
  for (const o of project.openings) {
    if (o.wallId !== wall.id || o.offsetFromStartMm == null) {
      continue;
    }
    const sill = openingSillLevelMm(o);
    const alongIv = doorAlongWallOccupiedIntervalMm(o, wall, project);
    const lo = Math.max(0, alongIv.lo);
    const hi = Math.min(L, alongIv.hi);
    const y0 = Math.max(0, sill);
    const y1 = Math.min(wall.heightMm, openingTopLevelMmForShell(o));
    if (hi - lo < MIN_LEN_MM || y1 - y0 < MIN_LEN_MM) {
      continue;
    }
    out.push({ lo, hi, y0, y1 });
  }
  return out;
}

function singleSolidSpecs(
  wall: Wall,
  project: Project,
  materialType: ProfileMaterialType | "default",
): WallRenderMeshSpec[] {
  if (!(wall.thicknessMm > 0) || !(wall.heightMm > 0)) {
    return [];
  }
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { lenMm, ux, uy } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN_MM) {
    return [];
  }
  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const dxM = dxMm * MM_TO_M;
  const dzM = -dyMm * MM_TO_M;
  const bottomMm = wallBottomElevationMm(wall, project);
  const heightMm = wall.heightMm;
  const bottomM = bottomMm * MM_TO_M;
  const rotationY = Math.atan2(dxM, dzM);

  const openings = openingsOnWallFaceMm(wall, project);
  const rects = subtractOpeningFacesFromWallRect(lenMm, heightMm, openings);
  const out: WallRenderMeshSpec[] = [];
  let ri = 0;
  for (const r of rects) {
    const uMid = (r.u0 + r.u1) / 2;
    const yMid = (r.y0 + r.y1) / 2;
    const px = sx + ux * uMid;
    const py = sy + uy * uMid;
    const cx = px * MM_TO_M;
    const cz = -py * MM_TO_M;
    const cy = bottomM + yMid * MM_TO_M;
    const depth = (r.u1 - r.u0) * MM_TO_M;
    const h = (r.y1 - r.y0) * MM_TO_M;
    out.push({
      reactKey: openings.length ? `${wall.id}-shell-${ri++}` : wall.id,
      wallId: wall.id,
      position: [cx, cy, cz],
      rotationY,
      width: wall.thicknessMm * MM_TO_M,
      height: h,
      depth,
      materialType,
    });
  }
  return out;
}

/**
 * Профиль layered + включённый режим: отдельный бокс на каждый слой, без зазоров, сумма толщин = толщина стены.
 */
function wallHasSavedCalculation(project: Project, wallId: string): boolean {
  return project.wallCalculations.some((c) => c.wallId === wallId);
}

/**
 * При показе расчёта в 3D убираем непрерывный слой EPS из оболочки — его заменяют сегменты из wallCalculation.
 */
function shouldHideCoreInsulationStrip(
  project: Project,
  wall: Wall,
  profile: Profile,
  stripMaterial: ProfileMaterialType,
  stripOff0Mm: number,
  stripOff1Mm: number,
): boolean {
  if (project.viewState.show3dCalculation === false) {
    return false;
  }
  if (!wallHasSavedCalculation(project, wall.id)) {
    return false;
  }
  if (!isInsulationCoreMaterial(stripMaterial)) {
    return false;
  }
  const core = coreLayerNormalOffsetsMm(wall.thicknessMm, profile);
  if (!core) {
    return false;
  }
  const inter = Math.max(0, Math.min(stripOff1Mm, core.offEndMm) - Math.max(stripOff0Mm, core.offStartMm));
  const stripW = stripOff1Mm - stripOff0Mm;
  return stripW > 1e-6 && inter / stripW >= 0.45;
}

function layeredSpecsFromProfile(wall: Wall, project: Project, profile: Profile): WallRenderMeshSpec[] | null {
  if (!(wall.thicknessMm > 0) || !(wall.heightMm > 0)) {
    return null;
  }
  const strips = resolveWallProfileLayerStripsMm(wall.thicknessMm, profile);
  if (!strips || strips.length < 2) {
    return null;
  }

  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { nx, nz, lenMm, ux, uy } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN_MM) {
    return null;
  }

  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const dxM = dxMm * MM_TO_M;
  const dzM = -dyMm * MM_TO_M;
  const bottomMm = wallBottomElevationMm(wall, project);
  const heightMm = wall.heightMm;
  const bottomM = bottomMm * MM_TO_M;

  const rotationY = Math.atan2(dxM, dzM);

  const T = wall.thicknessMm;

  const out: WallRenderMeshSpec[] = [];
  let acc = -T / 2;
  let stripIdx = 0;
  for (const strip of strips) {
    const openings = openingsOnWallFaceMm(wall, project);
    const faceRects = subtractOpeningFacesFromWallRect(lenMm, heightMm, openings);
    const tMm = strip.thicknessMm;
    if (tMm < 1e-6) {
      continue;
    }
    const stripOff0Mm = acc;
    const stripOff1Mm = acc + tMm;
    const centerOffMm = acc + tMm / 2;
    acc += tMm;

    if (shouldHideCoreInsulationStrip(project, wall, profile, strip.materialType, stripOff0Mm, stripOff1Mm)) {
      continue;
    }

    let ri = 0;
    for (const r of faceRects) {
      const uMid = (r.u0 + r.u1) / 2;
      const yMid = (r.y0 + r.y1) / 2;
      const px = sx + ux * uMid;
      const py = sy + uy * uMid;
      const cx = px * MM_TO_M + centerOffMm * MM_TO_M * nx;
      const cz = -py * MM_TO_M + centerOffMm * MM_TO_M * nz;
      const cySub = bottomM + yMid * MM_TO_M;
      const depth = (r.u1 - r.u0) * MM_TO_M;
      const h = (r.y1 - r.y0) * MM_TO_M;
      out.push({
        reactKey:
          openings.length > 0
            ? `${wall.id}-${strip.layerId}-${stripIdx}-${ri++}`
            : `${wall.id}-${strip.layerId}`,
        wallId: wall.id,
        layerId: strip.layerId,
        position: [cx, cySub, cz],
        rotationY,
        width: tMm * MM_TO_M,
        height: h,
        depth,
        materialType: strip.materialType,
      });
    }
    stripIdx += 1;
  }

  return out.length > 0 ? out : null;
}

function resolveSolidMaterialType(profile: Profile | undefined): ProfileMaterialType | "default" {
  if (!profile?.layers.length) {
    return "default";
  }
  return profile.layers[0]!.materialType;
}

/**
 * Все меши для одной стены (один при solid / упрощённо, несколько при layered+показ слоёв).
 */
export function wallToRenderSpecs(wall: Wall, project: Project, showProfileLayers: boolean): readonly WallRenderMeshSpec[] {
  const profile = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
  const solidMat = resolveSolidMaterialType(profile);

  if (showProfileLayers && profile?.compositionMode === "layered" && profile.layers.length >= 2) {
    const layered = layeredSpecsFromProfile(wall, project, profile);
    if (layered && layered.length > 0) {
      return layered;
    }
  }

  return singleSolidSpecs(wall, project, solidMat);
}

export function wallsToRenderSpecs(project: Project, walls: readonly Wall[], showProfileLayers: boolean): readonly WallRenderMeshSpec[] {
  const out: WallRenderMeshSpec[] = [];
  for (const w of walls) {
    out.push(...wallToRenderSpecs(w, project, showProfileLayers));
  }
  return out;
}

/** Упрощённый режим: один меш на стену (как раньше). */
export function wallToMeshSpec(wall: Wall, project: Project): WallRenderMeshSpec | null {
  const specs = wallToRenderSpecs(wall, project, false);
  return specs[0] ?? null;
}

/** Первый меш для совместимости; при проёмах может быть несколько сегментов — см. wallToRenderSpecs. */

export function wallsToMeshSpecs(project: Project, walls: readonly Wall[]): readonly WallRenderMeshSpec[] {
  const show = project.viewState.show3dProfileLayers !== false;
  return wallsToRenderSpecs(project, walls, show);
}
