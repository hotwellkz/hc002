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
  /** Если задан — скат создан генератором `RoofSystemEntity` с этим id. */
  readonly roofSystemId?: string;
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
   * После «Рассчитать» сюда попадает **расчётный** контур (база + свесы профиля).
   */
  readonly planContourMm?: readonly Point2D[] | null;
  /**
   * Базовый контур без свесов профиля (то, что задал пользователь: стены, соединения, сдвиги).
   * Свесы при расчёте накладываются поверх него идемпотентно.
   */
  readonly planContourBaseMm?: readonly Point2D[] | null;
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

/**
 * Прямоугольник ската только из p1, p2, depthMm и slopeDirection (без planContourMm).
 * Используется как база при первом расчёте, если planContourBaseMm ещё не зафиксирован.
 */
export function roofPlaneImplicitQuadVerticesMm(rp: RoofPlaneEntity): Point2D[] {
  const e = roofPlaneExtrusionDirectionMm(rp);
  const d = rp.depthMm;
  const p3 = { x: rp.p2.x + e.x * d, y: rp.p2.y + e.y * d };
  const p4 = { x: rp.p1.x + e.x * d, y: rp.p1.y + e.y * d };
  return [
    { x: rp.p1.x, y: rp.p1.y },
    { x: rp.p2.x, y: rp.p2.y },
    p3,
    p4,
  ];
}

/**
 * Базовый контур для идемпотентного расчёта свесов:
 * приоритет у `planContourBaseMm`, иначе текущий контур ската (в т.ч. имплицитный прямоугольник).
 */
export function roofPlaneCalculationBasePolygonMm(rp: RoofPlaneEntity): Point2D[] {
  if (rp.planContourBaseMm && rp.planContourBaseMm.length >= 3) {
    return rp.planContourBaseMm.map((p) => ({ x: p.x, y: p.y }));
  }
  return [...roofPlanePolygonMm(rp)].map((p) => ({ x: p.x, y: p.y }));
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
 * Нормированное направление стока на плане (к низу ската), как в 3D `roofSlopeVerticesThreeMm`.
 */
export function roofPlaneDrainUnitPlanMm(rp: RoofPlaneEntity): { readonly uxn: number; readonly uyn: number } {
  const ux = rp.slopeDirection.x;
  const uy = rp.slopeDirection.y;
  const ulen = Math.hypot(ux, uy);
  const uxn = ulen > 1e-9 ? ux / ulen : 1;
  const uyn = ulen > 1e-9 ? uy / ulen : 0;
  return { uxn, uyn };
}

/** max(p·û) по вершинам контура — опорная точка «карниза» в модели подъёма ската. */
export function roofPlaneMaxDotAlongDrainMm(
  poly: readonly Point2D[],
  uxn: number,
  uyn: number,
): number {
  let maxDot = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    maxDot = Math.max(maxDot, p.x * uxn + p.y * uyn);
  }
  return maxDot;
}

/**
 * Ребро контура, по которому оба конца лежат на «карнизе» в координатах стока (p·û = max).
 * Для прямоугольного ската — длинная сторона у карниза; совпадает с базой для формулы Z = level + tan·(maxDot − p·û).
 * Надёжнее, чем брать одну вершину с min(p·ê): при почти плоском ребре или шуме координат min мог «прыгать».
 */
export function roofPlanePreferredEaveEdgeVertexIndicesMm(
  contourCcW: readonly Point2D[],
  uxn: number,
  uyn: number,
  epsMm = 0.5,
): { readonly i0: number; readonly i1: number } | null {
  const maxDot = roofPlaneMaxDotAlongDrainMm(contourCcW, uxn, uyn);
  const n = contourCcW.length;
  let bestLenSq = -1;
  let best: { readonly i0: number; readonly i1: number } | null = null;
  for (let i = 0; i < n; i++) {
    const a = contourCcW[i]!;
    const b = contourCcW[(i + 1) % n]!;
    const da = a.x * uxn + a.y * uyn;
    const db = b.x * uxn + b.y * uyn;
    if (Math.abs(da - maxDot) <= epsMm && Math.abs(db - maxDot) <= epsMm) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > bestLenSq) {
        bestLenSq = lenSq;
        best = { i0: i, i1: (i + 1) % n };
      }
    }
  }
  return best;
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
  const contour = [quad[0]!, quad[1]!, quad[2]!, quad[3]!] as const;
  return {
    ...rp,
    p1,
    p2,
    depthMm,
    slopeDirection,
    planContourMm: [...contour],
    planContourBaseMm: [...contour],
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
