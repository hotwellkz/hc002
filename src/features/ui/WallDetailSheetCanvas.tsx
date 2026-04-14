import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";
import type { Opening } from "@/core/domain/opening";
import { getProfileById } from "@/core/domain/profileOps";
import { resolveWallCalculationModel } from "@/core/domain/wallManufacturing";
import {
  applyWallDetailDimensionEdit,
  buildWallDetailOpeningChainSegmentsWithEdit,
  mapSipOrSheetHorizontalSegmentsWithEdit,
  wallDetailDimEditHandleKey,
  wallDetailHorizontalInteractionKey,
  type WallDetailDimEditHandle,
  type WallDetailHorizontalDimSegment,
} from "@/core/domain/wallDetailDimensionEdit";

import { resolveRoofUnderTrimTopProfileMm, wallTopHeightAboveBaseAtAlongMm } from "@/core/domain/wallRoofUnderTrim";
import { useAppStore } from "@/store/useAppStore";

import { DimensionMmPopover } from "@/features/ui/DimensionMmPopover";
import "./wall-detail-workspace.css";
import {
  frameStudCentersAlongWallMm,
  internalWallJointSeamCentersAlongFullHeightMm,
  internalWallJointSeamCentersAlongMm,
  lumberPieceWallElevationRectMm,
} from "@/core/domain/wallCalculation3dSpecs";
import {
  DIMENSION_FONT_SIZE_WALL_DETAIL_VERTICAL_OPENING_PX,
  DIMENSION_V_LABEL_GAP_OPENING_INTERIOR_PX,
} from "@/shared/dimensionStyle";
import {
  sheetInteriorCutXsAlongWallFromRegionsMm,
  sipPanelHorizontalDimensionSegmentsWallDetailMm,
  wallDetailSheetPanelVerticalBoundaryXsMm,
  wallDetailSipFullHeightOsbSeamXsMm,
  wallDetailSipOpeningStripVerticalSeamSegmentsMm,
  type WallDetailSipFacadeSlice,
} from "@/core/domain/wallDetailSipElevation";
import {
  formatSipPanelDisplayMark,
  lumberGroupedPositionIndexByPieceId,
  lumberPiecesSortedForDisplay,
} from "@/core/domain/pieceDisplayMark";
import {
  drawDimensionLevel,
  VerticalDimensionMm,
  WD_DIM_V_LABEL_GAP_EXTRA_PX,
  WD_DIM_V_LABEL_GAP_PX,
  type WallDetailDimInteraction,
  type WallDetailDimSegmentView,
} from "@/features/ui/wallDetailDimensionsSvg";
import {
  computeInsideOpeningVerticalDimPlacementMm,
  lumberElevationRectsSheetMm,
  seamCentersInOpeningSpanMm,
  sipPanelMarkRectsSheetMm,
} from "@/features/ui/wallDetailOpeningVerticalDimsLayout";
import {
  computeWallDetailOpeningLabelLayout,
  openingLabelLineHeightPx,
} from "@/features/ui/wallDetailOpeningLabelLayout";
import { computeLumberPieceNumberLabelPx } from "@/features/ui/wallDetailLumberPieceLabelLayout";
import { WallDetailTopViewPlan } from "@/features/ui/wallDetailTopView2d";
import { WallDetailMiniPlanLocator } from "@/features/ui/wallDetailMiniPlanLocator";
import { useWallDetailSidePanelData } from "@/features/ui/wallDetailSidePanelData";

/** Верх фасада стены (мм по листу). */
const SHEET_WALL_TOP_MM = 96;
/** Baseline заголовка стены выше верхней кромки фасада (мм листа) — воздух между подписью и стеной. */
const wallTitleBaselineAboveWallTopMm = 60;
/** Горизонтальная зона слева под вертикальные размеры фасада (мм). */
const LEFT_DIM_X0_MM = -118;
/** Пиксели: верх подписи от оси горизонтальной размерной линии — ряд SIP (1250, 963, …). */
const wallPanelDimLabelOffsetY = 8;
/** Пиксели: то же для общего габарита стены (8463, …). */
const wallOverallDimLabelOffsetY = 8;
/** Низ фасада → первая размерная линия (SIP по ширине). */
const gapWallToPanelDimsMm = 220;
/** Ряд SIP → ряд общего габарита стены. */
const gapPanelDimsToOverallDimsMm = 140;
/** Ряд общего/предыдущий → ряд пролётов у проёмов. */
const gapOpeningDimRowAfterPreviousMm = 140;
/** Последний горизонтальный ряд размеров стены → заголовок «Вид сверху» (заметный разрыв групп). */
const gapOverallDimsToTopViewTitleMm = 300;
/** Заголовок «Вид сверху» → верх полосы плана. */
const gapTopViewTitleToTopViewMm = 96;
/** Низ блока «Вид сверху» → нижнее поле листа (воздух под планом и вертикальным размером толщины). */
const gapTopViewToTopViewDimsMm = 48;
/** Дополнительная высота на строки внутри одного уровня при пересечении сегментов по X. */
const DIM_ROW_STACK_STEP_MM = 38;
/** Ниже последнего ряда размеров — запас под подписи. */
const SHEET_PAD_BOTTOM_MM = 56;
/** Ниже и справа/слева листа — поля для fit. */
const FIT_PADDING_PX = 28;
/** Минимальный и максимальный масштаб (мм листа → пиксель). */
const ZOOM_MIN = 0.015;
const ZOOM_MAX = 0.45;

/** Центр подписи листа: центроид подрезанного полигона или середина bbox. */
function sipSliceLabelCenterSheetMm(sl: WallDetailSipFacadeSlice): { readonly x: number; readonly y: number } {
  if (sl.kind === "column" && sl.trimPolygonSheetMm && sl.trimPolygonSheetMm.length >= 3) {
    const pts = sl.trimPolygonSheetMm;
    let twiceA = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const p0 = pts[i]!;
      const p1 = pts[j]!;
      const cross = p0.x * p1.y - p1.x * p0.y;
      twiceA += cross;
      cx += (p0.x + p1.x) * cross;
      cy += (p0.y + p1.y) * cross;
    }
    if (Math.abs(twiceA) > 1e-3) {
      return { x: cx / (3 * twiceA), y: cy / (3 * twiceA) };
    }
  }
  return { x: (sl.drawX0 + sl.drawX1) / 2, y: (sl.drawY0 + sl.drawY1) / 2 };
}

function dimStackDepth(segments: readonly { a: number; b: number }[]): number {
  const placed: { x0: number; x1: number; row: number }[] = [];
  let maxRow = 0;
  for (const s of segments) {
    const minX = Math.min(s.a, s.b);
    const maxX = Math.max(s.a, s.b);
    let row = 0;
    while (
      placed.some((p) => {
        if (p.row !== row) return false;
        const overlap = Math.min(maxX, p.x1) - Math.max(minX, p.x0);
        return overlap > 0.5;
      })
    ) {
      row += 1;
    }
    placed.push({ x0: minX, x1: maxX, row });
    maxRow = Math.max(maxRow, row);
  }
  return maxRow + 1;
}

