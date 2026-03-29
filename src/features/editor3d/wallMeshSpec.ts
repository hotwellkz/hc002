import { getLayerById } from "@/core/domain/layerOps";
import { getProfileById, sortProfileLayersByOrder } from "@/core/domain/profileOps";
import type { Profile, ProfileMaterialType } from "@/core/domain/profile";
import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";

const MM_TO_M = 0.001;
const MIN_LEN_MM = 1;
const THICK_EPS_MM = 0.5;

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

/** Единичная нормаль к стене в плане XZ (перпендикуляр к оси), «слева» от направления start→end. */
function thicknessNormalUnit(sx: number, sy: number, ex: number, ey: number): { readonly nx: number; readonly nz: number; readonly lenMm: number } {
  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const lenMm = Math.hypot(dxMm, dyMm);
  if (lenMm < MIN_LEN_MM) {
    return { nx: 1, nz: 0, lenMm: 0 };
  }
  const nx = -dyMm / lenMm;
  const nz = dxMm / lenMm;
  return { nx, nz, lenMm };
}

function singleSolidSpec(
  wall: Wall,
  project: Project,
  materialType: ProfileMaterialType | "default",
): WallRenderMeshSpec | null {
  if (!(wall.thicknessMm > 0) || !(wall.heightMm > 0)) {
    return null;
  }
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { lenMm } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN_MM) {
    return null;
  }

  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const dxM = dxMm * MM_TO_M;
  const dzM = dyMm * MM_TO_M;
  const lenM = lenMm * MM_TO_M;
  const bottomMm = wallBottomElevationMm(wall, project);
  const heightMm = wall.heightMm;
  const halfH = (heightMm * MM_TO_M) / 2;
  const bottomM = bottomMm * MM_TO_M;

  const cx = ((sx + ex) * MM_TO_M) / 2;
  const cz = ((sy + ey) * MM_TO_M) / 2;
  const cy = bottomM + halfH;
  const rotationY = Math.atan2(dxM, dzM);

  return {
    reactKey: wall.id,
    wallId: wall.id,
    position: [cx, cy, cz],
    rotationY,
    width: wall.thicknessMm * MM_TO_M,
    height: heightMm * MM_TO_M,
    depth: lenM,
    materialType,
  };
}

/**
 * Профиль layered + включённый режим: отдельный бокс на каждый слой, без зазоров, сумма толщин = толщина стены.
 */
function layeredSpecsFromProfile(wall: Wall, project: Project, profile: Profile): WallRenderMeshSpec[] | null {
  if (!(wall.thicknessMm > 0) || !(wall.heightMm > 0)) {
    return null;
  }
  const sorted = sortProfileLayersByOrder([...profile.layers]);
  if (sorted.length < 2) {
    return null;
  }

  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { nx, nz, lenMm } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN_MM) {
    return null;
  }

  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const dxM = dxMm * MM_TO_M;
  const dzM = dyMm * MM_TO_M;
  const lenM = lenMm * MM_TO_M;
  const bottomMm = wallBottomElevationMm(wall, project);
  const heightMm = wall.heightMm;
  const halfH = (heightMm * MM_TO_M) / 2;
  const bottomM = bottomMm * MM_TO_M;
  const cy = bottomM + halfH;

  const cx0 = ((sx + ex) * MM_TO_M) / 2;
  const cz0 = ((sy + ey) * MM_TO_M) / 2;
  const rotationY = Math.atan2(dxM, dzM);

  const T = wall.thicknessMm;
  let raw = sorted.map((l) => Math.max(0, l.thicknessMm));
  let sum = raw.reduce((a, b) => a + b, 0);
  if (sum < 1e-6) {
    return null;
  }
  if (Math.abs(sum - T) > THICK_EPS_MM) {
    const k = T / sum;
    raw = raw.map((t) => t * k);
  }

  const out: WallRenderMeshSpec[] = [];
  let acc = -T / 2;
  for (let i = 0; i < sorted.length; i++) {
    const layer = sorted[i]!;
    const tMm = raw[i]!;
    if (tMm < 1e-6) {
      continue;
    }
    const centerOffMm = acc + tMm / 2;
    acc += tMm;

    const cx = cx0 + centerOffMm * MM_TO_M * nx;
    const cz = cz0 + centerOffMm * MM_TO_M * nz;

    out.push({
      reactKey: `${wall.id}-${layer.id}`,
      wallId: wall.id,
      layerId: layer.id,
      position: [cx, cy, cz],
      rotationY,
      width: tMm * MM_TO_M,
      height: heightMm * MM_TO_M,
      depth: lenM,
      materialType: layer.materialType,
    });
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

  const solid = singleSolidSpec(wall, project, solidMat);
  return solid ? [solid] : [];
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

export function wallsToMeshSpecs(project: Project, walls: readonly Wall[]): readonly WallRenderMeshSpec[] {
  const show = project.viewState.show3dProfileLayers !== false;
  return wallsToRenderSpecs(project, walls, show);
}
