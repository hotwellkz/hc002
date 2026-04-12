import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlaneLabelLines, roofPlanePolygonMm, roofPlaneSlopeArrowSegmentMm } from "@/core/domain/roofPlane";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

/** Ось-выровненный прямоугольник в пикселях экрана (как у Pixi: x,y — левый верх). */
export type RectPx = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export type RoofLabelLayout2d = {
  readonly planeId: string;
  /** Линия стрелки (древко + наконечник рисуются по ней, как в drawArrowOnSegmentPx). */
  readonly arrowLinePx: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
  /** AABB стрелки (линия + треугольник наконечника), с небольшим запасом. */
  readonly arrowBoundsPx: RectPx;
  /** Левый верх текстового блока; в Pixi anchor (0,0), выравнивание слева. */
  readonly textTopLeftPx: { readonly x: number; readonly y: number };
  readonly textWidthPx: number;
  readonly textHeightPx: number;
  readonly line1: string;
  readonly line2: string;
};

export type RoofLabelLayoutStyle = {
  readonly fontSizePx: number;
  /** Межстрочный интервал как доля кегля (как lineHeight в Pixi). */
  readonly lineHeightFactor: number;
  /** Минимальный зазор между AABB стрелки и AABB текста, px. */
  readonly gapArrowToTextPx: number;
  /** Внутренний паддинг вокруг текста при проверке пересечений, px. */
  readonly labelCollisionPaddingPx: number;
};

const DEFAULT_STYLE: RoofLabelLayoutStyle = {
  fontSizePx: 11,
  lineHeightFactor: 1.28,
  gapArrowToTextPx: 7,
  labelCollisionPaddingPx: 4,
};

function normPx(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { x: 1, y: 0 };
  }
  return { x: dx / len, y: dy / len };
}

/**
 * Те же конечные точки древка, что в drawArrowOnSegmentPx(ax,ay,bx,by).
 */
export function roofPlaneSlopeArrowLineScreenPx(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 4) {
    return { x1: ax, y1: ay, x2: bx, y2: by };
  }
  const ux = dx / len;
  const uy = dy / len;
  const midX = (ax + bx) * 0.5;
  const midY = (ay + by) * 0.5;
  const half = Math.min(len * 0.38, 56);
  const x1 = midX - ux * half;
  const y1 = midY - uy * half;
  const x2 = midX + ux * half;
  const y2 = midY + uy * half;
  return { x1, y1, x2, y2 };
}

/**
 * AABB видимой стрелки (древко + наконечник), совпадает с drawArrowOnSegmentPx.
 */
export function computeArrowDrawableAabbPx(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  padPx = 2,
): RectPx {
  const { x1, y1, x2, y2 } = roofPlaneSlopeArrowLineScreenPx(ax, ay, bx, by);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 4) {
    return inflateAabb(unionPointAabb(x1, y1, x2, y2), padPx);
  }
  const ux = dx / len;
  const uy = dy / len;
  const midX = (ax + bx) * 0.5;
  const midY = (ay + by) * 0.5;
  const half = Math.min(len * 0.38, 56);
  const hx2 = midX + ux * half;
  const hy2 = midY + uy * half;
  const head = Math.min(11, half * 0.45);
  const bx2 = hx2 - ux * head;
  const by2 = hy2 - uy * head;
  const px = -uy * (head * 0.55);
  const py = ux * (head * 0.55);
  let minX = Math.min(x1, x2, hx2, bx2 + px, bx2 - px);
  let maxX = Math.max(x1, x2, hx2, bx2 + px, bx2 - px);
  let minY = Math.min(y1, y2, hy2, by2 + py, by2 - py);
  let maxY = Math.max(y1, y2, hy2, by2 + py, by2 - py);
  minX -= padPx;
  maxX += padPx;
  minY -= padPx;
  maxY += padPx;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function unionPointAabb(x1: number, y1: number, x2: number, y2: number): RectPx {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function inflateAabb(r: RectPx, p: number): RectPx {
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p };
}