/**
 * Запас под подпись горизонтального размера под линией (мм листа).
 * Подписи в px; при типичном fit (zoom ~0.08–0.15) даёт ~30–45 px — без налезания на следующий блок.
 * Layout не привязываем к zoom, иначе срабатывает fit и сбивает масштаб пользователя.
 */
const DIM_H_LABEL_TAIL_BELOW_LINE_MM = 300;

/** Нижняя граница последней размерной линии уровня + хвост под подпись. */
function bottomOfDimLevel(baseYMm: number, segments: readonly { a: number; b: number }[]): number {
  const depth = Math.max(1, segments.length === 0 ? 1 : dimStackDepth(segments));
  const lastLineMm = baseYMm + (depth - 1) * DIM_ROW_STACK_STEP_MM;
  return lastLineMm + DIM_H_LABEL_TAIL_BELOW_LINE_MM;
}

/** Прямоугольник в мм листа (y вниз, как в SVG). */
interface SheetMmRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function intersectSheetRects(a: SheetMmRect, b: SheetMmRect): SheetMmRect | null {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  if (x1 - x0 < 0.5 || y1 - y0 < 0.5) {
    return null;
  }
  return { x0, y0, x1, y1 };
}

/** Проёмы на фасаде в координатах листа (как в отрисовке проёма). */
function openingRectsSheetMm(openings: readonly Opening[], wallBottomMm: number): SheetMmRect[] {
  const out: SheetMmRect[] = [];
  for (const o of openings) {
    if (o.offsetFromStartMm == null) continue;
    const x0 = o.offsetFromStartMm;
    const x1 = x0 + o.widthMm;
    const yTop =
      o.kind === "door" ? wallBottomMm - o.heightMm : wallBottomMm - o.heightMm - (o.sillHeightMm ?? 0);
    const yBot = yTop + o.heightMm;
    out.push({ x0, y0: yTop, x1, y1: yBot });
  }
  return out;
}

/** Вырезы проёмов внутри прямоугольника SIP-панели (ядро между обвязками). */
function sipPanelHoleRectsMm(
  panelX0: number,
  panelX1: number,
  coreTopMm: number,
  coreBottomMm: number,
  openings: readonly Opening[],
  wallBottomMm: number,
): SheetMmRect[] {
  const panel: SheetMmRect = { x0: panelX0, y0: coreTopMm, x1: panelX1, y1: coreBottomMm };
  const holes: SheetMmRect[] = [];
  for (const r of openingRectsSheetMm(openings, wallBottomMm)) {
    const ir = intersectSheetRects(panel, r);
    if (ir) {
      holes.push(ir);
    }
  }
  return holes;
}

export interface WallDetailSheetCanvasProps {
  readonly project: Project;
  readonly wall: Wall;
  /** Во вкладке «Вид стены» — true; в отчёте — false. */
  readonly showTopView?: boolean;
  /** Мини-план с выделением стены (отчёт). */
  readonly showMiniPlan?: boolean;
  /** Без интерактивных размеров и поповера (отчёт/PDF). */
  readonly reportMode?: boolean;
  readonly hideScrollHint?: boolean;
}

