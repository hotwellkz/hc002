/**
 * Ортогональный фасад здания: проекция на вертикальную плоскость (2D-отчёт, не 3D-скриншот).
 */

import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";
import { isOpeningPlacedOnWall } from "@/core/domain/opening";
import { wallPointAtAlongFromStartMm } from "@/core/domain/openingPlacement";
import { computeLayerVerticalStack, slabWorldTopMm, wallWorldBottomMmFromMap } from "@/core/domain/layerVerticalStack";
import { computedLayerBaseMm } from "@/core/domain/layerVerticalStack";
import type { FoundationPileEntity } from "@/core/domain/foundationPile";
import type { FoundationStripEntity } from "@/core/domain/foundationStrip";
import {
  foundationStripOrthoRingFootprintContoursFromEntityMm,
  foundationStripSegmentFootprintQuadMm,
} from "@/core/domain/foundationStripGeometry";
import { roofSlopeVerticesThreeMm, roofAssemblyZAdjustMmByPlaneIdForProject, roofLayerBaseMmForPlane } from "@/core/geometry/roofAssemblyGeometry3d";
import { layerIdsForSnapGeometry } from "@/core/geometry/snap2dPrimitives";
import type { Point2D } from "@/core/geometry/types";
import { quadCornersAlongWallMm } from "@/features/editor2d/wallPlanGeometry2d";
import { wallLengthMm } from "@/core/domain/wallCalculationGeometry";

import { convexHull2D, planPointAndZToElevationUv, roofThreeMmToElevationUv, type ElevationCardinal } from "../geometry/elevation2d";
import type { ReportPrimitive } from "../types";
import {
  ELEV_FOUNDATION_MM,
  ELEV_GROUND_MM,
  ELEV_OPENING_MM,
  ELEV_OUTLINE_MM,
  ELEV_ROOF_MM,
  ELEV_SLAB_MM,
  ELEV_WALL_MAIN_MM,
} from "./elevationStrokeConstants";

export interface BuildingElevationWorldBuild {
  readonly primitives: readonly ReportPrimitive[];
  readonly worldBounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } | null;
  readonly messages: readonly string[];
}

function buildingPlanCentroid(project: Project, layerIds: ReadonlySet<string>): Point2D | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const w of project.walls) {
    if (!layerIds.has(w.layerId)) {
      continue;
    }
    sx += (w.start.x + w.end.x) / 2;
    sy += (w.start.y + w.end.y) / 2;
    n += 1;
  }
  if (n < 1) {
    return null;
  }
  return { x: sx / n, y: sy / n };
}

/** Нормаль «наружу» относительно центра контура (выпуклая оболочка плана). */
function wallOutwardPlanNormal(wall: Wall, centroid: Point2D): { readonly nx: number; readonly ny: number } {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    return { nx: 1, ny: 0 };
  }
  const px = -dy / len;
  const py = dx / len;
  const mx = (wall.start.x + wall.end.x) / 2;
  const my = (wall.start.y + wall.end.y) / 2;
  const dot = (mx - centroid.x) * px + (my - centroid.y) * py;
  return dot >= 0 ? { nx: px, ny: py } : { nx: -px, ny: -py };
}

/** Камера смотрит в план вдоль этого вектора (внутрь сцены). */
function cameraForwardPlan(facing: ElevationCardinal): { readonly dx: number; readonly dy: number } {
  switch (facing) {
    case "front":
      return { dx: 0, dy: 1 };
    case "back":
      return { dx: 0, dy: -1 };
    case "right":
      return { dx: -1, dy: 0 };
    case "left":
      return { dx: 1, dy: 0 };
    default: {
      const _e: never = facing;
      return _e;
    }
  }
}

function wallFaceVisibleForElevation(
  wall: Wall,
  centroid: Point2D,
  facing: ElevationCardinal,
): boolean {
  const n = wallOutwardPlanNormal(wall, centroid);
  const cf = cameraForwardPlan(facing);
  /** Наружная нормаль должна быть направлена к наблюдателю: против направления луча в сцену. */
  const dot = n.nx * -cf.dx + n.ny * -cf.dy;
  return dot > 0.12;
}

