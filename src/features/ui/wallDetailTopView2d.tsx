/**
 * Блок «Вид сверху» для режима «Вид стены»: послойный профиль как на 2D-плане
 * + расчётный слой SIP core и досок из collectWallCalculationPlanQuads (тот же источник, что drawWallCalculationOverlay2d).
 */

import type { ReactNode } from "react";

import type { Opening } from "@/core/domain/opening";
import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";
import type { WallCalculationResult } from "@/core/domain/wallCalculation";
import { getProfileById } from "@/core/domain/profileOps";
import {
  MIN_LAYERED_WALL_SCREEN_THICKNESS_PX,
  resolveWallProfileLayerStripsMm,
  type WallProfileLayerStripMm,
} from "@/core/domain/wallProfileLayers";
import {
  lumberPlan2dFillForRoleAndMaterial,
  wallCalcCorePlan2dFill,
} from "@/features/editor2d/wallCalculationPlan2dColors";
import { collectWallCalculationPlanQuads } from "@/features/editor2d/wallCalculationPlan2dQuads";
import { fillColor2dForMaterialType } from "@/features/editor2d/materials2d";
import { openingSlotCornersMm } from "@/features/editor2d/openingPlanGeometry2d";
import { quadCornersAlongWallMm } from "@/features/editor2d/wallPlanGeometry2d";