function aabbIntersect(a: RectPx, b: RectPx): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Оценка габаритов двухстрочного блока (sans, кириллица/цифры). */
export function estimateRoofLabelTextBlockPx(
  line1: string,
  line2: string,
  fontSizePx: number,
  lineHeightFactor: number,
): { readonly w: number; readonly h: number } {
  const maxChars = Math.max(line1.length, line2.length, 1);
  const w = Math.ceil(maxChars * fontSizePx * 0.62 + fontSizePx * 0.35);
  const lineH = fontSizePx * lineHeightFactor;
  const h = Math.ceil(lineH * 2 + fontSizePx * 0.12);
  return { w, h };
}

function pointInPolygonScreen(px: number, py: number, poly: readonly { readonly x: number; readonly y: number }[]): boolean {
  if (poly.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const inter = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (inter) {
      inside = !inside;
    }
  }
  return inside;
}

function roofPolygonScreenPx(rp: RoofPlaneEntity, t: ViewportTransform): { readonly x: number; readonly y: number }[] {
  const poly = roofPlanePolygonMm(rp);
  return poly.map((p) => worldToScreen(p.x, p.y, t));
}

export function getRoofPlaneSlopeArrowLineScreenPx(
  rp: RoofPlaneEntity,
  t: ViewportTransform,
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } | null {
  const seg = roofPlaneSlopeArrowSegmentMm(rp);
  if (!seg) {
    return null;
  }
  const a = worldToScreen(seg.ax, seg.ay, t);
  const b = worldToScreen(seg.bx, seg.by, t);
  return roofPlaneSlopeArrowLineScreenPx(a.x, a.y, b.x, b.y);
}

export type RoofLabelOccupancy2d = {
  /** Уже размещённые прямоугольники подписей (с паддингом). */
  readonly labelRects: RectPx[];
  /** AABB стрелок (можно без паддинга — текст и так отодвинут от своей стрелки). */
  readonly arrowRects: RectPx[];
};

/**
 * Раскладка одной подписи: стрелка по центру ската, текст сбоку с фиксированным зазором,
 * перебор сторон и сдвигов, проверка пересечений со стрелкой, другими подписями и по возможности с контуром ската.
 */
