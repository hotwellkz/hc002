import { Graphics } from "pixi.js";

import type { RoofQuad4 } from "@/core/domain/roofPlaneQuadEditGeometry";
import type { ViewportTransform } from "@/core/geometry/viewportTransform";
import { worldToScreen } from "@/core/geometry/viewportTransform";

import { roofQuadEdgeMidpointMm } from "./roofPlaneEditHandlesPick2d";

/** Hover / выбранная ручка (ребро или угол) — без привязки к «живому» pointer-session. */
export type RoofPlaneEditHandleUiState = {
  readonly planeId: string;
  readonly kind: "edge" | "corner";
  readonly edgeIndex?: number;
  readonly cornerIndex?: number;
} | null;

/** Активный pointer-session (нажатие / drag) для акцента поверх hover/selected. */
export type RoofPlaneEditActivePointerUi = {
  readonly planeId: string;
  readonly kind: "edge" | "corner";
  readonly edgeIndex?: number;
  readonly cornerIndex?: number;
  readonly dragActive: boolean;
} | null;

type EdgeAccent = "hover" | "selected" | "press" | "drag";

const EDGE_STYLE: Record<
  EdgeAccent,
  { readonly w: number; readonly color: number; readonly alpha: number }
> = {
  hover: { w: 1.45, color: 0x7dd3fc, alpha: 0.82 },
  selected: { w: 2.45, color: 0x06b6d4, alpha: 1 },
  press: { w: 2.35, color: 0x0891b2, alpha: 0.99 },
  drag: { w: 2.55, color: 0x0284c7, alpha: 1 },
};

/** Радиус mid-side handle в CSS px (экран). */
const SIDE_HANDLE_R_PX: Record<EdgeAccent, number> = {
  hover: 2.05,
  selected: 2.45,
  press: 2.45,
  drag: 2.6,
};

type CornerAccent = "cold" | "hover" | "selected" | "press" | "drag";

const CORNER_HALF_PX: Record<CornerAccent, number> = {
  cold: 2.4,
  hover: 2.55,
  selected: 2.65,
  press: 2.65,
  drag: 2.75,
};

const CORNER_STROKE: Record<CornerAccent, { readonly w: number; readonly alpha: number }> = {
  cold: { w: 0.85, alpha: 0.78 },
  hover: { w: 0.95, alpha: 0.84 },
  selected: { w: 1.0, alpha: 0.9 },
  press: { w: 1.02, alpha: 0.91 },
  drag: { w: 1.05, alpha: 0.94 },
};

const CORNER_BLUE = 0x3b82f6;

function edgeAccent(
  e: number,
  planeId: string,
  hover: RoofPlaneEditHandleUiState,
  selected: RoofPlaneEditHandleUiState,
  active: RoofPlaneEditActivePointerUi,
): EdgeAccent | null {
  const ap =
    active &&
    active.planeId === planeId &&
    active.kind === "edge" &&
    active.edgeIndex === e;
  if (ap) {
    return active.dragActive ? "drag" : "press";
  }
  if (selected?.kind === "edge" && selected.planeId === planeId && selected.edgeIndex === e) {
    return "selected";
  }
  if (hover?.kind === "edge" && hover.planeId === planeId && hover.edgeIndex === e) {
    return "hover";
  }
  return null;
}

function cornerAccent(
  c: number,
  planeId: string,
  hover: RoofPlaneEditHandleUiState,
  selected: RoofPlaneEditHandleUiState,
  active: RoofPlaneEditActivePointerUi,
): CornerAccent {
  const ap =
    active &&
    active.planeId === planeId &&
    active.kind === "corner" &&
    active.cornerIndex === c;
  if (ap) {
    return active.dragActive ? "drag" : "press";
  }
  if (selected?.kind === "corner" && selected.planeId === planeId && selected.cornerIndex === c) {
    return "selected";
  }
  if (hover?.kind === "corner" && hover.planeId === planeId && hover.cornerIndex === c) {
    return "hover";
  }
  return "cold";
}

/**
 * Хендлы активного ската: линии рёбер + маленький mid-side маркер на hover/selected/drag ребра.
 */
export function drawRoofPlaneEditHandles2d(
  g: Graphics,
  quad: RoofQuad4,
  t: ViewportTransform,
  planeId: string,
  hover: RoofPlaneEditHandleUiState,
  selected: RoofPlaneEditHandleUiState,
  activePointer: RoofPlaneEditActivePointerUi,
): void {
  for (let e = 0; e < 4; e++) {
    const acc = edgeAccent(e, planeId, hover, selected, activePointer);
    if (acc == null) {
      continue;
    }
    const st = EDGE_STYLE[acc];
    const p0 = worldToScreen(quad[e]!.x, quad[e]!.y, t);
    const p1 = worldToScreen(quad[(e + 1) & 3]!.x, quad[(e + 1) & 3]!.y, t);
    g.moveTo(p0.x, p0.y);
    g.lineTo(p1.x, p1.y);
    g.stroke({ width: st.w, color: st.color, alpha: st.alpha, cap: "round", join: "round" });

    const midMm = roofQuadEdgeMidpointMm(quad, e);
    const sm = worldToScreen(midMm.x, midMm.y, t);
    const r = SIDE_HANDLE_R_PX[acc];
    g.circle(sm.x, sm.y, r);
    g.fill({ color: 0xffffff, alpha: acc === "hover" ? 0.9 : 0.96 });
    g.stroke({
      width: acc === "hover" ? 0.88 : 1.08,
      color: st.color,
      alpha: Math.min(1, st.alpha * 0.96),
    });
  }

  for (let c = 0; c < 4; c++) {
    const accC = cornerAccent(c, planeId, hover, selected, activePointer);
    const p = worldToScreen(quad[c]!.x, quad[c]!.y, t);
    const h = CORNER_HALF_PX[accC];
    const st = CORNER_STROKE[accC];
    g.rect(p.x - h, p.y - h, 2 * h, 2 * h);
    g.fill({ color: 0xffffff, alpha: accC === "cold" ? 0.86 : 0.93 });
    g.stroke({
      width: st.w,
      color: CORNER_BLUE,
      alpha: st.alpha,
    });
  }
}