export function WallDetailSheetCanvas({
  project,
  wall,
  showTopView = true,
  showMiniPlan = false,
  reportMode = false,
  hideScrollHint = false,
}: WallDetailSheetCanvasProps) {
  const { calc, openingsOnWall, wallLabel, sipFacadeSlices, sipPanelGrouping, isSipLikeWall } =
    useWallDetailSidePanelData(project, wall);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(0.12);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const fitGenerationRef = useRef(0);
  const svgUid = useId().replace(/:/g, "");

  const L = wall ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : 0;
  const H = wall?.heightMm ?? 0;

  const lumberPositionByPieceId = useMemo(
    () => (calc ? lumberGroupedPositionIndexByPieceId(calc.lumberPieces) : new Map<string, number>()),
    [calc],
  );

  const layout = useMemo(() => {
    if (!wall) return null;
    const wallTop = SHEET_WALL_TOP_MM;
    const wallBottom = wallTop + H;
    const titleBaseline = wallTop - wallTitleBaselineAboveWallTopMm;

    /** Высота полосы «вида сверху» в мм листа = реальная толщина стены (как на 2D, 1:1 с длиной). */
    const topViewH = wall.thicknessMm;

    const sipShell =
      calc && calc.sipRegions.length > 0
        ? {
            x0: Math.min(...calc.sipRegions.map((r) => r.startOffsetMm)),
            x1: Math.max(...calc.sipRegions.map((r) => r.endOffsetMm)),
          }
        : { x0: 0, x1: L };
    const prof = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
    const wm = prof ? resolveWallCalculationModel(prof) : null;
    const isFrameWallModel = wm === "frame" || wm === "sheet";
    /** Каркас/ГКЛ и листовой без каркаса: разрезы по границам листов; SIP — стыки OSB по joint_board. */
    const seamCentersForSheetDims =
      calc && isFrameWallModel && calc.sipRegions.length > 0
        ? sheetInteriorCutXsAlongWallFromRegionsMm(calc.sipRegions, sipShell.x0, sipShell.x1)
        : calc
          ? internalWallJointSeamCentersAlongMm(calc)
          : [];
    const frontLevel1Raw =
      calc && calc.sipRegions.length > 0
        ? sipPanelHorizontalDimensionSegmentsWallDetailMm(sipShell.x0, sipShell.x1, seamCentersForSheetDims, openingsOnWall, {
            omitClearOpeningCutsAlongWall: isFrameWallModel,
          })
        : [];
    const frontLevel1 = mapSipOrSheetHorizontalSegmentsWithEdit(frontLevel1Raw, L, openingsOnWall);
    const frontLevel2Raw = buildWallDetailOpeningChainSegmentsWithEdit(L, openingsOnWall);
    const frontLevel3: WallDetailHorizontalDimSegment[] = [
      { a: 0, b: L, text: `${Math.round(L)}`, edit: { kind: "wall_total_length" } },
    ];

    /** Одна SIP-панель на всю длину — общий габарит уже в первой цепочке; третья строка дублировала бы число (напр. 5937). */
    const showOverallLengthRow = !(
      calc &&
      calc.sipRegions.length === 1 &&
      Math.abs(calc.sipRegions[0]!.startOffsetMm) < 0.5 &&
      Math.abs(calc.sipRegions[0]!.endOffsetMm - L) < 0.5
    );

    /** Без проёмов цепочка даёт один сегмент 0…L — тот же общий габарит, что и в `frontLevel3`. */
    const frontLevel2 = filterDuplicateFullWallHorizontalDimSegments(frontLevel2Raw, L, showOverallLengthRow, frontLevel1);

    const dimHandleByKey = new Map<string, WallDetailDimEditHandle>();
    const collectDimKeys = (segs: readonly WallDetailHorizontalDimSegment[]): void => {
      for (const s of segs) {
        if (s.edit) {
          dimHandleByKey.set(wallDetailHorizontalInteractionKey(s.edit, s.a, s.b), s.edit);
        }
      }
    };
    collectDimKeys(frontLevel1);
    collectDimKeys(frontLevel2);
    if (showOverallLengthRow) {
      collectDimKeys(frontLevel3);
    }
    dimHandleByKey.set(wallDetailDimEditHandleKey({ kind: "wall_height", wallId: wall.id }), {
      kind: "wall_height",
      wallId: wall.id,
    });
    for (const o of openingsOnWall) {
      if (o.kind === "window") {
        dimHandleByKey.set(wallDetailDimEditHandleKey({ kind: "opening_sill_height", openingId: o.id }), {
          kind: "opening_sill_height",
          openingId: o.id,
        });
        dimHandleByKey.set(wallDetailDimEditHandleKey({ kind: "opening_height", openingId: o.id }), {
          kind: "opening_height",
          openingId: o.id,
        });
      } else if (o.kind === "door") {
        dimHandleByKey.set(wallDetailDimEditHandleKey({ kind: "opening_height", openingId: o.id }), {
          kind: "opening_height",
          openingId: o.id,
        });
      }
    }

    /**
     * Сверху вниз: SIP по ширине → общий габарит → пролёты у проёмов (если есть) → большой отступ → «Вид сверху» → план → поле под размер толщины.
     * В отчётах (reportMode) горизонтальные ряды размеров делаем плотнее, чтобы основной вид оставался крупным.
     */
    const gapWallToPanelDimsMmLocal = reportMode ? 150 : gapWallToPanelDimsMm;
    const gapPanelDimsToOverallDimsMmLocal = reportMode ? 96 : gapPanelDimsToOverallDimsMm;
    const gapOpeningDimRowAfterPreviousMmLocal = reportMode ? 96 : gapOpeningDimRowAfterPreviousMm;

    let y = wallBottom + gapWallToPanelDimsMmLocal;
    const dimRowSipY = y;
    y = bottomOfDimLevel(dimRowSipY, frontLevel1);

    let dimRowOverallY: number | null = null;
    if (showOverallLengthRow) {
      y += gapPanelDimsToOverallDimsMmLocal;
      dimRowOverallY = y;
      y = bottomOfDimLevel(dimRowOverallY, frontLevel3);
    }

    let dimRowOpeningY: number | null = null;
    if (frontLevel2.length > 0) {
      y += gapOpeningDimRowAfterPreviousMmLocal;
      dimRowOpeningY = y;
      y = bottomOfDimLevel(dimRowOpeningY, frontLevel2);
    }

    const dimsEndAfterHorizontal = y;

    let topViewSubtitleBaselineY = 0;
    let topViewY = 0;
    let topViewBottom = 0;

    let sheetBottom: number;
    if (showTopView) {
      topViewSubtitleBaselineY = dimsEndAfterHorizontal + gapOverallDimsToTopViewTitleMm;
      topViewY = topViewSubtitleBaselineY + gapTopViewTitleToTopViewMm;
      topViewBottom = topViewY + topViewH;
      sheetBottom = topViewBottom + gapTopViewToTopViewDimsMm + SHEET_PAD_BOTTOM_MM;
    } else {
      sheetBottom = dimsEndAfterHorizontal + SHEET_PAD_BOTTOM_MM;
    }

    let contentRightEdgeMm = L + 72;
    for (const o of openingsOnWall) {
      const x = o.offsetFromStartMm ?? 0;
      contentRightEdgeMm = Math.max(contentRightEdgeMm, x + o.widthMm + (o.kind === "window" ? 56 : 48));
    }

    /**
     * Мини‑план в отчёте больше, но он не должен влиять на auto‑fit основного вида.
     * Поэтому отдельно сохраняем primary‑правую границу до размещения мини‑плана.
     */
    const primaryContentRightEdgeMm = contentRightEdgeMm;

    const MINI_PLAN_SIZE_MM = reportMode ? 1560 : 168;
    const MINI_PLAN_GAP_BELOW_DIMS_MM = 32;
    const MINI_PLAN_MARGIN_RIGHT_MM = 36;
    const MINI_PLAN_MARGIN_BOTTOM_MM = 40;

    let miniPlanBox: { x0: number; y0: number; sizeMm: number } | null = null;
    if (showMiniPlan) {
      const band = MINI_PLAN_GAP_BELOW_DIMS_MM + MINI_PLAN_SIZE_MM + MINI_PLAN_MARGIN_BOTTOM_MM;
      sheetBottom = Math.max(sheetBottom, dimsEndAfterHorizontal + band);
      const boxX0 = Math.max(
        8,
        contentRightEdgeMm + 56 - MINI_PLAN_MARGIN_RIGHT_MM - MINI_PLAN_SIZE_MM,
      );
      const boxY0 = sheetBottom - MINI_PLAN_MARGIN_BOTTOM_MM - MINI_PLAN_SIZE_MM;
      miniPlanBox = { x0: boxX0, y0: boxY0, sizeMm: MINI_PLAN_SIZE_MM };
      contentRightEdgeMm = Math.max(contentRightEdgeMm, boxX0 + MINI_PLAN_SIZE_MM + MINI_PLAN_MARGIN_RIGHT_MM);
    }

    return {
      wallTop,
      wallBottom,
      titleBaseline,
      topViewSubtitleBaselineY,
      topViewY,
      topViewH,
      topViewBottom,
      dimRowSipY,
      dimRowOverallY,
      dimRowOpeningY,
      sheetBottom,
      contentRightEdgeMm,
      primaryContentRightEdgeMm,
      miniPlanBox,
      frontLevel1,
      frontLevel2,
      frontLevel3,
      showOverallLengthRow,
      dimHandleByKey,
    };
  }, [wall, H, L, calc, openingsOnWall, project, showTopView, showMiniPlan, reportMode]);

  /** Вертикали стыков/границ листов и стоек — чтобы оси размеров проёмов не совпадали с линиями чертежа. */
  const verticalBoundaryXsForOpeningDims = useMemo(() => {
    if (sipFacadeSlices.length === 0) {
      return [] as number[];
    }
    /** Без укороченных JB над/под окном — иначе пунктир на всю высоту через проём. */
    const internalSeamCentersAlong = calc ? internalWallJointSeamCentersAlongFullHeightMm(calc) : [];
    const sheetPanelVerticalBoundaryXsMm = wallDetailSheetPanelVerticalBoundaryXsMm(sipFacadeSlices);
    return isSipLikeWall
      ? wallDetailSipFullHeightOsbSeamXsMm(sipFacadeSlices, internalSeamCentersAlong)
      : sheetPanelVerticalBoundaryXsMm;
  }, [sipFacadeSlices, calc, isSipLikeWall]);

  /** Пунктир деления полосы SIP над/под окном — только по высоте этих вставок. */
  const sipOpeningStripVerticalSeamSegments = useMemo(
    () =>
      sipFacadeSlices.length > 0 && isSipLikeWall ? wallDetailSipOpeningStripVerticalSeamSegmentsMm(sipFacadeSlices) : [],
    [sipFacadeSlices, isSipLikeWall],
  );

  const frameStudXsForOpeningDims = useMemo(
    () => (calc && !isSipLikeWall ? frameStudCentersAlongWallMm(calc) : []),
    [calc, isSipLikeWall],
  );

  const lumberRectsSheetMm = useMemo(() => {
    if (!calc || !wall) {
      return [];
    }
    const wallTop = SHEET_WALL_TOP_MM;
    const rects = lumberPiecesSortedForDisplay(calc.lumberPieces).map((p) =>
      lumberPieceWallElevationRectMm(p, wall, project, calc),
    );
    const base = lumberElevationRectsSheetMm(rects, wallTop, H);
    const pad = 5;
    return base.map((r) => ({
      x0: r.x0 - pad,
      x1: r.x1 + pad,
      y0: r.y0 - pad,
      y1: r.y1 + pad,
    }));
  }, [calc, wall, project, H]);

  const sipPanelMarkRectsSheet = useMemo(
    () => (sipFacadeSlices.length > 0 ? sipPanelMarkRectsSheetMm(sipFacadeSlices) : []),
    [sipFacadeSlices],
  );

  const openingInsideVerticalDimByOpeningId = useMemo(() => {
    const map = new Map<
      string,
      { xLineMm: number; labelSide: "left" | "right"; isOutsideOpening: boolean }
    >();
    if (!wall) {
      return map;
    }
    const wallBottom = SHEET_WALL_TOP_MM + H;
    const labelGapPx = DIMENSION_V_LABEL_GAP_OPENING_INTERIOR_PX;
    const fontPx = DIMENSION_FONT_SIZE_WALL_DETAIL_VERTICAL_OPENING_PX;
    for (const o of openingsOnWall) {
      const x0 = o.offsetFromStartMm ?? 0;
      const x1 = x0 + o.widthMm;
      const yTop =
        o.kind === "door" ? wallBottom - o.heightMm : wallBottom - o.heightMm - (o.sillHeightMm ?? 0);
      const openBottom = yTop + o.heightMm;
      const sillMm = o.kind === "window" ? o.sillHeightMm ?? o.position?.sillLevelMm ?? 900 : 0;
      const segments =
        o.kind === "window"
          ? [
              { y0Mm: openBottom, y1Mm: wallBottom, text: `${Math.round(sillMm)}` },
              { y0Mm: yTop, y1Mm: openBottom, text: `${Math.round(o.heightMm)}` },
            ]
          : [{ y0Mm: yTop, y1Mm: openBottom, text: `${Math.round(o.heightMm)}` }];
      const seamObstacles = [
        ...seamCentersInOpeningSpanMm(verticalBoundaryXsForOpeningDims, x0, x1),
        ...frameStudXsForOpeningDims.filter((cx) => cx > x0 + 1 && cx < x1 - 1),
      ];
      const pl = computeInsideOpeningVerticalDimPlacementMm(
        { openingId: o.id, x0, x1, segments },
        lumberRectsSheetMm,
        sipPanelMarkRectsSheet,
        seamObstacles,
        zoom,
        labelGapPx,
        fontPx,
      );
      map.set(o.id, pl);
    }
    return map;
  }, [
    wall,
    H,
    openingsOnWall,
    lumberRectsSheetMm,
    sipPanelMarkRectsSheet,
    verticalBoundaryXsForOpeningDims,
    frameStudXsForOpeningDims,
    zoom,
  ]);

  const sheetBounds = useMemo(() => {
    if (!wall || !layout) {
      return { minX: 0, minY: 0, maxX: 1600, maxY: 1200 };
    }
    const {
      wallTop,
      wallBottom,
      titleBaseline,
      topViewY,
      topViewH,
      dimRowSipY,
      dimRowOverallY,
      dimRowOpeningY,
      sheetBottom,
      contentRightEdgeMm,
      primaryContentRightEdgeMm,
      miniPlanBox,
      frontLevel1,
      frontLevel2,
      frontLevel3,
      showOverallLengthRow,
    } = layout;

    let minX = LEFT_DIM_X0_MM;
    // В отчёте/PDF масштаб основного вида не должен падать из‑за мини‑плана.
    let maxX = Math.max(L + 48, reportMode ? primaryContentRightEdgeMm : contentRightEdgeMm);
    let minY = Math.min(titleBaseline - 36, wallTop - 8);
    let maxY = sheetBottom;

    for (const o of openingsOnWall) {
      const x = o.offsetFromStartMm ?? 0;
      const openTopY = o.kind === "door" ? wallBottom - o.heightMm : wallBottom - o.heightMm - (o.sillHeightMm ?? 0);
      const labelY = openTopY - 14;
      minY = Math.min(minY, labelY - 8);
      const insidePl = openingInsideVerticalDimByOpeningId.get(o.id);
      const reserveRight =
        insidePl != null && insidePl.isOutsideOpening
          ? insidePl.xLineMm + 72
          : x + o.widthMm + (o.kind === "window" ? 56 : 48);
      maxX = Math.max(maxX, reserveRight);
    }

    if (calc) {
      for (const p of calc.lumberPieces) {
        const rr = lumberPieceWallElevationRectMm(p, wall, project, calc);
        minX = Math.min(minX, rr.x0 - 4);
        maxX = Math.max(maxX, rr.x1 + 4);
        const rectTop = wallTop + H - rr.b1;
        const rh = rr.b1 - rr.b0;
        minY = Math.min(minY, rectTop - 4);
        maxY = Math.max(maxY, rectTop + rh + 4);
      }
      for (const r of calc.sipRegions) {
        maxX = Math.max(maxX, r.endOffsetMm + 8);
      }
    }

    minY = Math.min(minY, titleBaseline - 40);
    if (miniPlanBox && !reportMode) {
      maxX = Math.max(maxX, miniPlanBox.x0 + miniPlanBox.sizeMm + 8);
      maxY = Math.max(maxY, miniPlanBox.y0 + miniPlanBox.sizeMm + 8);
    }
    if (showTopView) {
      maxY = Math.max(maxY, topViewY + topViewH + 8);
    }
    maxY = Math.max(maxY, bottomOfDimLevel(dimRowSipY, frontLevel1));
    if (showOverallLengthRow && dimRowOverallY != null) {
      maxY = Math.max(maxY, bottomOfDimLevel(dimRowOverallY, frontLevel3));
    }
    if (frontLevel2.length > 0 && dimRowOpeningY != null) {
      maxY = Math.max(maxY, bottomOfDimLevel(dimRowOpeningY, frontLevel2));
    }

    minX = Math.min(minX, -128);
    maxX = Math.max(maxX, L + 24);
    maxY = Math.max(maxY, sheetBottom);

    return { minX, minY, maxX, maxY };
  }, [wall, layout, L, H, calc, project, openingsOnWall, openingInsideVerticalDimByOpeningId, showTopView, reportMode]);

  const applyFit = useCallback(() => {
    if (!layout) return;
    const { minX, minY, maxX, maxY } = sheetBounds;
    const cw = Math.max(1, viewport.w);
    const ch = Math.max(1, viewport.h);
    const bw = maxX - minX;
    const bh = maxY - minY;
    if (bw < 1 || bh < 1) return;
    const pad = FIT_PADDING_PX;
    const z = Math.min((cw - 2 * pad) / bw, (ch - 2 * pad) / bh);
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    setZoom(clamped);
    setPanX(pad - minX * clamped);
    setPanY(pad - minY * clamped);
  }, [layout, sheetBounds, viewport.w, viewport.h]);

  /** Чтобы auto-fit не срабатывал при каждом изменении zoom (sheetBounds → applyFit). */
  const applyFitRef = useRef(applyFit);
  applyFitRef.current = applyFit;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewport({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    const r0 = el.getBoundingClientRect();
    setViewport({ w: Math.floor(r0.width), h: Math.floor(r0.height) });
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!wall || !layout) return;
    const gen = ++fitGenerationRef.current;
    const id = requestAnimationFrame(() => {
      if (gen !== fitGenerationRef.current) return;
      applyFitRef.current();
    });
    return () => cancelAnimationFrame(id);
    /** Без `applyFit` в deps: иначе каждый zoom меняет sheetBounds → applyFit → сброс масштаба и «дёрганье». */
  }, [wall?.id, L, H, layout, viewport.w, viewport.h]);

  /** Снимок для отчёта/PDF: повторно вписать после фиксации размера скрытого контейнера. */
  useLayoutEffect(() => {
    if (!reportMode || !layout) {
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => applyFitRef.current());
    });
    return () => cancelAnimationFrame(id);
  }, [reportMode, layout, wall?.id, viewport.w, viewport.h]);

  const sx = useCallback((x: number) => panX + x * zoom, [panX, zoom]);
  const sy = useCallback((y: number) => panY + y * zoom, [panY, zoom]);

  const commitWallDetailProjectUpdate = useAppStore((s) => s.commitWallDetailProjectUpdate);
  const [wallDimHoverKey, setWallDimHoverKey] = useState<string | null>(null);
  const [wallDimPopover, setWallDimPopover] = useState<{
    readonly editKey: string;
    readonly clientX: number;
    readonly clientY: number;
    readonly valueStr: string;
    readonly error: string | null;
  } | null>(null);

  useEffect(() => {
    setWallDimPopover(null);
    setWallDimHoverKey(null);
  }, [wall?.id]);

  const wallDimInteraction: WallDetailDimInteraction | undefined = useMemo(() => {
    if (!wall || reportMode) {
      return undefined;
    }
    return {
      activeKey: wallDimPopover?.editKey ?? null,
      hoverKey: wallDimHoverKey,
      onActivate: (editKey: string, clientX: number, clientY: number, valueMm: number) => {
        setWallDimHoverKey(null);
        setWallDimPopover({
          editKey,
          clientX,
          clientY,
          valueStr: String(valueMm),
          error: null,
        });
      },
      onHoverKey: (k: string | null) => setWallDimHoverKey(k),
    };
  }, [wall, wallDimPopover?.editKey, wallDimHoverKey, reportMode]);

  const applyWallDimPopover = useCallback(() => {
    if (!wall || !layout || !wallDimPopover) {
      return;
    }
    const handle = layout.dimHandleByKey.get(wallDimPopover.editKey);
    if (!handle) {
      setWallDimPopover((p) => (p ? { ...p, error: "Неизвестный размер." } : null));
      return;
    }
    const digits = wallDimPopover.valueStr.replace(/\D/g, "");
    if (digits.length === 0) {
      setWallDimPopover((p) => (p ? { ...p, error: "Введите число в мм." } : null));
      return;
    }
    const v = parseInt(digits, 10);
    const r = applyWallDetailDimensionEdit(project, wall.id, handle, v);
    if ("error" in r) {
      setWallDimPopover((p) => (p ? { ...p, error: r.error } : null));
      return;
    }
    commitWallDetailProjectUpdate(r.project);
    setWallDimPopover(null);
  }, [wall, layout, wallDimPopover, project, commitWallDetailProjectUpdate]);

  const cancelWallDimPopover = useCallback(() => setWallDimPopover(null), []);

  if (!wall || !layout) {
    return <div className="wd-empty">Нет стен для отображения.</div>;
  }

  const dimSegView = (s: WallDetailHorizontalDimSegment): WallDetailDimSegmentView => ({
    a: s.a,
    b: s.b,
    text: s.text,
    editKey: s.edit ? wallDetailHorizontalInteractionKey(s.edit, s.a, s.b) : null,
  });

  const {
    wallTop,
    wallBottom,
    titleBaseline,
    topViewSubtitleBaselineY,
    topViewY,
    topViewH,
    dimRowSipY,
    dimRowOverallY,
    dimRowOpeningY,
    miniPlanBox,
    frontLevel1,
    frontLevel2,
    frontLevel3,
    showOverallLengthRow,
  } = layout;

  const panelHeightMm = H;
  const panelTop = wallTop;
  /** Вертикальные штрих-пунктиры стыков OSB на фасаде — полная высота стены. */
  const sipOsbSeamYTop = wallTop;
  const sipOsbSeamYBottom = wallBottom;

  const sipAlongSpan = useMemo(() => {
    if (!calc || calc.sipRegions.length === 0) {
      return { x0: 0, x1: L };
    }
    return {
      x0: Math.min(...calc.sipRegions.map((r) => r.startOffsetMm)),
      x1: Math.max(...calc.sipRegions.map((r) => r.endOffsetMm)),
    };
  }, [calc, L]);

  /** Подрезка под крышу: без верхней «прямой» по всей ширине; вертикали швов — до линии кровли в точке x. */
  const roofTrimSeams = wall.roofUnderTrim != null;

  /** Фасад с подрезкой под крышу: полигон по профилю (не один прямоугольник). */
  const roofTrimWallPathPx = useMemo(() => {
    if (!wall.roofUnderTrim) {
      return null;
    }
    const prof = resolveRoofUnderTrimTopProfileMm(wall, L);
    if (prof.length < 2) {
      return null;
    }
    const parts: string[] = [];
    parts.push(`M ${sx(0)} ${sy(wallBottom)}`);
    parts.push(`L ${sx(L)} ${sy(wallBottom)}`);
    for (let i = prof.length - 1; i >= 0; i--) {
      const p = prof[i]!;
      parts.push(`L ${sx(p.alongMm)} ${sy(wallBottom - p.heightMm)}`);
    }
    parts.push("Z");
    return parts.join(" ");
  }, [wall, wall.roofUnderTrim, L, wallBottom, sx, sy]);

  /** Те же массивы, что для раскладки вертикальных размеров проёмов. */
  const verticalSipBoundaryXsMm = verticalBoundaryXsForOpeningDims;
  const frameStudCenterXsMm = frameStudXsForOpeningDims;

  const onWheelZoom = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sheetX = (mx - panX) / zoom;
    const sheetY = (my - panY) / zoom;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dy *= rect.height;
    }
    const factor = dy < 0 ? 1.08 : 1 / 1.08;
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
    setPanX(mx - sheetX * next);
    setPanY(my - sheetY * next);
    setZoom(next);
  }, [panX, panY, zoom]);

  useEffect(() => {
    if (reportMode) {
      return;
    }
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    el.addEventListener("wheel", onWheelZoom, { passive: false });
    return () => el.removeEventListener("wheel", onWheelZoom);
  }, [onWheelZoom, reportMode]);

  return (
    <>
      <div
        ref={wrapRef}
        className={reportMode ? "wd-canvas-wrap wd-canvas-wrap--report" : "wd-canvas-wrap"}
        onPointerDown={(e) => {
          if (reportMode) {
            return;
          }
          setDrag({ x: e.clientX, y: e.clientY, panX, panY });
        }}
        onPointerMove={(e) => {
          if (reportMode || !drag) return;
          setPanX(drag.panX + (e.clientX - drag.x));
          setPanY(drag.panY + (e.clientY - drag.y));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        onDoubleClick={(e) => {
          if (reportMode) {
            return;
          }
          if ((e.target as HTMLElement).closest("button")) return;
          applyFit();
        }}
      >
          <svg
            ref={svgRef}
            className={reportMode ? "wd-canvas wd-canvas--report" : "wd-canvas"}
            viewBox={`0 0 ${Math.max(1, viewport.w)} ${Math.max(1, viewport.h)}`}
            preserveAspectRatio="none"
          >
            {roofTrimWallPathPx ? (
              <path d={roofTrimWallPathPx} className={`wd-wall ${isSipLikeWall ? "wd-wall--sip" : "wd-wall--sheet"}`} />
            ) : (
              <rect
                x={sx(0)}
                y={sy(wallTop)}
                width={Math.max(1, L * zoom)}
                height={Math.max(1, H * zoom)}
                className={`wd-wall ${isSipLikeWall ? "wd-wall--sip" : "wd-wall--sheet"}`}
              />
            )}
            <rect x={sx(0)} y={sy(panelTop)} width={Math.max(1, L * zoom)} height={Math.max(1, panelHeightMm * zoom)} className="wd-panel-outline" />
            <VerticalDimensionMm
              xLineMm={-40}
              y0Mm={wallTop}
              y1Mm={wallBottom}
              text={`${Math.round(H)} мм`}
              sx={sx}
              sy={sy}
              editKey={wallDetailDimEditHandleKey({ kind: "wall_height", wallId: wall.id })}
              interaction={wallDimInteraction}
              reportedValueMm={Math.round(H)}
            />

            {calc ? (
              <defs>
                <pattern
                  id={`${svgUid}-sip-hatch`}
                  patternUnits="userSpaceOnUse"
                  width={Math.max(4, 13 * zoom)}
                  height={Math.max(4, 13 * zoom)}
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2={Math.max(4, 13 * zoom)}
                    className="wd-sip-hatch-line"
                  />
                </pattern>
              </defs>
            ) : null}

            {calc
              ? sipFacadeSlices.map((sl) => {
                  if (sl.kind === "column") {
                    const r = sl.region;
                    const trimPoly = sl.trimPolygonSheetMm;
                    const holes = sipPanelHoleRectsMm(
                      sl.drawX0,
                      sl.drawX1,
                      sl.drawY0,
                      sl.drawY1,
                      openingsOnWall,
                      wallBottom,
                    );
                    const maskId = `${svgUid}-sipmask-${r.index}`;
                    const wPx = Math.max(1, (sl.drawX1 - sl.drawX0) * zoom);
                    const hPx = Math.max(1, (sl.drawY1 - sl.drawY0) * zoom);
                    const polyPoints =
                      trimPoly && trimPoly.length >= 3
                        ? trimPoly.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")
                        : null;
                    return (
                      <g key={r.id} className="wd-sip-panel-layer">
                        {polyPoints ? (
                          <polygon points={polyPoints} className={`wd-sip ${isSipLikeWall ? "wd-sip--sip" : "wd-sip--sheet"}`} />
                        ) : (
                          <rect
                            x={sx(sl.drawX0)}
                            y={sy(sl.drawY0)}
                            width={wPx}
                            height={hPx}
                            className={`wd-sip ${isSipLikeWall ? "wd-sip--sip" : "wd-sip--sheet"}`}
                          />
                        )}
                        <mask id={maskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
                          {polyPoints ? (
                            <polygon points={polyPoints} fill="white" />
                          ) : (
                            <rect x={sx(sl.drawX0)} y={sy(sl.drawY0)} width={wPx} height={hPx} fill="white" />
                          )}
                          {holes.map((h, hi) => {
                            const hw = Math.max(1, (h.x1 - h.x0) * zoom);
                            const hh = Math.max(1, (h.y1 - h.y0) * zoom);
                            return <rect key={hi} x={sx(h.x0)} y={sy(h.y0)} width={hw} height={hh} fill="black" />;
                          })}
                        </mask>
                        {polyPoints ? (
                          <polygon
                            points={polyPoints}
                            fill={`url(#${svgUid}-sip-hatch)`}
                            mask={`url(#${maskId})`}
                            className="wd-sip-hatch-layer"
                          />
                        ) : (
                          <rect
                            x={sx(sl.drawX0)}
                            y={sy(sl.drawY0)}
                            width={wPx}
                            height={hPx}
                            fill={`url(#${svgUid}-sip-hatch)`}
                            mask={`url(#${maskId})`}
                            className="wd-sip-hatch-layer"
                          />
                        )}
                      </g>
                    );
                  }
                  const wPx = Math.max(1, (sl.drawX1 - sl.drawX0) * zoom);
                  const hPx = Math.max(1, (sl.drawY1 - sl.drawY0) * zoom);
                  const stripKey =
                    sl.kind === "above_opening"
                      ? `sip-above-${sl.openingId}-${sl.segmentIndex}`
                      : `sip-below-${sl.openingId}-${sl.segmentIndex}`;
                  return (
                    <g key={stripKey} className="wd-sip-panel-layer">
                      <rect
                        x={sx(sl.drawX0)}
                        y={sy(sl.drawY0)}
                        width={wPx}
                        height={hPx}
                        className={`wd-sip ${isSipLikeWall ? "wd-sip--sip" : "wd-sip--sheet"}`}
                      />
                      <rect
                        x={sx(sl.drawX0)}
                        y={sy(sl.drawY0)}
                        width={wPx}
                        height={hPx}
                        fill={`url(#${svgUid}-sip-hatch)`}
                        className="wd-sip-hatch-layer"
                      />
                    </g>
                  );
                })
              : null}

            {calc
              ? lumberPiecesSortedForDisplay(calc.lumberPieces).map((p) => {
                  const rr = lumberPieceWallElevationRectMm(p, wall, project, calc);
                  const rw = Math.max(1, rr.x1 - rr.x0);
                  const rh = Math.max(1, rr.b1 - rr.b0);
                  const rectTop = wallTop + H - rr.b1;
                  const n = lumberPositionByPieceId.get(p.id) ?? 0;
                  const leftPx = sx(rr.x0);
                  const topPx = sy(rectTop);
                  const wPx = rw * zoom;
                  const hPx = rh * zoom;
                  const lay = computeLumberPieceNumberLabelPx({ leftPx, topPx, wPx, hPx, n });
                  return (
                    <g key={`piece-${p.id}`} pointerEvents="none">
                      <rect
                        x={leftPx}
                        y={topPx}
                        width={wPx}
                        height={hPx}
                        className={`wd-piece ${p.materialType === "steel" ? "wd-piece--steel" : "wd-piece--wood"}`}
                      />
                      <rect
                        x={lay.pillX}
                        y={lay.pillY}
                        width={lay.pillW}
                        height={lay.pillH}
                        rx={2}
                        ry={2}
                        className="wd-piece-n-pill"
                      />
                      <text x={lay.cx} y={lay.cy} className="wd-piece-n" style={{ fontSize: lay.fontSizePx }}>
                        {n}
                      </text>
                    </g>
                  );
                })
              : null}

            {openingsOnWall.map((o) => {
              const x = o.offsetFromStartMm ?? 0;
              const y = o.kind === "door" ? wallBottom - o.heightMm : wallBottom - o.heightMm - (o.sillHeightMm ?? 0);
              const sillMm = o.kind === "window" ? o.sillHeightMm ?? o.position?.sillLevelMm ?? 900 : 0;
              const openBottomMm = y + o.heightMm;
              const vPl = openingInsideVerticalDimByOpeningId.get(o.id);
              const vDimX = vPl?.xLineMm ?? x + o.widthMm * 0.82;
              const vLabelSide = vPl?.labelSide ?? "left";
              const mark = o.markLabel?.trim() || (o.kind === "door" ? `Д_${o.doorSequenceNumber ?? "?"}` : `OK_${o.windowSequenceNumber ?? "?"}`);
              /** Ниже верхней кромки проёма — в верхней трети светового проёма, без «прилипания» к перемычке. */
              const labelCenterYMm = y + o.heightMm * 0.28;
              const openingWPx = Math.max(1, o.widthMm * zoom);
              const openingHPx = Math.max(1, o.heightMm * zoom);
              const openLab = computeWallDetailOpeningLabelLayout(mark, o.widthMm, o.heightMm, openingWPx, openingHPx);
              const labelFontPx = openLab.fontSizePx * (reportMode ? 3.4 : 1);
              const lhPx = openingLabelLineHeightPx(labelFontPx);
              const cxPx = sx(x + o.widthMm / 2);
              const cyPx = sy(labelCenterYMm);
              const fsStyle = { fontSize: labelFontPx } as const;
              return (
                <g key={o.id}>
                  <rect x={sx(x)} y={sy(y)} width={openingWPx} height={openingHPx} className="wd-opening" />
                  {openLab.mode === "one" ? (
                    <text x={cxPx} y={cyPx} className="wd-open-label" style={fsStyle}>
                      {openLab.text}
                    </text>
                  ) : (
                    <>
                      <text x={cxPx} y={cyPx - lhPx / 2} className="wd-open-label" style={fsStyle}>
                        {openLab.line1}
                      </text>
                      <text x={cxPx} y={cyPx + lhPx / 2} className="wd-open-label" style={fsStyle}>
                        {openLab.line2}
                      </text>
                    </>
                  )}
                  {o.kind === "window" ? (
                    <>
                      <VerticalDimensionMm
                        xLineMm={vDimX}
                        y0Mm={openBottomMm}
                        y1Mm={wallBottom}
                        text={`${Math.round(sillMm)}`}
                        sx={sx}
                        sy={sy}
                        labelSide={vLabelSide}
                        textClassName="wd-dim-text-v--opening"
                        labelGapPx={DIMENSION_V_LABEL_GAP_OPENING_INTERIOR_PX}
                        editKey={wallDetailDimEditHandleKey({ kind: "opening_sill_height", openingId: o.id })}
                        interaction={wallDimInteraction}
                        reportedValueMm={Math.round(sillMm)}
                      />
                      <VerticalDimensionMm
                        xLineMm={vDimX}
                        y0Mm={y}
                        y1Mm={openBottomMm}
                        text={`${Math.round(o.heightMm)}`}
                        sx={sx}
                        sy={sy}
                        labelSide={vLabelSide}
                        textClassName="wd-dim-text-v--opening"
                        labelGapPx={DIMENSION_V_LABEL_GAP_OPENING_INTERIOR_PX}
                        editKey={wallDetailDimEditHandleKey({ kind: "opening_height", openingId: o.id })}
                        interaction={wallDimInteraction}
                        reportedValueMm={Math.round(o.heightMm)}
                      />
                    </>
                  ) : o.kind === "door" ? (
                    <VerticalDimensionMm
                      xLineMm={vDimX}
                      y0Mm={y}
                      y1Mm={openBottomMm}
                      text={`${Math.round(o.heightMm)}`}
                      sx={sx}
                      sy={sy}
                      labelSide={vLabelSide}
                      textClassName="wd-dim-text-v--opening"
                      labelGapPx={DIMENSION_V_LABEL_GAP_OPENING_INTERIOR_PX}
                      editKey={wallDetailDimEditHandleKey({ kind: "opening_height", openingId: o.id })}
                      interaction={wallDimInteraction}
                      reportedValueMm={Math.round(o.heightMm)}
                    />
                  ) : null}
                </g>
              );
            })}

            {/* SIP: пунктир стыков OSB. Каркас/ГКЛ: границы листов (крупный шаг) + отдельно тонкие линии стоек каркаса. */}
            {calc ? (
              <g className="wd-sip-seam-overlay" pointerEvents="none">
                {!roofTrimSeams ? (
                  <line
                    x1={sx(sipAlongSpan.x0)}
                    y1={sy(sipOsbSeamYTop)}
                    x2={sx(sipAlongSpan.x1)}
                    y2={sy(sipOsbSeamYTop)}
                    className="wd-sip-seam"
                  />
                ) : null}
                <line
                  x1={sx(sipAlongSpan.x0)}
                  y1={sy(sipOsbSeamYBottom)}
                  x2={sx(sipAlongSpan.x1)}
                  y2={sy(sipOsbSeamYBottom)}
                  className="wd-sip-seam"
                />
                {verticalSipBoundaryXsMm.map((cx) => {
                  const yTopSeamMm = roofTrimSeams
                    ? wallBottom - wallTopHeightAboveBaseAtAlongMm(wall, cx, L)
                    : sipOsbSeamYTop;
                  return (
                    <line
                      key={`sip-seam-v-${cx.toFixed(2)}`}
                      x1={sx(cx)}
                      y1={sy(yTopSeamMm)}
                      x2={sx(cx)}
                      y2={sy(sipOsbSeamYBottom)}
                      className={isSipLikeWall ? "wd-sip-seam" : "wd-sheet-panel-seam"}
                    />
                  );
                })}
                {isSipLikeWall
                  ? sipOpeningStripVerticalSeamSegments.map((seg, idx) => (
                      <line
                        key={`sip-seam-v-strip-${seg.xMm.toFixed(2)}-${seg.y0Mm.toFixed(0)}-${idx}`}
                        x1={sx(seg.xMm)}
                        y1={sy(seg.y0Mm)}
                        x2={sx(seg.xMm)}
                        y2={sy(seg.y1Mm)}
                        className="wd-sip-seam"
                      />
                    ))
                  : null}
                {!isSipLikeWall
                  ? frameStudCenterXsMm.map((cx) => {
                      const yTopStudMm = roofTrimSeams
                        ? wallBottom - wallTopHeightAboveBaseAtAlongMm(wall, cx, L)
                        : sipOsbSeamYTop;
                      return (
                        <line
                          key={`frame-stud-v-${cx.toFixed(2)}`}
                          x1={sx(cx)}
                          y1={sy(yTopStudMm)}
                          x2={sx(cx)}
                          y2={sy(sipOsbSeamYBottom)}
                          className="wd-frame-stud-line"
                        />
                      );
                    })
                  : null}
              </g>
            ) : null}

            {calc && sipPanelGrouping
              ? sipFacadeSlices.map((sl, i) => {
                  const labelKey =
                    sl.kind === "column"
                      ? `sip-label-${sl.region.id}`
                      : sl.kind === "above_opening"
                        ? `sip-label-above-${sl.openingId}-${sl.segmentIndex}`
                        : `sip-label-below-${sl.openingId}-${sl.segmentIndex}`;
                  const pos = sipPanelGrouping.slicePositionOneBased[i] ?? i + 1;
                  const lab = sipSliceLabelCenterSheetMm(sl);
                  return (
                    <text
                      key={labelKey}
                      x={sx(lab.x)}
                      y={sy(lab.y)}
                      className="wd-panel-mark"
                    >
                      {formatSipPanelDisplayMark(wallLabel, pos - 1)}
                    </text>
                  );
                })
              : null}

            {drawDimensionLevel(
              frontLevel1.map(dimSegView),
              dimRowSipY,
              sx,
              sy,
              DIM_ROW_STACK_STEP_MM,
              {
                singleBaseline: true,
                horizontalLabelBelowLinePx: wallPanelDimLabelOffsetY,
                interaction: wallDimInteraction,
              },
            )}
            {showOverallLengthRow && dimRowOverallY != null
              ? drawDimensionLevel(frontLevel3.map(dimSegView), dimRowOverallY, sx, sy, DIM_ROW_STACK_STEP_MM, {
                  singleBaseline: true,
                  horizontalLabelBelowLinePx: wallOverallDimLabelOffsetY,
                  interaction: wallDimInteraction,
                })
              : null}
            {frontLevel2.length > 0 && dimRowOpeningY != null
              ? drawDimensionLevel(frontLevel2.map(dimSegView), dimRowOpeningY, sx, sy, DIM_ROW_STACK_STEP_MM, {
                  horizontalLabelBelowLinePx: wallPanelDimLabelOffsetY,
                  interaction: wallDimInteraction,
                })
              : null}

            {showTopView ? (
              <>
                <text x={sx(0)} y={sy(topViewSubtitleBaselineY)} className="wd-subtitle">
                  Вид сверху
                </text>
                <WallDetailTopViewPlan
                  wall={wall}
                  lengthMm={L}
                  project={project}
                  wallCalculation={calc}
                  topViewY={topViewY}
                  sx={sx}
                  sy={sy}
                  openings={project.openings}
                />
                <VerticalDimensionMm
                  xLineMm={-44}
                  y0Mm={topViewY}
                  y1Mm={topViewY + topViewH}
                  text={`${Math.round(wall.thicknessMm)} мм`}
                  sx={sx}
                  sy={sy}
                  labelGapPx={WD_DIM_V_LABEL_GAP_PX + WD_DIM_V_LABEL_GAP_EXTRA_PX}
                />
              </>
            ) : null}
            {miniPlanBox ? (
              <WallDetailMiniPlanLocator
                project={project}
                highlightWallId={wall.id}
                box={miniPlanBox}
                sx={sx}
                sy={sy}
              />
            ) : null}
            {/* Заголовок рисуем в самом конце, чтобы ничто не перекрывало текст (особенно в reportMode). */}
            <text x={sx(L / 2)} y={sy(titleBaseline)} className="wd-wall-title">
              {wall.markLabel?.trim() || wall.id.slice(0, 8)}
            </text>
          </svg>
          {!hideScrollHint ? (
            <div className="wd-hint">
              Колесо: масштаб · ЛКМ+drag: панорама · двойной клик по полю — вписать лист · клик по размеру — правка в мм
            </div>
          ) : null}
        </div>
      {!reportMode ? (
        <DimensionMmPopover
          open={wallDimPopover != null}
          leftPx={(wallDimPopover?.clientX ?? 0) + 12}
          topPx={(wallDimPopover?.clientY ?? 0) + 12}
          valueStr={wallDimPopover?.valueStr ?? ""}
          error={wallDimPopover?.error ?? null}
          onChange={(next) => setWallDimPopover((p) => (p ? { ...p, valueStr: next, error: null } : null))}
          onApply={applyWallDimPopover}
          onCancel={cancelWallDimPopover}
        />
      ) : null}
    </>
  );
}

/**
 * Убирает из ряда «пролёты между проёмами» сегмент 0…L, если он дублирует уже показанный общий габарит
 * (строка `frontLevel3`) или одну SIP-цепочку на всю длину (`frontLevel1`).
 */
function filterDuplicateFullWallHorizontalDimSegments(
  segments: readonly WallDetailHorizontalDimSegment[],
  wallLenMm: number,
  showOverallLengthRow: boolean,
  sipRowSegments: readonly WallDetailHorizontalDimSegment[],
): WallDetailHorizontalDimSegment[] {
  const tol = 0.5;
  const overallText = `${Math.round(wallLenMm)}`;
  const isFullWallSpan = (s: WallDetailHorizontalDimSegment) =>
    Math.abs(s.a) < tol && Math.abs(s.b - wallLenMm) < tol && s.text === overallText;
  const sipIsSingleFullWallSpan = sipRowSegments.length === 1 && isFullWallSpan(sipRowSegments[0]!);
  return segments.filter((s) => {
    if (!isFullWallSpan(s)) {
      return true;
    }
    if (showOverallLengthRow) {
      return false;
    }
    if (sipIsSingleFullWallSpan) {
      return false;
    }
    return true;
  });
}