export function computeRoofLabelLayout2d(
  rp: RoofPlaneEntity,
  t: ViewportTransform,
  style: RoofLabelLayoutStyle,
  occ: RoofLabelOccupancy2d,
): RoofLabelLayout2d | null {
  const seg = roofPlaneSlopeArrowSegmentMm(rp);
  if (!seg) {
    return null;
  }
  const a = worldToScreen(seg.ax, seg.ay, t);
  const b = worldToScreen(seg.bx, seg.by, t);
  const line = roofPlaneSlopeArrowLineScreenPx(a.x, a.y, b.x, b.y);
  const arrowAabb = computeArrowDrawableAabbPx(a.x, a.y, b.x, b.y, 2);
  const arrowClear = inflateAabb(arrowAabb, style.gapArrowToTextPx);

  const [line1, line2] = roofPlaneLabelLines(rp);
  const { w: tw, h: th } = estimateRoofLabelTextBlockPx(line1, line2, style.fontSizePx, style.lineHeightFactor);

  const u = normPx(line.x2 - line.x1, line.y2 - line.y1);
  const cx = (line.x1 + line.x2) * 0.5;
  const cy = (line.y1 + line.y2) * 0.5;

  const roofScr = roofPolygonScreenPx(rp, t);

  /** Вертикальное древко на экране: текст сначала справа (+X), иначе слева. Горизонтальное: снизу (+Y), иначе сверху. */
  const mostlyVertical = Math.abs(u.x) <= Math.abs(u.y);
  const perpUnit =
    mostlyVertical
      ? ({ x: 1 as const, y: 0 as const } as const)
      : ({ x: 0 as const, y: 1 as const } as const);

  const pad = style.labelCollisionPaddingPx;
  const rectFromCenter = (tcx: number, tcy: number): RectPx => ({
    x: tcx - tw * 0.5 - pad,
    y: tcy - th * 0.5 - pad,
    w: tw + 2 * pad,
    h: th + 2 * pad,
  });

  const valid = (tr: RectPx): boolean => {
    if (aabbIntersect(tr, arrowClear)) {
      return false;
    }
    for (const o of occ.labelRects) {
      if (aabbIntersect(tr, o)) {
        return false;
      }
    }
    for (const o of occ.arrowRects) {
      if (aabbIntersect(tr, inflateAabb(o, 2))) {
        return false;
      }
    }
    return true;
  };

  const sideOrder: (1 | -1)[] = ([1, -1] as const)
    .map((s) => {
      const p = { x: perpUnit.x * s, y: perpUnit.y * s };
      const tcx = cx + p.x * 24;
      const tcy = cy + p.y * 24;
      return { s, in: pointInPolygonScreen(tcx, tcy, roofScr) ? 1 : 0 };
    })
    .sort((a, b) => a.in - b.in)
    .map((x) => x.s);

  const distMax = 160;
  const step = 4;
  const dMin = style.gapArrowToTextPx + Math.max(tw, th) * 0.32;

  type Cand = { readonly side: 1 | -1; readonly d: number; readonly tcx: number; readonly tcy: number; readonly tr: RectPx };
  const perSide: Cand[] = [];

  for (const side of sideOrder) {
    const p = { x: perpUnit.x * side, y: perpUnit.y * side };
    let found: Cand | null = null;
    for (let d = dMin; d <= distMax; d += step) {
      const tcx = cx + p.x * d;
      const tcy = cy + p.y * d;
      const tr = rectFromCenter(tcx, tcy);
      if (valid(tr)) {
        found = { side, d, tcx, tcy, tr };
        break;
      }
    }
    if (found) {
      perSide.push(found);
    }
  }

  const pickBetter = (a: Cand, b: Cand): Cand => {
    const aIn = pointInPolygonScreen(a.tcx, a.tcy, roofScr);
    const bIn = pointInPolygonScreen(b.tcx, b.tcy, roofScr);
    if (aIn !== bIn) {
      return aIn ? b : a;
    }
    if (a.d !== b.d) {
      return a.d < b.d ? a : b;
    }
    return a;
  };

  let best: Cand | null = perSide.length ? perSide.reduce(pickBetter) : null;

  if (!best) {
    const side: 1 | -1 = sideOrder[0] ?? 1;
    const p = { x: perpUnit.x * side, y: perpUnit.y * side };
    const d = distMax;
    const tcx = cx + p.x * d;
    const tcy = cy + p.y * d;
    best = { side, d, tcx, tcy, tr: rectFromCenter(tcx, tcy) };
  }

  const { tcx, tcy } = best;
  const textTopLeftPx = { x: tcx - tw * 0.5, y: tcy - th * 0.5 };

  return {
    planeId: rp.id,
    arrowLinePx: line,
    arrowBoundsPx: arrowAabb,
    textTopLeftPx,
    textWidthPx: tw,
    textHeightPx: th,
    line1,
    line2,
  };
}

/**
 * Последовательная раскладка подписей для набора скатов: каждая следующая учитывает уже занятые прямоугольники.
 */
/** Алиас для вызовов из кода, ожидающих имя `computeRoofLabelLayout`. */
export const computeRoofLabelLayout = computeRoofLabelLayout2d;

export function computeRoofLabelLayouts2d(
  planes: readonly RoofPlaneEntity[],
  t: ViewportTransform,
  partial?: { readonly style?: Partial<RoofLabelLayoutStyle> },
): RoofLabelLayout2d[] {
  const style: RoofLabelLayoutStyle = { ...DEFAULT_STYLE, ...partial?.style };
  const occ: RoofLabelOccupancy2d = { labelRects: [], arrowRects: [] };
  const out: RoofLabelLayout2d[] = [];
  for (const rp of planes) {
    const poly = roofPlanePolygonMm(rp);
    if (poly.length < 3) {
      continue;
    }
    const lay = computeRoofLabelLayout2d(rp, t, style, occ);
    if (!lay) {
      continue;
    }
    out.push(lay);
    occ.arrowRects.push(lay.arrowBoundsPx);
    occ.labelRects.push(
      inflateAabb(
        {
          x: lay.textTopLeftPx.x,
          y: lay.textTopLeftPx.y,
          w: lay.textWidthPx,
          h: lay.textHeightPx,
        },
        style.labelCollisionPaddingPx,
      ),
    );
  }
  return out;
}
