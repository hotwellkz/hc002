import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Opening } from "@/core/domain/opening";

import { useAppStore } from "@/store/useAppStore";

import "./wall-detail-workspace.css";
import {
  internalWallJointSeamCentersAlongMm,
  lumberPieceWallElevationRectMm,
} from "@/core/domain/wallCalculation3dSpecs";
import {
  buildWallDetailSipFacadeSlices,
  sipPanelHorizontalDimensionSegmentsWallDetailMm,
  wallDetailSipVerticalBoundaryXsMm,
} from "@/core/domain/wallDetailSipElevation";
import {
  formatLumberFullDisplayMark,
  formatSipPanelDisplayMark,
  lumberDisplayIndexByPieceId,
  lumberPiecesSortedForDisplay,
  wallMarkLabelForDisplay,
} from "@/core/domain/pieceDisplayMark";
import {
  drawDimensionLevel,
  VerticalDimensionMm,
  WD_DIM_V_LABEL_GAP_EXTRA_PX,
  WD_DIM_V_LABEL_GAP_PX,
} from "@/features/ui/wallDetailDimensionsSvg";
import { WallDetailTopViewPlan } from "@/features/ui/wallDetailTopView2d";

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

export function WallDetailWorkspace() {
  const project = useAppStore((s) => s.currentProject);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  const wallDetailWallId = useAppStore((s) => s.wallDetailWallId);
  const closeWallDetail = useAppStore((s) => s.closeWallDetail);
  const openCalc = useAppStore((s) => s.openWallCalculationModal);
  const setSelected = useAppStore((s) => s.setSelectedEntityIds);
  const wall =
    project.walls.find((w) => w.id === wallDetailWallId) ??
    project.walls.find((w) => selectedIds.includes(w.id)) ??
    project.walls[0] ??
    null;
  const calc = wall ? project.wallCalculations.find((c) => c.wallId === wall.id) ?? null : null;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(0.12);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const fitGenerationRef = useRef(0);
  const svgUid = useId().replace(/:/g, "");

  const openingsOnWall = useMemo(() => {
    if (!wall) return [];
    return project.openings
      .filter((o) => o.wallId === wall.id && o.offsetFromStartMm != null)
      .sort((a, b) => (a.offsetFromStartMm ?? 0) - (b.offsetFromStartMm ?? 0));
  }, [project.openings, wall]);

  const wallLabel = wall ? wallMarkLabelForDisplay(wall.markLabel, wall.id.slice(0, 8)) : "";

  const lumberRows = useMemo(() => {
    if (!calc || !wall) return [];
    const idxById = lumberDisplayIndexByPieceId(calc.lumberPieces);
    return lumberPiecesSortedForDisplay(calc.lumberPieces).map((p) => {
      const n = idxById.get(p.id) ?? 0;
      return {
        n,
        id: p.id,
        mark: formatLumberFullDisplayMark(p.wallMark, n),
        section: `${Math.round(p.sectionThicknessMm)}x${Math.round(p.sectionDepthMm)}`,
        length: Math.round(p.lengthMm),
        qty: 1,
        piece: p,
      };
    });
  }, [calc, wall]);

  const wallDetailSipFrameMm = useMemo(() => {
    if (!wall || !calc) return null;
    const wallTop = SHEET_WALL_TOP_MM;
    const wallBottom = wallTop + wall.heightMm;
    return {
      wallTopMm: wallTop,
      wallBottomMm: wallBottom,
      wallHeightMm: wall.heightMm,
    };
  }, [wall, calc]);

  const sipFacadeSlices = useMemo(() => {
    if (!wall || !calc || !wallDetailSipFrameMm || calc.sipRegions.length === 0) {
      return [];
    }
    return buildWallDetailSipFacadeSlices(calc.sipRegions, openingsOnWall, wall, wallDetailSipFrameMm);
  }, [wall, calc, openingsOnWall, wallDetailSipFrameMm]);

  const sipRows = useMemo(() => {
    if (!calc || !wall || sipFacadeSlices.length === 0) return [];
    const wallThicknessMm = wall.thicknessMm;
    return sipFacadeSlices.map((sl, i) => {
      if (sl.kind === "column") {
        return {
          mark: formatSipPanelDisplayMark(wallLabel, i),
          size: `${Math.round(sl.specWidthMm)}x${Math.round(sl.specHeightMm)}x${Math.round(wallThicknessMm)}`,
          qty: 1,
          rowKey: sl.region.id,
        };
      }
      return {
        mark: formatSipPanelDisplayMark(wallLabel, i),
        size: `${Math.round(sl.specWidthMm)}x${Math.round(sl.specHeightMm)}x${Math.round(wallThicknessMm)}`,
        qty: 1,
        rowKey: `above-${sl.openingId}`,
      };
    });
  }, [calc, wall, wallLabel, sipFacadeSlices]);

  const L = wall ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : 0;
  const H = wall?.heightMm ?? 0;

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
    const seamCenters = calc ? internalWallJointSeamCentersAlongMm(calc) : [];
    const frontLevel1 =
      calc && calc.sipRegions.length > 0
        ? sipPanelHorizontalDimensionSegmentsWallDetailMm(sipShell.x0, sipShell.x1, seamCenters, openingsOnWall)
        : [];
    const frontLevel2Raw = buildOpeningGapSegments(L, openingsOnWall);
    const frontLevel3 = [{ a: 0, b: L, text: `${Math.round(L)}` }];

    /** Одна SIP-панель на всю длину — общий габарит уже в первой цепочке; третья строка дублировала бы число (напр. 5937). */
    const showOverallLengthRow = !(
      calc &&
      calc.sipRegions.length === 1 &&
      Math.abs(calc.sipRegions[0]!.startOffsetMm) < 0.5 &&
      Math.abs(calc.sipRegions[0]!.endOffsetMm - L) < 0.5
    );

    /** Без проёмов `buildOpeningGapSegments` даёт один сегмент 0…L — тот же общий габарит, что и в `frontLevel3`. */
    const frontLevel2 = filterDuplicateFullWallHorizontalDim(
      frontLevel2Raw,
      L,
      showOverallLengthRow,
      frontLevel1,
    );

    /** Сверху вниз: SIP по ширине → общий габарит → пролёты у проёмов (если есть) → большой отступ → «Вид сверху» → план → поле под размер толщины. */
    let y = wallBottom + gapWallToPanelDimsMm;
    const dimRowSipY = y;
    y = bottomOfDimLevel(dimRowSipY, frontLevel1);

    let dimRowOverallY: number | null = null;
    if (showOverallLengthRow) {
      y += gapPanelDimsToOverallDimsMm;
      dimRowOverallY = y;
      y = bottomOfDimLevel(dimRowOverallY, frontLevel3);
    }

    let dimRowOpeningY: number | null = null;
    if (frontLevel2.length > 0) {
      y += gapOpeningDimRowAfterPreviousMm;
      dimRowOpeningY = y;
      y = bottomOfDimLevel(dimRowOpeningY, frontLevel2);
    }

    const dimsEndAfterHorizontal = y;
    const topViewSubtitleBaselineY = dimsEndAfterHorizontal + gapOverallDimsToTopViewTitleMm;
    const topViewY = topViewSubtitleBaselineY + gapTopViewTitleToTopViewMm;
    const topViewBottom = topViewY + topViewH;
    const sheetBottom = topViewBottom + gapTopViewToTopViewDimsMm + SHEET_PAD_BOTTOM_MM;

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
      frontLevel1,
      frontLevel2,
      frontLevel3,
      showOverallLengthRow,
    };
  }, [wall, H, L, calc, openingsOnWall]);

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
      frontLevel1,
      frontLevel2,
      frontLevel3,
      showOverallLengthRow,
    } = layout;

    let minX = LEFT_DIM_X0_MM;
    let maxX = L + 48;
    let minY = Math.min(titleBaseline - 36, wallTop - 8);
    let maxY = sheetBottom;

    for (const o of openingsOnWall) {
      const x = o.offsetFromStartMm ?? 0;
      const openTopY = o.kind === "door" ? wallBottom - o.heightMm : wallBottom - o.heightMm - (o.sillHeightMm ?? 0);
      const labelY = openTopY - 14;
      minY = Math.min(minY, labelY - 8);
      maxX = Math.max(maxX, x + o.widthMm + 8);
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
    maxY = Math.max(maxY, topViewY + topViewH + 8);
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
  }, [wall, layout, L, H, calc, project, openingsOnWall]);

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
      applyFit();
    });
    return () => cancelAnimationFrame(id);
  }, [wall?.id, L, H, layout, applyFit, viewport.w, viewport.h]);

  const sx = useCallback((x: number) => panX + x * zoom, [panX, zoom]);
  const sy = useCallback((y: number) => panY + y * zoom, [panY, zoom]);

  if (!wall || !layout) {
    return <div className="wd-empty">Нет стен для отображения.</div>;
  }

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

  const internalSeamCentersAlong = useMemo(
    () => (calc ? internalWallJointSeamCentersAlongMm(calc) : []),
    [calc],
  );

  const verticalSipBoundaryXsMm = useMemo(
    () =>
      sipFacadeSlices.length > 0
        ? wallDetailSipVerticalBoundaryXsMm(sipFacadeSlices, internalSeamCentersAlong)
        : [],
    [sipFacadeSlices, internalSeamCentersAlong],
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sheetX = (mx - panX) / zoom;
    const sheetY = (my - panY) / zoom;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
    setPanX(mx - sheetX * next);
    setPanY(my - sheetY * next);
    setZoom(next);
  };

  return (
    <div className="wd-root">
      <div className="wd-head">
        <button
          type="button"
          className="btn"
          onClick={() => {
            closeWallDetail();
          }}
        >
          Назад к плану
        </button>
        <div className="wd-title">{wall.markLabel?.trim() || wall.id.slice(0, 8)}</div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSelected([wall.id]);
            openCalc();
          }}
        >
          Пересчитать стену
        </button>
      </div>
      <div className="wd-body">
        <div
          ref={wrapRef}
          className="wd-canvas-wrap"
          onWheel={onWheel}
          onPointerDown={(e) => {
            setDrag({ x: e.clientX, y: e.clientY, panX, panY });
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            setPanX(drag.panX + (e.clientX - drag.x));
            setPanY(drag.panY + (e.clientY - drag.y));
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            applyFit();
          }}
        >
          <svg
            ref={svgRef}
            className="wd-canvas"
            viewBox={`0 0 ${Math.max(1, viewport.w)} ${Math.max(1, viewport.h)}`}
            preserveAspectRatio="none"
          >
            <text x={sx(L / 2)} y={sy(titleBaseline)} className="wd-wall-title">
              {wall.markLabel?.trim() || wall.id.slice(0, 8)}
            </text>
            <rect x={sx(0)} y={sy(wallTop)} width={Math.max(1, L * zoom)} height={Math.max(1, H * zoom)} className="wd-wall" />
            <rect x={sx(0)} y={sy(panelTop)} width={Math.max(1, L * zoom)} height={Math.max(1, panelHeightMm * zoom)} className="wd-panel-outline" />
            <VerticalDimensionMm
              xLineMm={-40}
              y0Mm={wallTop}
              y1Mm={wallBottom}
              text={`${Math.round(H)} мм`}
              sx={sx}
              sy={sy}
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
                    return (
                      <g key={r.id} className="wd-sip-panel-layer">
                        <rect x={sx(sl.drawX0)} y={sy(sl.drawY0)} width={wPx} height={hPx} className="wd-sip" />
                        <mask id={maskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
                          <rect x={sx(sl.drawX0)} y={sy(sl.drawY0)} width={wPx} height={hPx} fill="white" />
                          {holes.map((h, hi) => {
                            const hw = Math.max(1, (h.x1 - h.x0) * zoom);
                            const hh = Math.max(1, (h.y1 - h.y0) * zoom);
                            return <rect key={hi} x={sx(h.x0)} y={sy(h.y0)} width={hw} height={hh} fill="black" />;
                          })}
                        </mask>
                        <rect
                          x={sx(sl.drawX0)}
                          y={sy(sl.drawY0)}
                          width={wPx}
                          height={hPx}
                          fill={`url(#${svgUid}-sip-hatch)`}
                          mask={`url(#${maskId})`}
                          className="wd-sip-hatch-layer"
                        />
                      </g>
                    );
                  }
                  const wPx = Math.max(1, (sl.drawX1 - sl.drawX0) * zoom);
                  const hPx = Math.max(1, (sl.drawY1 - sl.drawY0) * zoom);
                  return (
                    <g key={`sip-above-${sl.openingId}`} className="wd-sip-panel-layer">
                      <rect x={sx(sl.drawX0)} y={sy(sl.drawY0)} width={wPx} height={hPx} className="wd-sip" />
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
              ? lumberRows.map((r) => {
                  const rr = lumberPieceWallElevationRectMm(r.piece, wall, project, calc);
                  const rw = Math.max(1, rr.x1 - rr.x0);
                  const rh = Math.max(1, rr.b1 - rr.b0);
                  const rectTop = wallTop + H - rr.b1;
                  return (
                    <g key={`piece-${r.id}`}>
                      <rect x={sx(rr.x0)} y={sy(rectTop)} width={rw * zoom} height={rh * zoom} className="wd-piece" />
                      <text x={sx(rr.x0 + rw / 2)} y={sy(rectTop + rh / 2)} className="wd-piece-n">
                        {r.n}
                      </text>
                    </g>
                  );
                })
              : null}

            {openingsOnWall.map((o) => {
              const x = o.offsetFromStartMm ?? 0;
              const y = o.kind === "door" ? wallBottom - o.heightMm : wallBottom - o.heightMm - (o.sillHeightMm ?? 0);
              const mark = o.markLabel?.trim() || (o.kind === "door" ? `Д_${o.doorSequenceNumber ?? "?"}` : `OK_${o.windowSequenceNumber ?? "?"}`);
              /** Ниже верхней кромки проёма — в верхней трети светового проёма, без «прилипания» к перемычке. */
              const labelCenterYMm = y + o.heightMm * 0.28;
              return (
                <g key={o.id}>
                  <rect x={sx(x)} y={sy(y)} width={Math.max(1, o.widthMm * zoom)} height={Math.max(1, o.heightMm * zoom)} className="wd-opening" />
                  <text x={sx(x + o.widthMm / 2)} y={sy(labelCenterYMm)} className="wd-open-label">{`${mark} ${Math.round(o.widthMm)}/${Math.round(o.heightMm)}`}</text>
                </g>
              );
            })}

            {/* Пунктир стыков OSB: Y = полная высота стены (wallTop…wallBottom), X = internalWallJointSeamCentersAlongMm. */}
            {calc ? (
              <g className="wd-sip-seam-overlay" pointerEvents="none">
                <line
                  x1={sx(sipAlongSpan.x0)}
                  y1={sy(sipOsbSeamYTop)}
                  x2={sx(sipAlongSpan.x1)}
                  y2={sy(sipOsbSeamYTop)}
                  className="wd-sip-seam"
                />
                <line
                  x1={sx(sipAlongSpan.x0)}
                  y1={sy(sipOsbSeamYBottom)}
                  x2={sx(sipAlongSpan.x1)}
                  y2={sy(sipOsbSeamYBottom)}
                  className="wd-sip-seam"
                />
                {verticalSipBoundaryXsMm.map((cx) => (
                  <line
                    key={`sip-seam-v-${cx.toFixed(2)}`}
                    x1={sx(cx)}
                    y1={sy(sipOsbSeamYTop)}
                    x2={sx(cx)}
                    y2={sy(sipOsbSeamYBottom)}
                    className="wd-sip-seam"
                  />
                ))}
              </g>
            ) : null}

            {calc
              ? sipFacadeSlices.map((sl, i) => (
                  <text
                    key={sl.kind === "column" ? `sip-label-${sl.region.id}` : `sip-label-above-${sl.openingId}`}
                    x={sx((sl.drawX0 + sl.drawX1) / 2)}
                    y={sy((sl.drawY0 + sl.drawY1) / 2)}
                    className="wd-panel-mark"
                  >
                    {formatSipPanelDisplayMark(wallLabel, i)}
                  </text>
                ))
              : null}

            {drawDimensionLevel(frontLevel1, dimRowSipY, sx, sy, DIM_ROW_STACK_STEP_MM, {
              singleBaseline: true,
              horizontalLabelBelowLinePx: wallPanelDimLabelOffsetY,
            })}
            {showOverallLengthRow && dimRowOverallY != null
              ? drawDimensionLevel(frontLevel3, dimRowOverallY, sx, sy, DIM_ROW_STACK_STEP_MM, {
                  singleBaseline: true,
                  horizontalLabelBelowLinePx: wallOverallDimLabelOffsetY,
                })
              : null}
            {frontLevel2.length > 0 && dimRowOpeningY != null
              ? drawDimensionLevel(frontLevel2, dimRowOpeningY, sx, sy, DIM_ROW_STACK_STEP_MM, {
                  horizontalLabelBelowLinePx: wallPanelDimLabelOffsetY,
                })
              : null}

            <text x={sx(0)} y={sy(topViewSubtitleBaselineY)} className="wd-subtitle">
              Вид сверху
            </text>
            <WallDetailTopViewPlan
              wall={wall}
              lengthMm={L}
              project={project}
              wallCalculation={calc}
              topViewY={topViewY}
              zoom={zoom}
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
          </svg>
          <div className="wd-hint">Колесо: масштаб · ЛКМ+drag: панорама · двойной клик по полю — вписать лист</div>
        </div>
        <aside className="wd-side">
          <section className="wd-card">
            <h3>Доски по стене</h3>
            {!calc ? (
              <div className="wd-empty-note">Стена ещё не рассчитана. Нажмите «Пересчитать стену».</div>
            ) : (
              <table className="wd-table">
                <thead>
                  <tr><th>N</th><th>Марк</th><th>Сечение</th><th>Длина</th><th>Кол</th></tr>
                </thead>
                <tbody>
                  {lumberRows.map((r) => (
                    <tr key={`${r.mark}-${r.id}`}>
                      <td>{r.n}</td><td>{r.mark}</td><td>{r.section}</td><td>{r.length}</td><td>{r.qty}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Итого</td>
                    <td>{Math.round(lumberRows.reduce((s, r) => s + r.length, 0))}</td>
                    <td>{lumberRows.length}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
          <section className="wd-card">
            <h3>SIP-панели по стене</h3>
            {!calc ? (
              <div className="wd-empty-note">Нет данных SIP до расчёта.</div>
            ) : (
              <table className="wd-table">
                <thead>
                  <tr><th>Марк</th><th>Размер</th><th>Кол</th></tr>
                </thead>
                <tbody>
                  {sipRows.map((r) => (
                    <tr key={r.rowKey}>
                      <td>{r.mark}</td>
                      <td>{r.size}</td>
                      <td>{r.qty}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Итого</td>
                    <td>{sipRows.length}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * Убирает из ряда «пролёты между проёмами» сегмент 0…L, если он дублирует уже показанный общий габарит
 * (строка `frontLevel3`) или одну SIP-цепочку на всю длину (`frontLevel1`).
 */
function filterDuplicateFullWallHorizontalDim(
  segments: readonly { a: number; b: number; text: string }[],
  wallLenMm: number,
  showOverallLengthRow: boolean,
  sipRowSegments: readonly { a: number; b: number; text: string }[],
): { a: number; b: number; text: string }[] {
  const tol = 0.5;
  const overallText = `${Math.round(wallLenMm)}`;
  const isFullWallSpan = (s: { a: number; b: number; text: string }) =>
    Math.abs(s.a) < tol && Math.abs(s.b - wallLenMm) < tol && s.text === overallText;
  const sipIsSingleFullWallSpan =
    sipRowSegments.length === 1 && isFullWallSpan(sipRowSegments[0]!);
  return segments.filter((s) => {
    if (!isFullWallSpan(s)) return true;
    if (showOverallLengthRow) return false;
    if (sipIsSingleFullWallSpan) return false;
    return true;
  });
}

function buildOpeningGapSegments(
  wallLenMm: number,
  openings: readonly { offsetFromStartMm: number | null; widthMm: number }[],
): { a: number; b: number; text: string }[] {
  const points = [0, wallLenMm];
  for (const o of openings) {
    if (o.offsetFromStartMm == null) continue;
    points.push(o.offsetFromStartMm, o.offsetFromStartMm + o.widthMm);
  }
  points.sort((a, b) => a - b);
  const out: { a: number; b: number; text: string }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (b - a < 2) continue;
    out.push({ a, b, text: `${Math.round(b - a)}` });
  }
  return out;
}