function boundsUnionPoint(
  b: { minX: number; minY: number; maxX: number; maxY: number } | null,
  x: number,
  y: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!b) {
    return { minX: x, minY: y, maxX: x, maxY: y };
  }
  return {
    minX: Math.min(b.minX, x),
    minY: Math.min(b.minY, y),
    maxX: Math.max(b.maxX, x),
    maxY: Math.max(b.maxY, y),
  };
}

function pushPolylineClosed(
  out: ReportPrimitive[],
  pts: readonly Point2D[],
  strokeMm: number,
  muted?: boolean,
): void {
  if (pts.length < 2) {
    return;
  }
  out.push({
    kind: "polyline",
    pointsMm: [...pts],
    closed: true,
    strokeMm,
    muted,
  });
}

function pushRectUv(out: ReportPrimitive[], u0: number, v0: number, u1: number, v1: number, strokeMm: number): void {
  const loU = Math.min(u0, u1);
  const hiU = Math.max(u0, u1);
  const loV = Math.min(v0, v1);
  const hiV = Math.max(v0, v1);
  if (hiU - loU < 1e-6 || hiV - loV < 1e-6) {
    return;
  }
  out.push({
    kind: "polyline",
    pointsMm: [
      { x: loU, y: loV },
      { x: hiU, y: loV },
      { x: hiU, y: hiV },
      { x: loU, y: hiV },
    ],
    closed: true,
    strokeMm,
  });
}

/**
 * Силуэт ленты/ростверка на фасаде: верх и низ по глубине сущности, из реального контура в плане.
 */
function pushFoundationStripElevation(
  out: ReportPrimitive[],
  strip: FoundationStripEntity,
  facing: ElevationCardinal,
  project: Project,
): void {
  const z0 = computedLayerBaseMm(project, strip.layerId);
  const z1 = z0 - strip.depthMm;

  let footprint: readonly Point2D[];
  if (strip.kind === "ortho_ring") {
    const { outer } = foundationStripOrthoRingFootprintContoursFromEntityMm(strip);
    footprint = outer;
  } else if (strip.kind === "footprint_poly") {
    footprint = strip.outerRingMm;
    for (const h of strip.holeRingsMm) {
      if (h.length < 3) {
        continue;
      }
      const holeUv = h.map((p) => planPointAndZToElevationUv(p.x, p.y, z0, facing));
      pushPolylineClosed(out, holeUv, ELEV_FOUNDATION_MM, true);
      if (Math.abs(z1 - z0) > 1e-3) {
        const holeUvLo = h.map((p) => planPointAndZToElevationUv(p.x, p.y, z1, facing));
        pushPolylineClosed(out, holeUvLo, ELEV_FOUNDATION_MM, true);
      }
    }
  } else {
    footprint = foundationStripSegmentFootprintQuadMm(
      strip.axisStart,
      strip.axisEnd,
      strip.outwardNormalX,
      strip.outwardNormalY,
      strip.sideOutMm,
      strip.sideInMm,
    );
  }

  if (footprint.length < 2) {
    return;
  }
  const uv: Point2D[] = [];
  for (const p of footprint) {
    uv.push(planPointAndZToElevationUv(p.x, p.y, z0, facing));
    uv.push(planPointAndZToElevationUv(p.x, p.y, z1, facing));
  }
  pushPolylineClosed(out, convexHull2D(uv), ELEV_FOUNDATION_MM, true);
}

/**
 * Собирает примитивы фасада: ось X отчёта — u (горизонталь), ось Y отчёта — высота v (мир Z вверх).
 */