function pixiHexToCss(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Стена вдоль +X для согласования с openingSlotCornersMm / quadCornersAlongWallMm. */
function wallAlongPositiveX(wall: Wall, lengthMm: number): Wall {
  return {
    ...wall,
    start: { x: 0, y: 0 },
    end: { x: lengthMm, y: 0 },
  };
}

function crossToSheetYMm(topViewY: number, crossMm: number, thicknessMm: number): number {
  return topViewY + crossMm + thicknessMm / 2;
}

function wallCalculationPlanOverlaySvg(
  wPlan: Wall,
  sourceWall: Wall,
  project: Project,
  calc: WallCalculationResult,
  topViewY: number,
  T: number,
  sx: (mm: number) => number,
  sy: (mm: number) => number,
): ReactNode {
  const quads = collectWallCalculationPlanQuads(wPlan, project, calc);
  const profile = sourceWall.profileId ? getProfileById(project, sourceWall.profileId) : undefined;
  const coreFill = wallCalcCorePlan2dFill(sourceWall.thicknessMm, profile);
  return quads.map((q, i) => {
    const pts = q.corners.map((c) => `${sx(c.x)},${sy(crossToSheetYMm(topViewY, c.y, T))}`).join(" ");
    const fill =
      q.kind === "sip"
        ? pixiHexToCss(coreFill.color, coreFill.alpha)
        : (() => {
            const { color, alpha } = lumberPlan2dFillForRoleAndMaterial(q.role, q.materialType);
            return pixiHexToCss(color, alpha);
          })();
    return (
      <polygon
        key={`wd-topcalc-${q.kind}-${i}`}
        points={pts}
        fill={fill}
        stroke="none"
        vectorEffect="non-scaling-stroke"
      />
    );
  });
}

export interface WallDetailTopViewPlanProps {
  readonly wall: Wall;
  readonly lengthMm: number;
  readonly project: Project;
  /** Расчёт стены — для отрисовки каркаса в плане (как на 2D). */
  readonly wallCalculation: WallCalculationResult | null;
  readonly topViewY: number;
  readonly zoom: number;
  readonly sx: (mm: number) => number;
  readonly sy: (mm: number) => number;
  readonly openings: readonly Opening[];
}

/**
 * Рендер послойной стены и проёмов как на 2D-плане (walls2dPixi.drawWallLayeredPlan + проёмы)
 * и расчётный слой из collectWallCalculationPlanQuads (как drawWallCalculationOverlay2d).
 */
export function WallDetailTopViewPlan(props: WallDetailTopViewPlanProps) {
  const { wall, lengthMm: L, project, wallCalculation, topViewY, zoom, sx, sy, openings } = props;
  const T = wall.thicknessMm;
  const wPlan = wallAlongPositiveX(wall, L);
  const profile = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
  const solidWallFill = profile?.layers[0] ? fillColor2dForMaterialType(profile.layers[0].materialType) : 0x5aa7ff;
  const stripsResolved: WallProfileLayerStripMm[] | null = profile
    ? resolveWallProfileLayerStripsMm(T, profile)
    : null;

  const strokePx = Math.max(2, T * zoom);
  const layered =
    stripsResolved != null &&
    stripsResolved.length >= 2 &&
    strokePx >= MIN_LAYERED_WALL_SCREEN_THICKNESS_PX;

  const seamAlpha = 0.26;
  const edgeAlpha = 0.18;

  const openingOnWall = openings.filter((o) => o.wallId === wall.id && o.offsetFromStartMm != null);

  const calcOverlay =
    wallCalculation != null ? wallCalculationPlanOverlaySvg(wPlan, wall, project, wallCalculation, topViewY, T, sx, sy) : null;

  if (layered && stripsResolved) {
    const strips = stripsResolved;
    let acc = -T / 2;
    const stripEls: ReactNode[] = [];
    for (const strip of strips) {
      const off0 = acc;
      const off1 = acc + strip.thicknessMm;
      acc = off1;
      const corners = quadCornersAlongWallMm(0, 0, L, 0, off0, off1);
      if (!corners) continue;
      const pts = corners
        .map((c) => `${sx(c.x)},${sy(crossToSheetYMm(topViewY, c.y, T))}`)
        .join(" ");
      const fillHex = fillColor2dForMaterialType(strip.materialType);
      stripEls.push(
        <polygon
          key={`strip-${strip.layerId}-${off0}`}
          points={pts}
          fill={pixiHexToCss(fillHex, 0.92)}
          stroke={pixiHexToCss(0x0f1218, edgeAlpha)}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }

    acc = -T / 2;
    const seamEls: ReactNode[] = [];
    for (let i = 0; i < strips.length - 1; i++) {
      acc += strips[i]!.thicknessMm;
      const off = acc;
      const yLine = crossToSheetYMm(topViewY, off, T);
      seamEls.push(
        <line
          key={`seam-${i}`}
          x1={sx(0)}
          y1={sy(yLine)}
          x2={sx(L)}
          y2={sy(yLine)}
          stroke={pixiHexToCss(0x0a0c10, seamAlpha)}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }

    const openEls: ReactNode[] = [];
    for (const o of openingOnWall) {
      const corners = openingSlotCornersMm(wPlan, o.offsetFromStartMm!, o.widthMm, 1);
      if (!corners) continue;
      const empty = o.isEmptyOpening === true;
      const fillCol = empty ? 0x8b939e : 0x5aa7ff;
      const fillA = empty ? 0.55 : 0.38;
      const pts = corners
        .map((c) => `${sx(c.x)},${sy(crossToSheetYMm(topViewY, c.y, T))}`)
        .join(" ");
      openEls.push(
        <polygon
          key={`op-${o.id}`}
          points={pts}
          fill={pixiHexToCss(fillCol, fillA)}
          stroke={pixiHexToCss(0x2563eb, 0.88)}
          strokeWidth={1.35}
          vectorEffect="non-scaling-stroke"
        />,
      );
      if (empty) {
        const mid = { x: (corners[0]!.x + corners[2]!.x) / 2, y: (corners[0]!.y + corners[2]!.y) / 2 };
        openEls.push(
          <line
            key={`op-diag-${o.id}`}
            x1={sx(mid.x - 40)}
            y1={sy(crossToSheetYMm(topViewY, mid.y - 40, T))}
            x2={sx(mid.x + 40)}
            y2={sy(crossToSheetYMm(topViewY, mid.y + 40, T))}
            stroke="rgba(42,48,56,0.5)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />,
        );
      }
    }

    return (
      <g className="wd-top-plan-layered">
        {stripEls}
        {seamEls}
        {calcOverlay}
        {openEls}
      </g>
    );
  }

  /** Простая полоса стены (как drawWallStrokeSimple) + расчётный слой поверх. */
  const corners = quadCornersAlongWallMm(0, 0, L, 0, -T / 2, T / 2);
  const pts =
    corners?.map((c) => `${sx(c.x)},${sy(crossToSheetYMm(topViewY, c.y, T))}`).join(" ") ?? "";
  const openEls: ReactNode[] = [];
  for (const o of openingOnWall) {
    const c = openingSlotCornersMm(wPlan, o.offsetFromStartMm!, o.widthMm, 1);
    if (!c) continue;
    const empty = o.isEmptyOpening === true;
    const fillCol = empty ? 0x8b939e : 0x5aa7ff;
    const fillA = empty ? 0.55 : 0.38;
    const cpts = c.map((p) => `${sx(p.x)},${sy(crossToSheetYMm(topViewY, p.y, T))}`).join(" ");
    openEls.push(
      <polygon
        key={`op-${o.id}`}
        points={cpts}
        fill={pixiHexToCss(fillCol, fillA)}
        stroke={pixiHexToCss(0x2563eb, 0.88)}
        strokeWidth={1.35}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  return (
    <g className="wd-top-plan-simple">
      {pts ? (
        <polygon
          points={pts}
          fill={pixiHexToCss(solidWallFill, 0.95)}
          stroke={pixiHexToCss(0x0f1218, 0.18)}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {calcOverlay}
      {openEls}
    </g>
  );
}
