import type { Point2D } from "../geometry/types";
import { closestPointOnSegment } from "./wallJointGeometry";
import type { Opening } from "./opening";
import type { OpeningPositionSpec } from "./openingWindowTypes";
import type { Project } from "./project";
import type { Wall } from "./wall";
import { wallLengthMm } from "./wallCalculationGeometry";

/** Минимальный отступ края проёма от торца стены (вдоль оси), мм. */
export const WINDOW_OPENING_WALL_END_MARGIN_MM = 80;

export type { OpeningAlongAnchor, OpeningAlongAlignment, OpeningPositionSpec } from "./openingWindowTypes";

export function pickClosestWallAlongPoint(
  worldMm: Point2D,
  walls: readonly Wall[],
  toleranceMm: number,
): { readonly wallId: string; readonly pointMm: Point2D; readonly alongMm: number } | null {
  let best: { wallId: string; pointMm: Point2D; alongMm: number; d: number } | null = null;
  for (const w of walls) {
    const { point, t } = closestPointOnSegment(w.start, w.end, worldMm);
    const dx = worldMm.x - point.x;
    const dy = worldMm.y - point.y;
    const d = Math.hypot(dx, dy);
    const L = wallLengthMm(w);
    const along = t * L;
    if (d <= toleranceMm && (!best || d < best.d)) {
      best = { wallId: w.id, pointMm: point, alongMm: along, d };
    }
  }
  return best ? { wallId: best.wallId, pointMm: best.pointMm, alongMm: best.alongMm } : null;
}

/** Левый край проёма вдоль стены (от start), мм, без учёта отступов. */
export function offsetFromStartForCursorCentered(alongMm: number, openingWidthMm: number): number {
  return alongMm - openingWidthMm / 2;
}

export function clampOpeningLeftEdgeMm(wall: Wall, openingWidthMm: number, leftEdgeMm: number): number {
  const L = wallLengthMm(wall);
  const m = WINDOW_OPENING_WALL_END_MARGIN_MM;
  const maxLeft = Math.max(m, L - openingWidthMm - m);
  return Math.max(m, Math.min(maxLeft, leftEdgeMm));
}

export function openingIntervalsOnWall(project: Project, wallId: string, excludeOpeningId?: string): readonly { lo: number; hi: number }[] {
  const out: { lo: number; hi: number }[] = [];
  for (const o of project.openings) {
    if (o.wallId !== wallId || o.offsetFromStartMm == null) {
      continue;
    }
    if (excludeOpeningId && o.id === excludeOpeningId) {
      continue;
    }
    out.push({ lo: o.offsetFromStartMm, hi: o.offsetFromStartMm + o.widthMm });
  }
  return out;
}

export function intervalsOverlap(aLo: number, aHi: number, bLo: number, bHi: number, gapMm = 1): boolean {
  return !(aHi <= bLo + gapMm || aLo >= bHi - gapMm);
}

export function validateWindowPlacementOnWall(
  wall: Wall,
  leftEdgeMm: number,
  openingWidthMm: number,
  project: Project,
  excludeOpeningId?: string,
): { ok: true } | { ok: false; reason: string } {
  const L = wallLengthMm(wall);
  const m = WINDOW_OPENING_WALL_END_MARGIN_MM;
  if (openingWidthMm <= 0 || openingWidthMm > L - 2 * m) {
    return { ok: false, reason: "Проём не помещается по длине стены (с учётом отступов от торцов)." };
  }
  const right = leftEdgeMm + openingWidthMm;
  if (leftEdgeMm < m - 1e-3 || right > L - m + 1e-3) {
    return { ok: false, reason: "Проём выходит за пределы стены или близко к торцу." };
  }
  const others = openingIntervalsOnWall(project, wall.id, excludeOpeningId);
  for (const iv of others) {
    if (intervalsOverlap(leftEdgeMm, right, iv.lo, iv.hi)) {
      return { ok: false, reason: "Пересечение с другим проёмом на этой стене." };
    }
  }
  return { ok: true };
}

/**
 * Левый край проёма (offsetFromStartMm) из параметров вкладки «Позиция».
 */
