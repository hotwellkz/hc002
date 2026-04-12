import type { Profile } from "./profile";
import type { Project } from "./project";
import type { Point2D } from "../geometry/types";
import { ROOF_PLANE_QUAD_EDIT_MIN_EDGE_MM, type RoofQuad4 } from "./roofPlaneQuadEditGeometry";

/**
 * Прямоугольная плоскость ската на плане (базовая линия + глубина вдоль выдавливания).
 * Заложено под 3D, стыковку скатов и спецификацию.
 */
export interface RoofPlaneEntity {
  readonly id: string;
  readonly type: "roofPlane";
  readonly layerId: string;
  readonly p1: Point2D;
  readonly p2: Point2D;
  /** Глубина прямоугольника в плане перпендикулярно базе (в сторону построения), мм (> 0). */
  readonly depthMm: number;
  /** Угол наклона ската (градусы), для подписи и будущего 3D. */
  readonly angleDeg: number;
  /** Отметка по высоте (мм), сохраняется для последующей логики уровней. */
  readonly levelMm: number;
  readonly profileId: string;
  /**
   * Единичный вектор на плане: направление стока (к низу ската), перпендикулярно p1–p2.
   * Противоположен стороне, в которую пользователь выдавил плоскость при построении.
   */
  readonly slopeDirection: Point2D;
  /** Номер ската в проекте (1, 2, …) для подписи «Скат N». */
  readonly slopeIndex: number;
  /**
   * Явный контур ската в плане (мм), ≥3 вершины по периметру против часовой стрелки.
   * Если не задан — контур строится как прямоугольник из p1, p2, depthMm и slopeDirection.
   */
  readonly planContourMm?: readonly Point2D[] | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function isProfileUsableForRoofPlane(profile: Profile): boolean {
  return profile.category === "roof";
}

export function roofPlaneUnitAlongEdgeMm(p1: Point2D, p2: Point2D): Point2D | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return null;
  }
  return { x: dx / len, y: dy / len };
}

/** Перпендикуляр против часовой стрелки к вектору вдоль ребра p1→p2. */
export function roofPlanePerpCcWMm(p1: Point2D, p2: Point2D): Point2D | null {
  const u = roofPlaneUnitAlongEdgeMm(p1, p2);
  if (!u) {
    return null;
  }
  return { x: -u.y, y: u.x };
}

/**
 * Выбор стороны ската: нормаль к ребру так, чтобы скат «смотрел» на курсор.
 * depth = расстояние от прямой (p1,p2) до точки вдоль этой нормали (>= 0).
 */
export function roofPlaneNormalAndDepthFromCursorMm(
  p1: Point2D,
  p2: Point2D,
  cursorMm: Point2D,
  lockedNormal: Point2D | null,
): { readonly n: Point2D; readonly depthMm: number } | null {
  const n0 = roofPlanePerpCcWMm(p1, p2);
  if (!n0) {
    return null;
  }
  const vx = cursorMm.x - p1.x;
  const vy = cursorMm.y - p1.y;
  if (lockedNormal) {
    const depthMm = Math.max(0, vx * lockedNormal.x + vy * lockedNormal.y);
    return { n: lockedNormal, depthMm };
  }
  const d0 = vx * n0.x + vy * n0.y;
  const n = d0 >= 0 ? n0 : { x: -n0.x, y: -n0.y };
  const depthMm = Math.abs(d0);
  return { n, depthMm };
}

/** Направление выдавливания в плане (от базы в сторону построения); противоположно стоку. */
export function roofPlaneExtrusionDirectionMm(rp: RoofPlaneEntity): Point2D {
  return { x: -rp.slopeDirection.x, y: -rp.slopeDirection.y };
}

/** Контур ската в плане: кастомный или прямоугольник по базовым параметрам. */
export function roofPlanePolygonMm(rp: RoofPlaneEntity): readonly Point2D[] {
  if (rp.planContourMm && rp.planContourMm.length >= 3) {
    return rp.planContourMm;
  }
  const e = roofPlaneExtrusionDirectionMm(rp);
  const d = rp.depthMm;
  const p3 = { x: rp.p2.x + e.x * d, y: rp.p2.y + e.y * d };
  const p4 = { x: rp.p1.x + e.x * d, y: rp.p1.y + e.y * d };
  return [rp.p1, rp.p2, p3, p4];
}

/**
 * Обновляет сущность ската по 4 вершинам плана: p1,p2, глубина и slopeDirection согласованы с ребром «глубины».
 */
export function roofPlaneEntityApplyPlanQuadMm(rp: RoofPlaneEntity, quad: RoofQuad4): RoofPlaneEntity {
  const p1 = quad[0]!;
  const p2 = quad[1]!;
  const p4 = quad[3]!;
  const eRaw = { x: p4.x - p1.x, y: p4.y - p1.y };
  const dLen = Math.hypot(eRaw.x, eRaw.y);
  const prevE = roofPlaneExtrusionDirectionMm(rp);
  let e: Point2D;
  if (dLen < 1e-6) {
    e = prevE;
  } else {
    e = { x: eRaw.x / dLen, y: eRaw.y / dLen };
    if (e.x * prevE.x + e.y * prevE.y < 0) {
      e = { x: -e.x, y: -e.y };
    }
  }
  const depthMm = Math.max(ROOF_PLANE_QUAD_EDIT_MIN_EDGE_MM, dLen);
  const slopeDirection = { x: -e.x, y: -e.y };
  const now = new Date().toISOString();
  return {
    ...rp,
    p1,
    p2,
    depthMm,
    slopeDirection,
    planContourMm: [quad[0]!, quad[1]!, quad[2]!, quad[3]!],
    updatedAt: now,
  };
}

export function nextRoofPlaneSlopeIndex(project: Project): number {
  let m = 0;
  for (const rp of project.roofPlanes) {
    m = Math.max(m, rp.slopeIndex);
  }
  return m + 1;
}

/** Две строки подписи ската: угол и «Скат N». */
export function roofPlaneLabelLines(rp: RoofPlaneEntity): readonly [string, string] {
  const ang = Number.isFinite(rp.angleDeg) ? Math.round(rp.angleDeg * 10) / 10 : 0;
  return [`${ang}°`, `Скат ${rp.slopeIndex}`];
}

export function roofPlaneLabelText(rp: RoofPlaneEntity): string {
  const [a, b] = roofPlaneLabelLines(rp);
  return `${a}\n${b}`;
}

/**
 * Отрезок направления стока в мм (мировые координаты плана), как для 2D-стрелки на скате.
 * Хвост → голова совпадают с логикой отрисовки стрелки в редакторе.
 */
export function roofPlaneSlopeArrowSegmentMm(
  rp: RoofPlaneEntity,
): { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number } | null {
  const poly = roofPlanePolygonMm(rp);
  if (poly.length < 3) {
    return null;
  }
  const fall = rp.slopeDirection;
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  let minX = poly[0]!.x;
  let maxX = poly[0]!.x;
  let minY = poly[0]!.y;
  let maxY = poly[0]!.y;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const arrowLenMm = Math.min(rp.depthMm * 0.55, Math.max(span * 0.22, 600));
  const ax = cx - fall.x * arrowLenMm * 0.42;
  const ay = cy - fall.y * arrowLenMm * 0.42;
  const bx = cx + fall.x * arrowLenMm * 0.58;
  const by = cy + fall.y * arrowLenMm * 0.58;
  return { ax, ay, bx, by };
}