export function buildBuildingElevationWorld(project: Project, facing: ElevationCardinal): BuildingElevationWorldBuild {
  const primitives: ReportPrimitive[] = [];
  const messages: string[] = [];
  const layerIds = layerIdsForSnapGeometry(project);
  const vMap = computeLayerVerticalStack(project);
  const zAdj = roofAssemblyZAdjustMmByPlaneIdForProject(project);
  const centroid = buildingPlanCentroid(project, layerIds);

  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const roofPlanesReport = project.roofPlanes.filter((r) => layerIds.has(r.layerId));
  if (walls.length === 0 && roofPlanesReport.length === 0) {
    return {
      primitives: [],
      worldBounds: null,
      messages: ["Нет стен или крыши на слоях, не скрытых в списке слоёв — фасад не построен."],
    };
  }

  if (centroid == null) {
    messages.push("Не удалось оценить центр контура — видимость граней упрощена.");
  }

  /** --- Крыша (силуэт скатов) --- */
  let roofSilhouetteAdded = false;
  for (const rp of roofPlanesReport) {
    const layerBase = roofLayerBaseMmForPlane(project, rp.layerId);
    const za = zAdj.get(rp.id) ?? 0;
    const { verts } = roofSlopeVerticesThreeMm(rp, layerBase, za);
    const uv = verts.map((t) => roofThreeMmToElevationUv(t[0]!, t[1]!, t[2]!, facing));
    const hull = convexHull2D(uv);
    if (hull.length >= 3) {
      pushPolylineClosed(primitives, hull, ELEV_ROOF_MM);
      roofSilhouetteAdded = true;
    } else if (hull.length === 2) {
      primitives.push({
        kind: "line",
        x1Mm: hull[0]!.x,
        y1Mm: hull[0]!.y,
        x2Mm: hull[1]!.x,
        y2Mm: hull[1]!.y,
        strokeMm: ELEV_ROOF_MM,
      });
      roofSilhouetteAdded = true;
    }
  }

  if (project.roofPlanes.length > 0) {
    if (roofPlanesReport.length === 0) {
      messages.push(
        "Скаты крыши лежат только на слоях с отключённой видимостью в списке слоёв — на фасаде контур кровли отсутствует. Включите слой крыши.",
      );
    } else if (!roofSilhouetteAdded) {
      messages.push("Не удалось построить силуэт крыши для фасада — проверьте контуры скатов и углы наклона.");
    }
  }

  /** --- Стены --- */
  for (const wall of walls) {
    const zb = wallWorldBottomMmFromMap(wall, vMap, project);
    const zTop = zb + wall.heightMm;
    const sx = wall.start.x;
    const sy = wall.start.y;
    const ex = wall.end.x;
    const ey = wall.end.y;
    const t = wall.thicknessMm;
    const corners = quadCornersAlongWallMm(sx, sy, ex, ey, -t / 2, t / 2);
    if (!corners || corners.length < 4) {
      continue;
    }
    const pts3d: Point2D[] = [];
    for (const c of corners) {
      pts3d.push(planPointAndZToElevationUv(c.x, c.y, zb, facing));
      pts3d.push(planPointAndZToElevationUv(c.x, c.y, zTop, facing));
    }
    const hull = convexHull2D(pts3d);
    const stroke = ELEV_WALL_MAIN_MM;
    if (hull.length >= 3) {
      pushPolylineClosed(primitives, hull, ELEV_OUTLINE_MM);
    } else if (hull.length === 2) {
      primitives.push({
        kind: "line",
        x1Mm: hull[0]!.x,
        y1Mm: hull[0]!.y,
        x2Mm: hull[1]!.x,
        y2Mm: hull[1]!.y,
        strokeMm: stroke,
      });
    }
  }

  /** --- Проёмы (на видимых гранях) --- */
  if (centroid) {
    for (const o of project.openings) {
      if (!isOpeningPlacedOnWall(o)) {
        continue;
      }
      const wall = project.walls.find((w) => w.id === o.wallId);
      if (!wall || !layerIds.has(wall.layerId)) {
        continue;
      }
      if (!wallFaceVisibleForElevation(wall, centroid, facing)) {
        continue;
      }
      const zb = wallWorldBottomMmFromMap(wall, vMap, project);
      const L = wallLengthMm(wall);
      if (L < 1e-6) {
        continue;
      }
      const off = o.offsetFromStartMm!;
      const p0 = wallPointAtAlongFromStartMm(wall, off);
      const p1 = wallPointAtAlongFromStartMm(wall, off + o.widthMm);
      const uv0 = planPointAndZToElevationUv(p0.x, p0.y, zb, facing);
      const uv1 = planPointAndZToElevationUv(p1.x, p1.y, zb, facing);
      const uMin = Math.min(uv0.x, uv1.x);
      const uMax = Math.max(uv0.x, uv1.x);

      if (o.kind === "door") {
        const v0 = zb;
        const v1 = zb + o.heightMm;
        pushRectUv(primitives, uMin, v0, uMax, v1, ELEV_OPENING_MM);
      } else if (o.kind === "window") {
        const sill = Math.max(0, o.sillHeightMm ?? 0);
        const v0 = zb + sill;
        const v1 = zb + sill + o.heightMm;
        pushRectUv(primitives, uMin, v0, uMax, v1, ELEV_OPENING_MM);
      }
    }
  }

  /** --- Сваи --- */
  const pileFilter = (p: FoundationPileEntity) => layerIds.has(p.layerId) && p.pileKind !== "screw";
  for (const pile of project.foundationPiles.filter(pileFilter)) {
    const baseZ = computedLayerBaseMm(project, pile.layerId);
    const topZ = baseZ + pile.levelMm;
    const botZ = topZ - pile.heightMm;
    const uc = planPointAndZToElevationUv(pile.centerX, pile.centerY, 0, facing).x;
    primitives.push({
      kind: "line",
      x1Mm: uc,
      y1Mm: botZ,
      x2Mm: uc,
      y2Mm: topZ,
      strokeMm: ELEV_FOUNDATION_MM,
      muted: true,
    });
  }

  /** --- Фундамент / ростверк (ortho_ring, footprint_poly, сегменты) --- */
  for (const strip of project.foundationStrips) {
    if (!layerIds.has(strip.layerId)) {
      continue;
    }
    pushFoundationStripElevation(primitives, strip, facing, project);
  }

  /** --- Плиты перекрытия: линия верха в пределах контура --- */
  const stackForSlab = computeLayerVerticalStack(project);
  for (const slab of project.slabs) {
    if (!layerIds.has(slab.layerId) || slab.pointsMm.length < 2) {
      continue;
    }
    const zt = slabWorldTopMm(slab, project, stackForSlab);
    const uv = slab.pointsMm.map((p) => planPointAndZToElevationUv(p.x, p.y, zt, facing));
    const uu = uv.map((p) => p.x);
    const lo = Math.min(...uu);
    const hi = Math.max(...uu);
    primitives.push({
      kind: "line",
      x1Mm: lo,
      y1Mm: zt,
      x2Mm: hi,
      y2Mm: zt,
      strokeMm: ELEV_SLAB_MM,
      muted: true,
    });
  }

  /** --- Условная линия «земли» по нижней границе стен --- */
  if (walls.length > 0) {
    let zMin = Infinity;
    for (const w of walls) {
      zMin = Math.min(zMin, wallWorldBottomMmFromMap(w, vMap, project));
    }
    if (Number.isFinite(zMin)) {
      let uLo = Infinity;
      let uHi = -Infinity;
      for (const w of walls) {
        const c = quadCornersAlongWallMm(w.start.x, w.start.y, w.end.x, w.end.y, -w.thicknessMm / 2, w.thicknessMm / 2);
        if (!c) {
          continue;
        }
        for (const p of c) {
          const u = planPointAndZToElevationUv(p.x, p.y, zMin, facing).x;
          uLo = Math.min(uLo, u);
          uHi = Math.max(uHi, u);
        }
      }
      if (uHi > uLo && Number.isFinite(uLo)) {
        primitives.push({
          kind: "line",
          x1Mm: uLo,
          y1Mm: zMin,
          x2Mm: uHi,
          y2Mm: zMin,
          strokeMm: ELEV_GROUND_MM,
          dashMm: [4, 3],
          muted: true,
        });
      }
    }
  }

  let worldBounds: BuildingElevationWorldBuild["worldBounds"] = null;
  for (const p of primitives) {
    if (p.kind === "line") {
      worldBounds = boundsUnionPoint(boundsUnionPoint(worldBounds, p.x1Mm, p.y1Mm), p.x2Mm, p.y2Mm);
    } else if (p.kind === "polyline") {
      for (const q of p.pointsMm) {
        worldBounds = boundsUnionPoint(worldBounds, q.x, q.y);
      }
    }
  }

  if (worldBounds == null) {
    return {
      primitives: [],
      worldBounds: null,
      messages: [...messages, "Нет геометрии для фасадной проекции."],
    };
  }

  return { primitives, worldBounds, messages };
}