export function offsetFromStartFromPositionSpec(
  wall: Wall,
  openingWidthMm: number,
  spec: OpeningPositionSpec,
): number {
  const L = wallLengthMm(wall);
  let anchorDist = 0;
  switch (spec.anchorAlongWall) {
    case "wall_start":
      anchorDist = spec.offsetAlongWallMm;
      break;
    case "wall_end":
      anchorDist = L - spec.offsetAlongWallMm;
      break;
    case "wall_center":
      anchorDist = L / 2 + spec.offsetAlongWallMm;
      break;
    default:
      anchorDist = spec.offsetAlongWallMm;
  }
  let left = anchorDist;
  if (spec.alignment === "center") {
    left = anchorDist - openingWidthMm / 2;
  } else if (spec.alignment === "trailing") {
    left = anchorDist - openingWidthMm;
  }
  return clampOpeningLeftEdgeMm(wall, openingWidthMm, left);
}

/** Заполняет position из текущего offset (для первичной установки по клику). */
export function defaultPositionSpecFromLeftEdge(_wall: Wall, leftEdgeMm: number, openingWidthMm: number, sillLevelMm: number): OpeningPositionSpec {
  const center = leftEdgeMm + openingWidthMm / 2;
  return {
    anchorAlongWall: "wall_start",
    offsetAlongWallMm: center,
    alignment: "center",
    sillLevelMm,
  };
}

export function isOpeningPlaced(o: Opening): boolean {
  return o.wallId != null && o.offsetFromStartMm != null;
}

/** Расстояние вдоль стены от start до проекции точки на ось сегмента, мм, в диапазоне [0, L]. */
export function projectWorldToAlongMm(wall: Wall, worldMm: Point2D): number {
  const L = wallLengthMm(wall);
  if (L < 1e-6) {
    return 0;
  }
  const { t } = closestPointOnSegment(wall.start, wall.end, worldMm);
  return Math.max(0, Math.min(1, t)) * L;
}

/**
 * Попадание курсора в полосу проёма на стене (план XY).
 * tolPerp — допуск перпендикулярно к стене; tolAlong — вдоль оси (удобнее хватать края).
 */
export function hitTestPlacedWindowOnWall(
  wall: Wall,
  opening: Opening,
  worldMm: Point2D,
  tolAlongMm: number,
  tolPerpMm: number,
): boolean {
  if (opening.kind !== "window" || opening.wallId !== wall.id || opening.offsetFromStartMm == null) {
    return false;
  }
  const L = wallLengthMm(wall);
  if (L < 1e-6) {
    return false;
  }
  const { point, t } = closestPointOnSegment(wall.start, wall.end, worldMm);
  const perp = Math.hypot(worldMm.x - point.x, worldMm.y - point.y);
  const halfT = wall.thicknessMm / 2;
  if (perp > halfT + tolPerpMm) {
    return false;
  }
  const along = Math.max(0, Math.min(1, t)) * L;
  const lo = opening.offsetFromStartMm - tolAlongMm;
  const hi = opening.offsetFromStartMm + opening.widthMm + tolAlongMm;
  return along >= lo && along <= hi;
}

/**
 * Окно «сверху» списка (последнее в массиве) при перекрытии — как порядок отрисовки в 2D.
 */
export function pickPlacedWindowOnLayerSlice(
  layerSlice: Project,
  worldMm: Point2D,
  tolAlongMm: number,
  tolPerpMm: number,
): Opening | null {
  const wallIds = new Set(layerSlice.walls.map((w) => w.id));
  let hit: Opening | null = null;
  for (const o of layerSlice.openings) {
    if (o.kind !== "window" || o.wallId == null || o.offsetFromStartMm == null || !wallIds.has(o.wallId)) {
      continue;
    }
    const wall = layerSlice.walls.find((w) => w.id === o.wallId);
    if (!wall) {
      continue;
    }
    if (hitTestPlacedWindowOnWall(wall, o, worldMm, tolAlongMm, tolPerpMm)) {
      hit = o;
    }
  }
  return hit;
}

/** Снап скаляра вдоль стены к шагу сетки (мм). */
export function snapAlongWallMm(valueMm: number, gridStepMm: number, snapEnabled: boolean): number {
  if (!snapEnabled || !Number.isFinite(gridStepMm) || gridStepMm <= 0) {
    return valueMm;
  }
  return Math.round(valueMm / gridStepMm) * gridStepMm;
}

/** Снап левого края проёма по центру окна к сетке, с укладкой в допустимый диапазон стены. */
export function snapOpeningLeftEdgeMm(
  wall: Wall,
  openingWidthMm: number,
  rawLeftMm: number,
  gridStepMm: number,
  snapGrid: boolean,
): number {
  const center = rawLeftMm + openingWidthMm / 2;
  const cSnapped = snapAlongWallMm(center, gridStepMm, snapGrid);
  return clampOpeningLeftEdgeMm(wall, openingWidthMm, cSnapped - openingWidthMm / 2);
}
