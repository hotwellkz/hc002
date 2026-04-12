import { Application, Container, FederatedPointerEvent, Graphics, Text } from "pixi.js";
import { useEffect, useRef, useState } from "react";

import { linearPlacementModeLabelRu } from "@/core/geometry/linearPlacementGeometry";
import { wallPlacementHintMessage } from "@/core/domain/wallPlacement";
import { floorBeamPlacementHintMessage } from "@/core/domain/floorBeamPlacement";
import {
  narrowProjectToActiveLayer,
  narrowProjectToLayerSet,
  sortedVisibleContextLayerIds,
} from "@/core/domain/projectLayerSlice";
import { wallJointHintRu } from "@/core/domain/wallJointSession";
import { pickNearestLinearProfileLengthEnd } from "@/core/domain/linearLengthChangePick";
import { pickNearestWallEnd, pickWallSegmentInterior } from "@/core/domain/wallJointPick";
import { getProfileById } from "@/core/domain/profileOps";
import { cssColorToPixiNumber } from "@/shared/cssColor";
import {
  DIMENSION_FONT_SIZE_PX,
  DIMENSION_TEXT_FONT_STACK,
  DIMENSION_TICK_HALF_PX,
  dimensionLabelOffsetFromDimAxisPx,
  readDimensionStyleColors,
} from "@/shared/dimensionStyle";
import { isEditableKeyboardTarget } from "@/shared/editableKeyboardTarget";
import { useAppStore } from "@/store/useAppStore";
import { cloneProjectSnapshot } from "@/store/projectHistory";
import { useUiThemeStore } from "@/store/useUiThemeStore";

import { computeAnchorRelativeHud } from "@/core/geometry/anchorPlacementHud";
import { normalizeAngleDeg360 } from "@/core/geometry/wallDirectionAngleSnap";
import { resolveSnap2d } from "@/core/geometry/snap2d";
import { resolveWallPlacementToolSnap } from "@/core/geometry/wallPlacementSnap2d";
import { getResolvedShortcutCodes } from "@/shared/editorToolShortcuts/resolveEditorShortcutCodes";
import {
  shouldIgnoreEditorToolHotkeys,
  shouldIgnoreWorkspaceEscape,
} from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { isSceneCoordinateModalBlocking } from "@/shared/sceneCoordinateModalLock";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";
import { computeEditorOverlayLayout } from "./placementHudPosition";
import type { EditorInstructionLine } from "./overlays/instructionHintModel";
import { hintLines } from "./overlays/instructionHintModel";
import { InstructionOverlay } from "./overlays/InstructionOverlay";
import { LiveHudBadge } from "./overlays/LiveHudBadge";
import type { LiveHudInlineEdit } from "./overlays/LiveHudBadge";
import { computeMarqueeSelection } from "./computeMarqueeSelection";
import {
  liveHudAxisFieldFromKeyEvent,
  liveHudIsDKeyEvent,
  parseSignedHudDraftMm,
} from "./liveHudNumericDraft";
import { entityIdsForSelectAll2d } from "./editor2dSelectAll";

type CoordHudInlineKind = "floorBeamPlacement" | "wallMoveCopy" | "floorBeamMoveCopy" | "entityCopy";

type CoordHudInlineState = {
  readonly kind: CoordHudInlineKind;
  readonly field: "x" | "y" | "d";
  readonly draft: string;
};

function readCoordHudLinearMetricsForInline(
  kind: CoordHudInlineKind,
): { readonly dx: number; readonly dy: number; readonly d: number } | null {
  const st = useAppStore.getState();
  switch (kind) {
    case "floorBeamPlacement": {
      const s = st.floorBeamPlacementSession;
      if (!s?.firstPointMm || !s.previewEndMm) {
        return null;
      }
      const dx = Math.round(s.previewEndMm.x - s.firstPointMm.x);
      const dy = Math.round(s.previewEndMm.y - s.firstPointMm.y);
      return { dx, dy, d: Math.round(Math.hypot(dx, dy)) };
    }
    case "wallMoveCopy": {
      const s = st.wallMoveCopySession;
      if (!s?.anchorWorldMm || !s.previewTargetMm) {
        return null;
      }
      const dx = Math.round(s.previewTargetMm.x - s.anchorWorldMm.x);
      const dy = Math.round(s.previewTargetMm.y - s.anchorWorldMm.y);
      return { dx, dy, d: Math.round(Math.hypot(dx, dy)) };
    }
    case "floorBeamMoveCopy": {
      const s = st.floorBeamMoveCopySession;
      if (!s?.baseAnchorWorldMm || !s.previewTargetMm) {
        return null;
      }
      const dx = Math.round(s.previewTargetMm.x - s.baseAnchorWorldMm.x);
      const dy = Math.round(s.previewTargetMm.y - s.baseAnchorWorldMm.y);
      return { dx, dy, d: Math.round(Math.hypot(dx, dy)) };
    }
    case "entityCopy": {
      const s = st.entityCopySession;
      if (!s?.worldAnchorStart || !s.previewTargetWorldMm) {
        return null;
      }
      const dx = Math.round(s.previewTargetWorldMm.x - s.worldAnchorStart.x);
      const dy = Math.round(s.previewTargetWorldMm.y - s.worldAnchorStart.y);
      return { dx, dy, d: Math.round(Math.hypot(dx, dy)) };
    }
    default:
      return null;
  }
}
import { pickClosestPlanLineAlongPoint } from "./planLinePick2d";
import { drawPlanLines2d } from "./planLines2dPixi";
import { drawRectangleWallPlacementPreview, drawWallPlacementPreview } from "./drawWallPreview2d";
import { drawShiftDirectionLockGuides2d } from "./drawShiftDirectionLockGuides2d";
import { drawProjectOriginMarker2d } from "./drawProjectOrigin2dPixi";
import { buildScreenGridLines } from "./gridGeometry";
import { appendWallMarkLabels2d, clearWallMarkLabelContainer } from "./wallMarks2dPixi";
import { pruneWallLabelStickyState } from "./wallLabelLayout2d";
import { drawWallJointPickOverlay, type JointHoverState } from "./wallJointMarkers2dPixi";
import { drawDimensions2d } from "./dimensions2dPixi";
import { drawOpeningFramingPlan2d } from "./openingFramingPlan2dPixi";
import { drawWallCalculationOverlay2d } from "./wallCalculation2dPixi";
import { appendWallLumberLabels2d } from "./wallLumberLabels2dPixi";
import { drawDoorPlacementPreview2d } from "./drawDoorPlacementPreview2d";
import { drawWindowPlacementPreview2d } from "./drawWindowPlacementPreview2d";
import { drawWallsAndOpenings2d } from "./walls2dPixi";
import type { FoundationPileEntity } from "@/core/domain/foundationPile";
import { drawFoundationPiles2d } from "./foundationPiles2dPixi";
import { drawFoundationStrips2d } from "./foundationStrips2dPixi";
import { pickClosestFoundationPileAtPoint } from "./foundationPilePick2d";
import { pickClosestFoundationStripAlongPoint } from "./foundationStripPick2d";
import { pickOutwardNormalForStripAxisMm } from "./foundationStripNormals2d";
import {
  foundationStripOrthoRingFootprintContoursMm,
  foundationStripSegmentFootprintQuadMm,
} from "@/core/domain/foundationStripGeometry";
import { appendWindowOpeningLabels2d } from "./windowOpeningLabels2dPixi";
import { appendDoorOpeningLabels2d } from "./doorOpeningLabels2dPixi";
import { buildViewportTransform, screenToWorld, worldToScreen } from "./viewportTransforms";
import {
  clampPlacedOpeningLeftEdgeMm,
  offsetFromStartForCursorCentered,
  pickClosestWallAlongPoint,
  pickPlacedOpeningOnLayerSlice,
  projectWorldToAlongMm,
  openingWallEndMarginAlongMm,
  validateWindowPlacementOnWall,
} from "@/core/domain/openingWindowGeometry";
import {
  resolveOpeningMovePlanAnchorsMm,
  resolveOpeningMovePrimaryNeighborRefsMm,
} from "@/core/domain/openingMovePlanAnchors";
import { wallLengthMm } from "@/core/domain/wallCalculationGeometry";
import { floorBeamWithMovedRefEndAtLength } from "@/core/domain/floorBeamLengthChangeGeometry";
import type { LengthChange2dTarget } from "@/core/domain/lengthChange2dSession";
import { wallWithMovedEndAtLength } from "@/core/domain/wallLengthChangeGeometry";
import type { WallEndSide } from "@/core/domain/wallJoint";
import type { Point2D } from "@/core/geometry/types";
import {
  drawLengthChangeDragOverlay,
  drawLengthChangeDragOverlayForSegment,
  drawLengthChangeEndHoverAtPoint,
} from "./lengthChange2dPixi";

import "./wall-placement-hint.css";
import "./overlays/editor-overlays.css";
import "./wall-context-menu.css";

import type { OpeningKind } from "@/core/domain/opening";
import type { Project } from "@/core/domain/project";
import {
  openPlacedOpeningObjectEditorFromHit,
  openWallObjectEditorFromHit,
} from "@/features/project/objectEditorActions";
import { rectangleCornersFromDiagonalMm } from "@/core/domain/slabPolygon";
import { drawSlabPlacementPreview2d, drawSlabs2d } from "./drawSlabs2d";
import { drawRoofContourJoinOverlay2d } from "./drawRoofContourJoinOverlay2d";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import {
  clampRoofQuadCornerTargetMm,
  clampRoofQuadEdgeDeltaMm,
  isRoofQuadEditorCompatible,
  tryMoveRoofQuadEdgeMm,
  type RoofQuad4,
} from "@/core/domain/roofPlaneQuadEditGeometry";
import { drawRoofBattensPlan2d } from "./drawRoofBattensPlan2d";
import { drawRoofPlanePlacementPreview2d, drawRoofPlanes2d } from "./drawRoofPlanes2d";
import { drawRoofSystemRidges2d } from "./drawRoofSystemRidges2d";
import { appendRoofPlaneLabels2d } from "./roofPlaneLabels2dPixi";
import { computeRoofLabelLayouts2d } from "./roofPlaneLabelLayout2d";
import {
  drawRoofPlaneEditHandles2d,
  type RoofPlaneEditHandleUiState,
} from "./drawRoofPlaneEditHandles2d";
import {
  pickRoofPlaneEditHandleScreen,
  type RoofPlaneEditScreenSticky,
} from "./roofPlaneEditHandlesPick2d";
import { roofPlaneEditModalBridge } from "./roofPlaneEditModalBridge";
import { pickClosestRoofPlaneAtPoint } from "./roofPlanePick2d";
import { pickClosestSlabAtPoint } from "./slabPick2d";
import { readFloorBeamOverStockPaintFromTheme } from "./floorBeamOverStock2dTheme";
import { drawFloorBeams2d } from "./floorBeams2dPixi";
import { pickFloorBeamAtPlanPoint } from "./floorBeamPick2d";
import { drawEntityCopyGhost2d } from "./entityCopyGhost2d";
import { drawEntityCopySnapMarkers2d } from "./entityCopySnapMarkers2d";

function collectVisibleWallIds2d(project: Project): Set<string> {
  const contextIds = sortedVisibleContextLayerIds(project);
  const visibleWallIds = new Set<string>();
  for (const lid of contextIds) {
    const sl = narrowProjectToLayerSet(project, new Set([lid]));
    for (const w of sl.walls) {
      visibleWallIds.add(w.id);
    }
  }
  for (const w of narrowProjectToActiveLayer(project).walls) {
    visibleWallIds.add(w.id);
  }
  return visibleWallIds;
}

function drawFoundationStripPreviewQuads(
  g: Graphics,
  quads: readonly (readonly { readonly x: number; readonly y: number }[])[],
  t: ReturnType<typeof buildViewportTransform>,
): void {
  for (const quad of quads) {
    if (quad.length < 3) {
      continue;
    }
    const p0 = worldToScreen(quad[0]!.x, quad[0]!.y, t);
    g.moveTo(p0.x, p0.y);
    for (let i = 1; i < quad.length; i++) {
      const pi = worldToScreen(quad[i]!.x, quad[i]!.y, t);
      g.lineTo(pi.x, pi.y);
    }
    g.closePath();
    g.fill({ color: 0x9a7b5c, alpha: 0.4 });
    g.stroke({ width: 1.2, color: 0x5c4a38, alpha: 0.72 });
  }
}

function drawFoundationStripPreviewRing(
  g: Graphics,
  outer: readonly { readonly x: number; readonly y: number }[],
  inner: readonly { readonly x: number; readonly y: number }[],
  t: ReturnType<typeof buildViewportTransform>,
): void {
  if (outer.length < 3 || inner.length < 3) {
    return;
  }
  const o = outer.map((p) => worldToScreen(p.x, p.y, t));
  const i = inner.map((p) => worldToScreen(p.x, p.y, t));
  g.beginPath();
  g.poly(o, true);
  g.fill({ color: 0x9a7b5c, alpha: 0.4 });
  g.poly(i, true);
  g.cut();
  g.beginPath();
  g.poly(o, true);
  g.stroke({ width: 1.2, color: 0x5c4a38, alpha: 0.72 });
  g.beginPath();
  g.poly(i, true);
  g.stroke({ width: 1.2, color: 0x5c4a38, alpha: 0.72 });
}

function readCanvasColorsFromTheme(): { readonly bg: number } {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const bg = cs.getPropertyValue("--color-canvas-bg").trim() || "#14171b";
  return { bg: cssColorToPixiNumber(bg) };
}

function readGridPaintFromTheme(): {
  readonly minorColor: number;
  readonly majorColor: number;
  readonly minorAlpha: number;
  readonly majorAlpha: number;
} {
  const cs = getComputedStyle(document.documentElement);
  const parseAlpha = (prop: string, fallback: number): number => {
    const v = parseFloat(cs.getPropertyValue(prop).trim());
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  };
  const minorHex = cs.getPropertyValue("--color-grid-line-pixi-minor").trim() || "#4a5566";
  const majorHex = cs.getPropertyValue("--color-grid-line-pixi-major").trim() || "#5a6578";
  return {
    minorColor: cssColorToPixiNumber(minorHex),
    majorColor: cssColorToPixiNumber(majorHex),
    minorAlpha: parseAlpha("--grid-line-alpha-minor", 0.07),
    majorAlpha: parseAlpha("--grid-line-alpha-major", 0.13),
  };
}

const MARQUEE_MIN_DRAG_PX = 5;
const OPENING_DRAG_THRESHOLD_PX = 5;

function openingPickTolerancesMm(zoomPixelsPerMm: number): { readonly along: number; readonly perp: number } {
  const z = Math.max(0.01, zoomPixelsPerMm);
  return {
    along: Math.max(22, 52 / z),
    perp: Math.max(18, 44 / z),
  };
}

function roofPlaneQuad4OrNull(rp: RoofPlaneEntity): RoofQuad4 | null {
  const poly = roofPlanePolygonMm(rp);
  if (poly.length !== 4 || !isRoofQuadEditorCompatible(poly)) {
    return null;
  }
  return [poly[0]!, poly[1]!, poly[2]!, poly[3]!];
}

interface Editor2DWorkspaceProps {
  readonly onWorldCursorMm: (point: { x: number; y: number } | null) => void;
}

interface MarqueeDrag {
  readonly sx: number;
  readonly sy: number;
  cx: number;
  cy: number;
  readonly shiftKey: boolean;
}

interface OpeningPointerSession {
  readonly openingId: string;
  readonly wallId: string;
  readonly kind: OpeningKind;
  readonly sx: number;
  readonly sy: number;
  readonly pointerId: number;
  dragActive: boolean;
  /** Перетаскивание только в режиме «Переместить» по оси стены. */
  readonly moveToolSession: boolean;
  /** Левый край проёма (мм) в момент активации drag. */
  startLeftEdgeMm: number | null;
  suspendedForModal: boolean;
  pointerReleasedWhileModalOpen: boolean;
}

interface FoundationPilePointerSession {
  readonly pointerId: number;
  readonly sx: number;
  readonly sy: number;
  lastWorldMm: { x: number; y: number };
  dragActive: boolean;
  readonly pileIds: readonly string[];
}

interface SlabPointerSession {
  readonly pointerId: number;
  readonly sx: number;
  readonly sy: number;
  lastWorldMm: { x: number; y: number };
  dragActive: boolean;
  readonly slabIds: readonly string[];
}

interface RoofPlaneEditPointerSession {
  readonly pointerId: number;
  readonly sx: number;
  readonly sy: number;
  readonly planeId: string;
  readonly kind: "edge" | "corner";
  readonly edgeIndex?: number;
  readonly cornerIndex?: number;
  readonly baseQuad: RoofQuad4;
  readonly anchorSnapMm: Point2D;
  /** Сырой мир в момент ЛКМ — для смещения ребра только вдоль нормали, без привязки snap. */
  readonly anchorWorldMm: Point2D;
  readonly nOut?: Point2D;
  lastWorldMm: Point2D;
  dragActive: boolean;
  suspendedForModal: boolean;
  pointerReleasedWhileModalOpen: boolean;
}

type MoveDimSide = "left" | "right";

interface MoveDimHitArea {
  readonly anchor: MoveDimSide;
  readonly face: "inner" | "outer";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly valueMm: number;
}

interface OpeningMoveMetrics {
  readonly openingId: string;
  readonly wallId: string;
  readonly leftEdgeMm: number;
  readonly widthMm: number;
  readonly wallStartMm: number;
  readonly wallEndMm: number;
  readonly allowedStartMm: number;
  readonly allowedEndMm: number;
  /** Вдоль оси стены (как модель). */
  readonly innerLeftGapMm: number;
  readonly innerRightGapMm: number;
  /** До/от наружного угла: + толщина примыкающей стены в углу. */
  readonly outerLeftGapMm: number;
  readonly outerRightGapMm: number;
  readonly thicknessBonusStartMm: number;
  readonly thicknessBonusEndMm: number;
  /** Опорные точки вдоль оси (мм от start) для цепочек размеров на грани стены. */
  readonly innerLeftRefAlongMm: number;
  readonly outerLeftRefAlongMm: number;
  readonly innerRightRefAlongMm: number;
  readonly outerRightRefAlongMm: number;
  /** Локальные опоры: соседний проём или внутренний угол стены (основные размеры «Переместить»). */
  readonly primaryLeftRefAlongMm: number;
  readonly primaryRightRefAlongMm: number;
}

function openingMoveMetrics(project: Project, openingId: string): OpeningMoveMetrics | null {
  const o = project.openings.find((x) => x.id === openingId);
  if (!o || (o.kind !== "window" && o.kind !== "door") || o.wallId == null || o.offsetFromStartMm == null) {
    return null;
  }
  const wall = project.walls.find((w) => w.id === o.wallId);
  if (!wall) {
    return null;
  }
  const L = wallLengthMm(wall);
  const mEdge = openingWallEndMarginAlongMm(wall, project);
  const allowedStartMm = mEdge;
  const allowedEndMm = Math.max(allowedStartMm, L - mEdge);
  const left = o.offsetFromStartMm;
  const layerSlice = narrowProjectToActiveLayer(project);
  const layerWalls = layerSlice.walls;
  const wallIds = new Set(layerWalls.map((w0) => w0.id));
  const layerJoints = project.wallJoints.filter((j) => wallIds.has(j.wallAId) && wallIds.has(j.wallBId));
  const a = resolveOpeningMovePlanAnchorsMm(wall, left, o.widthMm, layerWalls, layerJoints);
  const pr = resolveOpeningMovePrimaryNeighborRefsMm(
    wall.id,
    o.id,
    a.innerLeftRefAlongMm,
    a.innerRightRefAlongMm,
    layerSlice.openings,
  );
  return {
    openingId: o.id,
    wallId: wall.id,
    leftEdgeMm: left,
    widthMm: o.widthMm,
    wallStartMm: 0,
    wallEndMm: L,
    allowedStartMm,
    allowedEndMm,
    innerLeftGapMm: a.innerLeftGapMm,
    innerRightGapMm: a.innerRightGapMm,
    outerLeftGapMm: a.outerLeftGapMm,
    outerRightGapMm: a.outerRightGapMm,
    thicknessBonusStartMm: a.thicknessBonusStartMm,
    thicknessBonusEndMm: a.thicknessBonusEndMm,
    innerLeftRefAlongMm: a.innerLeftRefAlongMm,
    outerLeftRefAlongMm: a.outerLeftRefAlongMm,
    innerRightRefAlongMm: a.innerRightRefAlongMm,
    outerRightRefAlongMm: a.outerRightRefAlongMm,
    primaryLeftRefAlongMm: pr.primaryLeftRefAlongMm,
    primaryRightRefAlongMm: pr.primaryRightRefAlongMm,
  };
}

function wallInnerNormalSign(project: Project, wallId: string): 1 | -1 {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) {
    return 1;
  }
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const w of project.walls) {
    sx += w.start.x + w.end.x;
    sy += w.start.y + w.end.y;
    n += 2;
  }
  if (n < 1) return 1;
  const cx = sx / n;
  const cy = sy / n;
  const wx = (wall.start.x + wall.end.x) / 2;
  const wy = (wall.start.y + wall.end.y) / 2;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return 1;
  const nx = -dy / L;
  const ny = dx / L;
  const toC = (cx - wx) * nx + (cy - wy) * ny;
  return toC >= 0 ? 1 : -1;
}

export function Editor2DWorkspace({ onWorldCursorMm }: Editor2DWorkspaceProps) {
  const wallPlacementSession = useAppStore((s) => s.wallPlacementSession);
  const floorBeamPlacementSession = useAppStore((s) => s.floorBeamPlacementSession);
  const floorBeamSplitSession = useAppStore((s) => s.floorBeamSplitSession);
  const wallMoveCopySession = useAppStore((s) => s.wallMoveCopySession);
  const wallContextMenu = useAppStore((s) => s.wallContextMenu);
  const foundationPileContextMenu = useAppStore((s) => s.foundationPileContextMenu);
  const foundationPileMoveCopySession = useAppStore((s) => s.foundationPileMoveCopySession);
  const floorBeamContextMenu = useAppStore((s) => s.floorBeamContextMenu);
  const floorBeamMoveCopySession = useAppStore((s) => s.floorBeamMoveCopySession);
  const entityCopySession = useAppStore((s) => s.entityCopySession);
  const editor2dSecondaryContextMenu = useAppStore((s) => s.editor2dSecondaryContextMenu);
  const jointHoverRef = useRef<JointHoverState>(null);
  const lengthChangeHoverRef = useRef<{
    readonly target: LengthChange2dTarget;
    readonly end: WallEndSide;
    readonly hoverPointMm: Point2D;
  } | null>(null);
  /** Превью установки окна: стена + левый край проёма (мм от start), валидность. */
  const windowPlacementHoverRef = useRef<{
    readonly wallId: string;
    readonly leftAlongMm: number;
    readonly openingWidthMm: number;
    readonly valid: boolean;
  } | null>(null);
  /** Клик/перетаскивание размещённого окна по стене (инструмент «Выделение»). */
  const openingPointerRef = useRef<OpeningPointerSession | null>(null);
  /** Снимок до начала drag проёма — одна запись undo на перетаскивание. */
  const openingDragHistoryBaselineRef = useRef<ReturnType<typeof cloneProjectSnapshot> | null>(null);
  const foundationPilePointerRef = useRef<FoundationPilePointerSession | null>(null);
  const foundationPileDragHistoryBaselineRef = useRef<ReturnType<typeof cloneProjectSnapshot> | null>(null);
  const slabPointerRef = useRef<SlabPointerSession | null>(null);
  const slabDragHistoryBaselineRef = useRef<ReturnType<typeof cloneProjectSnapshot> | null>(null);
  const roofPlaneEditPointerRef = useRef<RoofPlaneEditPointerSession | null>(null);
  const roofPlaneEditDragHistoryBaselineRef = useRef<ReturnType<typeof cloneProjectSnapshot> | null>(null);
  const roofPlaneEditHoverRef = useRef<{
    readonly planeId: string;
    readonly kind: "edge" | "corner";
    readonly edgeIndex?: number;
    readonly cornerIndex?: number;
    readonly nOut?: Point2D;
  } | null>(null);
  /** Явный выбор ребра/угла для смещения (клик); Space и drag опираются на это для рёбер. */
  const roofPlaneEditSelectedRef = useRef<RoofPlaneEditHandleUiState>(null);
  const lastOpeningClickRef = useRef<{ readonly id: string; readonly t: number } | null>(null);
  const lastWallClickRef = useRef<{ readonly id: string; readonly t: number } | null>(null);
  const lastFoundationStripClickRef = useRef<{ readonly id: string; readonly t: number } | null>(null);
  const lastSlabClickRef = useRef<{ readonly id: string; readonly t: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  /** Координаты курсора в CSS px относительно контейнера 2D (совпадают с областью canvas). */
  const lastPointerAnchorCrosshairRef = useRef({ inside: false, cssX: 0, cssY: 0, worldX: 0, worldY: 0 });
  const anchorCrosshairInnerRef = useRef<HTMLDivElement>(null);
  const cursorCbRef = useRef(onWorldCursorMm);
  cursorCbRef.current = onWorldCursorMm;

  const [wallHint, setWallHint] = useState<{
    readonly left: number;
    readonly top: number;
    readonly lines: readonly EditorInstructionLine[];
    readonly snapLabel?: string | null;
  } | null>(null);
  const setWallHintRef = useRef(setWallHint);
  setWallHintRef.current = setWallHint;

  const toolInstructionCardVisible = wallHint != null;
  useEffect(() => {
    useAppStore.getState().setEditor2dSuppressActiveLayerBadge(toolInstructionCardVisible);
    return () => {
      useAppStore.getState().setEditor2dSuppressActiveLayerBadge(false);
    };
  }, [toolInstructionCardVisible]);

  const [coordHud, setCoordHud] = useState<{
    readonly left: number;
    readonly top: number;
    readonly dx: number;
    readonly dy: number;
    readonly d: number;
    readonly angleDeg?: number;
    /** Защёлкнутый угол шага 45° — показываем как точное ∠ без дробной части. */
    readonly angleSnapLockedDeg?: number | null;
    /** Вторая строка HUD: ось / Δ и длина / прочее. */
    readonly secondLine?: string | null;
  } | null>(null);
  const setCoordHudRef = useRef(setCoordHud);
  setCoordHudRef.current = setCoordHud;

  const [coordHudInline, setCoordHudInline] = useState<CoordHudInlineState | null>(null);
  const coordHudInlineActiveRef = useRef(false);
  coordHudInlineActiveRef.current = coordHudInline != null;
  const coordHudInlineInputRef = useRef<HTMLInputElement | null>(null);
  const setCoordHudInlineRef = useRef(setCoordHudInline);
  setCoordHudInlineRef.current = setCoordHudInline;
  const moveDimHitsRef = useRef<readonly MoveDimHitArea[]>([]);
  const [moveEdit, setMoveEdit] = useState<{
    readonly side: MoveDimSide;
    readonly face: "inner" | "outer";
    readonly openingId: string;
    readonly valueStr: string;
    readonly initialValueStr: string;
    readonly left: number;
    readonly top: number;
    readonly error: string | null;
  } | null>(null);
  const moveEditInputRef = useRef<HTMLInputElement | null>(null);
  const [openingMoveDragHud, setOpeningMoveDragHud] = useState<{
    readonly left: number;
    readonly top: number;
    readonly deltaMm: number;
  } | null>(null);
  const [openingAlongMoveModal, setOpeningAlongMoveModal] = useState<{
    readonly valueStr: string;
    readonly error: string | null;
  } | null>(null);
  const openingAlongMoveInputRef = useRef<HTMLInputElement | null>(null);
  const canvasForOpeningDragRef = useRef<HTMLCanvasElement | null>(null);
  const paintWorkspaceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    roofPlaneEditModalBridge.onEdgeOffsetApplied = () => {
      roofPlaneEditDragHistoryBaselineRef.current = null;
      roofPlaneEditPointerRef.current = null;
      roofPlaneEditHoverRef.current = null;
      roofPlaneEditSelectedRef.current = null;
      paintWorkspaceRef.current?.();
    };
    roofPlaneEditModalBridge.onEdgeOffsetCancelled = () => {
      const s = roofPlaneEditPointerRef.current;
      if (!s) {
        return;
      }
      s.suspendedForModal = false;
      if (s.pointerReleasedWhileModalOpen) {
        roofPlaneEditPointerRef.current = null;
        const b = roofPlaneEditDragHistoryBaselineRef.current;
        roofPlaneEditDragHistoryBaselineRef.current = null;
        if (b) {
          useAppStore.getState().recordUndoIfModelChangedSince(b);
        }
      }
    };
    return () => {
      roofPlaneEditModalBridge.onEdgeOffsetApplied = null;
      roofPlaneEditModalBridge.onEdgeOffsetCancelled = null;
    };
  }, []);

  useEffect(() => {
    if (!wallPlacementSession) {
      setCoordHud(null);
    }
  }, [wallPlacementSession]);

  useEffect(() => {
    if (!floorBeamPlacementSession) {
      setCoordHud(null);
    }
  }, [floorBeamPlacementSession]);

  useEffect(() => {
    if (!floorBeamPlacementSession || floorBeamPlacementSession.phase !== "waitingSecondPoint") {
      setCoordHudInline((prev) => (prev?.kind === "floorBeamPlacement" ? null : prev));
    }
  }, [floorBeamPlacementSession]);

  useEffect(() => {
    const s = wallMoveCopySession;
    if (!s || s.phase !== "pickTarget") {
      setCoordHudInline((prev) => (prev?.kind === "wallMoveCopy" ? null : prev));
    }
  }, [wallMoveCopySession]);

  useEffect(() => {
    const s = floorBeamMoveCopySession;
    if (!s || s.phase !== "pickTarget") {
      setCoordHudInline((prev) => (prev?.kind === "floorBeamMoveCopy" ? null : prev));
    }
  }, [floorBeamMoveCopySession]);

  useEffect(() => {
    const s = entityCopySession;
    if (!s || s.phase !== "pickTarget") {
      setCoordHudInline((prev) => (prev?.kind === "entityCopy" ? null : prev));
    }
  }, [entityCopySession]);

  const coordHudInlineFocusKey = coordHudInline ? `${coordHudInline.kind}:${coordHudInline.field}` : "";
  useEffect(() => {
    if (!coordHudInlineFocusKey) {
      return;
    }
    const id = requestAnimationFrame(() => {
      coordHudInlineInputRef.current?.focus();
      coordHudInlineInputRef.current?.select?.();
    });
    return () => cancelAnimationFrame(id);
  }, [coordHudInlineFocusKey]);

  useEffect(() => {
    if (!coordHudInline) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".ed2d-live-hud-badge")) {
        return;
      }
      setCoordHudInline(null);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [coordHudInline]);

  useEffect(() => {
    if (!wallMoveCopySession) {
      setCoordHud(null);
    }
  }, [wallMoveCopySession]);

  useEffect(() => {
    if (!foundationPileMoveCopySession) {
      setCoordHud(null);
    }
  }, [foundationPileMoveCopySession]);

  useEffect(() => {
    if (!floorBeamMoveCopySession) {
      setCoordHud(null);
    }
  }, [floorBeamMoveCopySession]);

  useEffect(() => {
    if (!entityCopySession) {
      setCoordHud(null);
    }
  }, [entityCopySession]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest?.(".ed2d-wall-ctx") ||
        t?.closest?.(".ed2d-fpile-ctx") ||
        t?.closest?.(".ed2d-fbeam-ctx") ||
        t?.closest?.(".ed2d-secondary-ctx")
      ) {
        return;
      }
      useAppStore.getState().closeWallContextMenu();
      useAppStore.getState().closeFoundationPileContextMenu();
      useAppStore.getState().closeFloorBeamContextMenu();
      useAppStore.getState().closeEditor2dSecondaryContextMenu();
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const resetCodesRaw = getResolvedShortcutCodes("editorReset", useEditorShortcutsStore.getState().customCodes);
      const resetCodes = resetCodesRaw.length > 0 ? resetCodesRaw : (["Escape"] as const);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyA" && !e.altKey) {
        const stA = useAppStore.getState();
        const uiA = useEditorShortcutsStore.getState();
        if (
          shouldIgnoreEditorToolHotkeys(
            e.target,
            {
              activeTab: stA.activeTab,
              layerManagerOpen: stA.layerManagerOpen,
              layerParamsModalOpen: stA.layerParamsModalOpen,
              profilesModalOpen: stA.profilesModalOpen,
              addWallModalOpen: stA.addWallModalOpen,
              addFloorBeamModalOpen: stA.addFloorBeamModalOpen,
              floorBeamSplitModalOpen: stA.floorBeamSplitModalOpen,
              addFoundationStripModalOpen: stA.addFoundationStripModalOpen,
              addFoundationPileModalOpen: stA.addFoundationPileModalOpen,
              addSlabModalOpen: stA.addSlabModalOpen,
              addRoofPlaneModalOpen: stA.addRoofPlaneModalOpen,
              addWindowModalOpen: stA.addWindowModalOpen,
              addDoorModalOpen: stA.addDoorModalOpen,
              windowEditModal: stA.windowEditModal,
              doorEditModal: stA.doorEditModal,
              slabEditModal: stA.slabEditModal,
              wallJointParamsModalOpen: stA.wallJointParamsModalOpen,
              wallCalculationModalOpen: stA.wallCalculationModalOpen,
              roofCalculationModalOpen: stA.roofCalculationModalOpen,
              wallCoordinateModalOpen: stA.wallCoordinateModalOpen,
              floorBeamPlacementCoordinateModalOpen: stA.floorBeamPlacementCoordinateModalOpen,
              slabCoordinateModalOpen: stA.slabCoordinateModalOpen,
              wallAnchorCoordinateModalOpen: stA.wallAnchorCoordinateModalOpen,
              wallMoveCopyCoordinateModalOpen: stA.wallMoveCopyCoordinateModalOpen,
              floorBeamMoveCopyCoordinateModalOpen: stA.floorBeamMoveCopyCoordinateModalOpen,
              lengthChangeCoordinateModalOpen: stA.lengthChangeCoordinateModalOpen,
              projectOriginCoordinateModalOpen: stA.projectOriginCoordinateModalOpen,
              openingAlongMoveNumericModalOpen: stA.openingAlongMoveNumericModalOpen,
              roofPlaneEdgeOffsetModal: stA.roofPlaneEdgeOffsetModal,
              foundationStripAutoPilesModal: stA.foundationStripAutoPilesModal,
              entityCopyCoordinateModalOpen: stA.entityCopyCoordinateModalOpen,
              entityCopyParamsModal: stA.entityCopyParamsModal,
              textureApply3dParamsModal: stA.textureApply3dParamsModal,
              editor3dContextMenu: stA.editor3dContextMenu,
            },
            {
              shortcutsSettingsModalOpen: uiA.shortcutsSettingsModalOpen,
              shortcutRebindCaptureActive: uiA.shortcutRebindCaptureActive,
            },
          )
        ) {
          return;
        }
        e.preventDefault();
        const ids = entityIdsForSelectAll2d(stA.currentProject, {
          activeTool: stA.activeTool,
          activeTab: stA.activeTab,
          wallPlacementSession: stA.wallPlacementSession,
          floorBeamPlacementSession: stA.floorBeamPlacementSession,
          floorBeamSplitSession: stA.floorBeamSplitSession,
          slabPlacementSession: stA.slabPlacementSession,
          roofSystemPlacementSession: stA.roofSystemPlacementSession,
          roofPlanePlacementSession: stA.roofPlanePlacementSession,
          roofContourJoinSession: stA.roofContourJoinSession,
          foundationStripPlacementSession: stA.foundationStripPlacementSession,
          foundationPilePlacementSession: stA.foundationPilePlacementSession,
          pendingWindowPlacement: stA.pendingWindowPlacement,
          pendingDoorPlacement: stA.pendingDoorPlacement,
          addWindowModalOpen: stA.addWindowModalOpen,
          addDoorModalOpen: stA.addDoorModalOpen,
        });
        if (ids.length === 0) {
          return;
        }
        useAppStore.getState().setSelectedEntityIds([...ids]);
        return;
      }
      if (resetCodes.includes(e.code)) {
        const st0 = useAppStore.getState();
        if (
          shouldIgnoreWorkspaceEscape(e.target, {
            activeTab: st0.activeTab,
            layerManagerOpen: st0.layerManagerOpen,
            layerParamsModalOpen: st0.layerParamsModalOpen,
            profilesModalOpen: st0.profilesModalOpen,
            addWallModalOpen: st0.addWallModalOpen,
            addFloorBeamModalOpen: st0.addFloorBeamModalOpen,
            floorBeamSplitModalOpen: st0.floorBeamSplitModalOpen,
            addFoundationStripModalOpen: st0.addFoundationStripModalOpen,
            addFoundationPileModalOpen: st0.addFoundationPileModalOpen,
            addSlabModalOpen: st0.addSlabModalOpen,
            addRoofPlaneModalOpen: st0.addRoofPlaneModalOpen,
            addWindowModalOpen: st0.addWindowModalOpen,
            addDoorModalOpen: st0.addDoorModalOpen,
            windowEditModal: st0.windowEditModal,
            doorEditModal: st0.doorEditModal,
            slabEditModal: st0.slabEditModal,
            wallJointParamsModalOpen: st0.wallJointParamsModalOpen,
            wallCalculationModalOpen: st0.wallCalculationModalOpen,
            roofCalculationModalOpen: st0.roofCalculationModalOpen,
            wallCoordinateModalOpen: st0.wallCoordinateModalOpen,
            floorBeamPlacementCoordinateModalOpen: st0.floorBeamPlacementCoordinateModalOpen,
            slabCoordinateModalOpen: st0.slabCoordinateModalOpen,
            wallAnchorCoordinateModalOpen: st0.wallAnchorCoordinateModalOpen,
            wallMoveCopyCoordinateModalOpen: st0.wallMoveCopyCoordinateModalOpen,
            floorBeamMoveCopyCoordinateModalOpen: st0.floorBeamMoveCopyCoordinateModalOpen,
            lengthChangeCoordinateModalOpen: st0.lengthChangeCoordinateModalOpen,
            projectOriginCoordinateModalOpen: st0.projectOriginCoordinateModalOpen,
            openingAlongMoveNumericModalOpen: st0.openingAlongMoveNumericModalOpen,
            roofPlaneEdgeOffsetModal: st0.roofPlaneEdgeOffsetModal,
            foundationStripAutoPilesModal: st0.foundationStripAutoPilesModal,
            entityCopyCoordinateModalOpen: st0.entityCopyCoordinateModalOpen,
            entityCopyParamsModal: st0.entityCopyParamsModal,
            textureApply3dParamsModal: st0.textureApply3dParamsModal,
            editor3dContextMenu: st0.editor3dContextMenu,
          })
        ) {
          return;
        }
        if (useAppStore.getState().floorBeamMoveCopyCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeFloorBeamMoveCopyCoordinateModal();
          return;
        }
        if (useAppStore.getState().wallMoveCopyCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeWallMoveCopyCoordinateModal();
          return;
        }
        if (useAppStore.getState().lengthChangeCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeLengthChangeCoordinateModal();
          return;
        }
        if (useAppStore.getState().activeTool === "ruler") {
          e.preventDefault();
          useAppStore.getState().ruler2dCancel();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (useAppStore.getState().activeTool === "line") {
          e.preventDefault();
          useAppStore.getState().line2dCancel();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (useAppStore.getState().activeTool === "changeLength") {
          e.preventDefault();
          useAppStore.getState().lengthChange2dEsc();
          lengthChangeHoverRef.current = null;
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (useAppStore.getState().foundationPileMoveCopySession) {
          e.preventDefault();
          useAppStore.getState().cancelFoundationPileMoveCopy();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (useAppStore.getState().floorBeamMoveCopySession) {
          e.preventDefault();
          useAppStore.getState().cancelFloorBeamMoveCopy();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (useAppStore.getState().entityCopyParamsModal) {
          e.preventDefault();
          useAppStore.getState().cancelEntityCopyFlow();
          return;
        }
        if (useAppStore.getState().entityCopySession) {
          e.preventDefault();
          useAppStore.getState().cancelEntityCopyFlow();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (useAppStore.getState().wallMoveCopySession) {
          e.preventDefault();
          useAppStore.getState().cancelWallMoveCopy();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (useAppStore.getState().wallCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeWallCoordinateModal();
          return;
        }
        if (useAppStore.getState().roofPlaneEdgeOffsetModal) {
          e.preventDefault();
          roofPlaneEditModalBridge.onEdgeOffsetCancelled?.();
          useAppStore.getState().closeRoofPlaneEdgeOffsetModal();
          paintWorkspaceRef.current?.();
          return;
        }
        if (useAppStore.getState().slabCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeSlabCoordinateModal();
          return;
        }
        if (useAppStore.getState().floorBeamPlacementCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeFloorBeamPlacementCoordinateModal();
          return;
        }
        if (useAppStore.getState().wallAnchorCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeWallAnchorCoordinateModal();
          return;
        }
        if (useAppStore.getState().wallJointSession) {
          e.preventDefault();
          useAppStore.getState().wallJointBackOrExit();
          setWallHintRef.current(null);
          return;
        }
        if (useAppStore.getState().pendingWindowPlacement || useAppStore.getState().pendingDoorPlacement) {
          e.preventDefault();
          if (useAppStore.getState().pendingWindowPlacement) {
            useAppStore.getState().abortPendingWindowPlacement();
          } else {
            useAppStore.getState().abortPendingDoorPlacement();
          }
          windowPlacementHoverRef.current = null;
          setWallHintRef.current(null);
          return;
        }
        const stEsc = useAppStore.getState();
        if (stEsc.foundationStripPlacementSession) {
          e.preventDefault();
          useAppStore.getState().foundationStripPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.slabPlacementSession) {
          e.preventDefault();
          useAppStore.getState().slabPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.roofSystemPlacementSession) {
          e.preventDefault();
          useAppStore.getState().roofSystemPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.roofPlanePlacementSession) {
          e.preventDefault();
          useAppStore.getState().roofPlanePlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.roofContourJoinSession) {
          e.preventDefault();
          useAppStore.getState().roofContourJoinBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.foundationPilePlacementSession) {
          e.preventDefault();
          useAppStore.getState().cancelFoundationPilePlacement();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.wallPlacementSession) {
          const ph = stEsc.wallPlacementSession.phase;
          if (
            stEsc.wallAnchorPlacementModeActive &&
            stEsc.wallPlacementAnchorMm &&
            (ph === "waitingFirstWallPoint" || ph === "waitingOriginAndFirst")
          ) {
            e.preventDefault();
            stEsc.clearWallPlacementAnchor();
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
            return;
          }
          e.preventDefault();
          useAppStore.getState().wallPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.floorBeamPlacementSession) {
          e.preventDefault();
          useAppStore.getState().floorBeamPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.floorBeamSplitSession) {
          e.preventDefault();
          useAppStore.getState().cancelFloorBeamSplitTool();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          return;
        }
        if (stEsc.projectOriginMoveToolActive) {
          e.preventDefault();
          stEsc.toggleProjectOriginMoveTool();
          setWallHintRef.current(null);
          return;
        }
        if (stEsc.openingMoveModeActive) {
          e.preventDefault();
          stEsc.setOpeningMoveModeActive(false);
          return;
        }
        if (
          stEsc.activeTool === "select" &&
          stEsc.currentProject.viewState.editor2dPlanScope === "roof" &&
          !stEsc.roofContourJoinSession &&
          roofPlaneEditSelectedRef.current
        ) {
          e.preventDefault();
          roofPlaneEditSelectedRef.current = null;
          paintWorkspaceRef.current?.();
          return;
        }
        if (stEsc.activeTool === "pan") {
          e.preventDefault();
          stEsc.setActiveTool("select");
          return;
        }
        return;
      }
      if (e.key === " " || e.code === "Space") {
        if (isEditableKeyboardTarget(e.target)) {
          return;
        }
        const st = useAppStore.getState();
        if (isSceneCoordinateModalBlocking(st)) {
          return;
        }
        if (st.wallMoveCopySession?.phase === "pickTarget") {
          e.preventDefault();
          st.openWallMoveCopyCoordinateModal();
          return;
        }
        if (st.floorBeamMoveCopySession?.phase === "pickTarget") {
          e.preventDefault();
          st.openFloorBeamMoveCopyCoordinateModal();
          return;
        }
        if (
          st.entityCopySession?.phase === "pickTarget" &&
          st.entityCopySession.worldAnchorStart &&
          !st.entityCopyCoordinateModalOpen
        ) {
          e.preventDefault();
          st.openEntityCopyCoordinateModal();
          return;
        }
        const opAlong = openingPointerRef.current;
        if (
          st.openingMoveModeActive &&
          opAlong?.moveToolSession &&
          opAlong.dragActive &&
          opAlong.startLeftEdgeMm != null &&
          !st.openingAlongMoveNumericModalOpen
        ) {
          e.preventDefault();
          const cnv = canvasForOpeningDragRef.current;
          if (cnv) {
            try {
              cnv.releasePointerCapture(opAlong.pointerId);
            } catch {
              /* ignore */
            }
          }
          opAlong.suspendedForModal = true;
          const p0 = st.currentProject;
          const o0 = p0.openings.find((x) => x.id === opAlong.openingId);
          const delta0 =
            o0?.offsetFromStartMm != null ? Math.round(o0.offsetFromStartMm - opAlong.startLeftEdgeMm) : 0;
          st.setOpeningAlongMoveNumericModalOpen(true);
          setOpeningAlongMoveModal({ valueStr: String(delta0), error: null });
          return;
        }
        const rpPtrSpace = roofPlaneEditPointerRef.current;
        if (
          st.activeTool === "select" &&
          st.currentProject.viewState.editor2dPlanScope === "roof" &&
          !st.roofContourJoinSession &&
          st.roofPlaneEdgeOffsetModal == null
        ) {
          let edgeIdxSp: number | null = null;
          let baseQuadSp: RoofQuad4 | null = null;
          let initStrSp = "0";
          const selSp = st.selectedEntityIds;
          if (
            rpPtrSpace?.kind === "edge" &&
            rpPtrSpace.edgeIndex != null &&
            !rpPtrSpace.suspendedForModal &&
            rpPtrSpace.nOut
          ) {
            edgeIdxSp = rpPtrSpace.edgeIndex;
            baseQuadSp = rpPtrSpace.baseQuad;
            const lx = rpPtrSpace.lastWorldMm.x - rpPtrSpace.anchorWorldMm.x;
            const ly = rpPtrSpace.lastWorldMm.y - rpPtrSpace.anchorWorldMm.y;
            const n0 = rpPtrSpace.nOut;
            initStrSp = String(Math.round(lx * n0.x + ly * n0.y));
          } else if (selSp.length === 1) {
            const ridSp = selSp[0]!;
            const selEd = roofPlaneEditSelectedRef.current;
            if (selEd?.kind === "edge" && selEd.planeId === ridSp && selEd.edgeIndex != null) {
              const lvSp = narrowProjectToActiveLayer(st.currentProject);
              const rpSp = lvSp.roofPlanes.find((r) => r.id === ridSp);
              const qSp = rpSp ? roofPlaneQuad4OrNull(rpSp) : null;
              if (qSp) {
                edgeIdxSp = selEd.edgeIndex;
                baseQuadSp = qSp;
              }
            }
          }
          if (edgeIdxSp != null && baseQuadSp && selSp.length === 1) {
            e.preventDefault();
            if (rpPtrSpace && !rpPtrSpace.suspendedForModal) {
              const cnvRp = canvasForOpeningDragRef.current;
              if (cnvRp) {
                try {
                  cnvRp.releasePointerCapture(rpPtrSpace.pointerId);
                } catch {
                  /* ignore */
                }
              }
              rpPtrSpace.suspendedForModal = true;
            }
            st.openRoofPlaneEdgeOffsetModal({
              planeId: selSp[0]!,
              edgeIndex: edgeIdxSp,
              baseQuad: baseQuadSp,
              initialValueStr: initStrSp,
            });
            paintWorkspaceRef.current?.();
            return;
          }
        }
        if (st.projectOriginMoveToolActive && !st.projectOriginCoordinateModalOpen) {
          e.preventDefault();
          st.openProjectOriginCoordinateModal();
          return;
        }
        if (st.activeTool === "changeLength" && st.lengthChange2dSession && !st.lengthChangeCoordinateModalOpen) {
          e.preventDefault();
          st.openLengthChangeCoordinateModal();
          return;
        }
        if (
          st.wallPlacementSession &&
          st.wallAnchorPlacementModeActive &&
          st.wallPlacementAnchorMm &&
          (st.wallPlacementSession.phase === "waitingFirstWallPoint" ||
            st.wallPlacementSession.phase === "waitingOriginAndFirst")
        ) {
          e.preventDefault();
          st.openWallAnchorCoordinateModal();
          return;
        }
        const sp0 = st.slabPlacementSession;
        if (sp0 && !st.slabCoordinateModalOpen) {
          const canSlabCoord =
            (sp0.phase === "waitingSecondPoint" && sp0.firstPointMm != null) ||
            (sp0.phase === "polylineDrawing" && sp0.polylineVerticesMm.length >= 1);
          if (canSlabCoord) {
            e.preventDefault();
            st.openSlabCoordinateModal();
            return;
          }
        }
        const fbsSp = st.floorBeamPlacementSession;
        if (
          fbsSp &&
          !st.floorBeamPlacementCoordinateModalOpen &&
          fbsSp.phase === "waitingSecondPoint" &&
          fbsSp.firstPointMm
        ) {
          e.preventDefault();
          st.openFloorBeamPlacementCoordinateModal();
          return;
        }
        if (!st.wallPlacementSession || st.wallPlacementSession.phase !== "waitingSecondPoint") {
          return;
        }
        e.preventDefault();
        st.openWallCoordinateModal();
      }
      const axisField = liveHudAxisFieldFromKeyEvent(e);
      if (axisField && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isEditableKeyboardTarget(e.target)) {
          return;
        }
        const stXY = useAppStore.getState();
        if (isSceneCoordinateModalBlocking(stXY)) {
          return;
        }
        if (
          stXY.entityCopySession?.phase === "pickTarget" &&
          stXY.entityCopySession.worldAnchorStart &&
          stXY.entityCopySession.previewTargetWorldMm &&
          !stXY.entityCopyCoordinateModalOpen
        ) {
          e.preventDefault();
          const mEc = readCoordHudLinearMetricsForInline("entityCopy");
          if (mEc) {
            setCoordHudInlineRef.current({
              kind: "entityCopy",
              field: axisField,
              draft: String(axisField === "x" ? mEc.dx : mEc.dy),
            });
          }
          return;
        }
        if (stXY.floorBeamMoveCopySession?.phase === "pickTarget" && !stXY.floorBeamMoveCopyCoordinateModalOpen) {
          e.preventDefault();
          const mFb = readCoordHudLinearMetricsForInline("floorBeamMoveCopy");
          if (mFb) {
            setCoordHudInlineRef.current({
              kind: "floorBeamMoveCopy",
              field: axisField,
              draft: String(axisField === "x" ? mFb.dx : mFb.dy),
            });
          }
          return;
        }
        if (stXY.wallMoveCopySession?.phase === "pickTarget" && !stXY.wallMoveCopyCoordinateModalOpen) {
          e.preventDefault();
          const mW = readCoordHudLinearMetricsForInline("wallMoveCopy");
          if (mW) {
            setCoordHudInlineRef.current({
              kind: "wallMoveCopy",
              field: axisField,
              draft: String(axisField === "x" ? mW.dx : mW.dy),
            });
          }
          return;
        }
        const spXY = stXY.slabPlacementSession;
        if (spXY && !stXY.slabCoordinateModalOpen) {
          const canSlabCoordXY =
            (spXY.phase === "waitingSecondPoint" && spXY.firstPointMm != null) ||
            (spXY.phase === "polylineDrawing" && spXY.polylineVerticesMm.length >= 1);
          if (canSlabCoordXY) {
            e.preventDefault();
            stXY.openSlabCoordinateModal({ focus: axisField === "y" ? "y" : "x" });
            return;
          }
        }
        const fbsHud = stXY.floorBeamPlacementSession;
        if (
          fbsHud &&
          fbsHud.phase === "waitingSecondPoint" &&
          fbsHud.firstPointMm &&
          fbsHud.previewEndMm &&
          !stXY.floorBeamPlacementCoordinateModalOpen
        ) {
          e.preventDefault();
          const mPl = readCoordHudLinearMetricsForInline("floorBeamPlacement");
          if (mPl) {
            setCoordHudInlineRef.current({
              kind: "floorBeamPlacement",
              field: axisField,
              draft: String(axisField === "x" ? mPl.dx : mPl.dy),
            });
          }
          return;
        }
        if (
          stXY.wallPlacementSession?.phase === "waitingSecondPoint" &&
          stXY.wallPlacementSession.firstPointMm &&
          !stXY.wallCoordinateModalOpen
        ) {
          e.preventDefault();
          stXY.openWallCoordinateModal({ focus: axisField === "y" ? "y" : "x" });
        }
      }
      if (liveHudIsDKeyEvent(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isEditableKeyboardTarget(e.target)) {
          return;
        }
        const stD = useAppStore.getState();
        if (isSceneCoordinateModalBlocking(stD)) {
          return;
        }
        const fbsD = stD.floorBeamPlacementSession;
        if (
          fbsD &&
          fbsD.phase === "waitingSecondPoint" &&
          fbsD.firstPointMm &&
          fbsD.previewEndMm &&
          !stD.floorBeamPlacementCoordinateModalOpen
        ) {
          e.preventDefault();
          const mD0 = readCoordHudLinearMetricsForInline("floorBeamPlacement");
          if (mD0) {
            setCoordHudInlineRef.current({ kind: "floorBeamPlacement", field: "d", draft: String(mD0.d) });
          }
          return;
        }
        if (stD.wallMoveCopySession?.phase === "pickTarget" && !stD.wallMoveCopyCoordinateModalOpen) {
          const mDw = readCoordHudLinearMetricsForInline("wallMoveCopy");
          if (mDw) {
            e.preventDefault();
            setCoordHudInlineRef.current({ kind: "wallMoveCopy", field: "d", draft: String(mDw.d) });
            return;
          }
        }
        if (stD.floorBeamMoveCopySession?.phase === "pickTarget" && !stD.floorBeamMoveCopyCoordinateModalOpen) {
          const mDf = readCoordHudLinearMetricsForInline("floorBeamMoveCopy");
          if (mDf) {
            e.preventDefault();
            setCoordHudInlineRef.current({ kind: "floorBeamMoveCopy", field: "d", draft: String(mDf.d) });
            return;
          }
        }
        if (
          stD.entityCopySession?.phase === "pickTarget" &&
          stD.entityCopySession.worldAnchorStart &&
          stD.entityCopySession.previewTargetWorldMm &&
          !stD.entityCopyCoordinateModalOpen
        ) {
          e.preventDefault();
          const mDe = readCoordHudLinearMetricsForInline("entityCopy");
          if (mDe) {
            setCoordHudInlineRef.current({ kind: "entityCopy", field: "d", draft: String(mDe.d) });
          }
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        if (isEditableKeyboardTarget(e.target)) {
          return;
        }
        const stEnt = useAppStore.getState();
        if (isSceneCoordinateModalBlocking(stEnt)) {
          return;
        }
        const spEnt = stEnt.slabPlacementSession;
        if (
          spEnt &&
          spEnt.buildMode === "polyline" &&
          spEnt.phase === "polylineDrawing" &&
          !stEnt.slabCoordinateModalOpen
        ) {
          e.preventDefault();
          stEnt.slabPlacementTryFinishPolylineByEnter();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onShiftDown = (e: KeyboardEvent) => {
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") {
        return;
      }
      if (e.repeat) {
        return;
      }
      if (e.altKey) {
        return;
      }
      if (isEditableKeyboardTarget(e.target)) {
        return;
      }
      const st = useAppStore.getState();
      if (isSceneCoordinateModalBlocking(st)) {
        return;
      }
      if (st.activeTab !== "2d") {
        return;
      }
      const vp = st.viewportCanvas2dPx;
      if (!vp) {
        return;
      }
      const t = buildViewportTransform(
        vp.width,
        vp.height,
        st.viewport2d.panXMm,
        st.viewport2d.panYMm,
        st.viewport2d.zoomPixelsPerMm,
      );
      const { worldX, worldY } = lastPointerAnchorCrosshairRef.current;
      st.linearPlacementEngageShiftDirectionLock({ x: worldX, y: worldY }, t);
    };
    const onShiftUp = (e: KeyboardEvent) => {
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") {
        return;
      }
      useAppStore.getState().linearPlacementReleaseShiftDirectionLock();
    };
    window.addEventListener("keydown", onShiftDown, true);
    window.addEventListener("keyup", onShiftUp, true);
    return () => {
      window.removeEventListener("keydown", onShiftDown, true);
      window.removeEventListener("keyup", onShiftUp, true);
    };
  }, []);

  const pendingWindowPlacement = useAppStore((s) => s.pendingWindowPlacement);
  const pendingDoorPlacement = useAppStore((s) => s.pendingDoorPlacement);
  const projectOriginMoveToolActive = useAppStore((s) => s.projectOriginMoveToolActive);
  const activeToolCrosshair = useAppStore((s) => s.activeTool);
  const roofContourJoinActive = useAppStore((s) => s.roofContourJoinSession != null);
  const openingMoveModeActive = useAppStore((s) => s.openingMoveModeActive);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) {
      return;
    }
    if (
      pendingWindowPlacement ||
      pendingDoorPlacement ||
      projectOriginMoveToolActive ||
      floorBeamSplitSession ||
      roofContourJoinActive ||
      activeToolCrosshair === "line" ||
      activeToolCrosshair === "ruler"
    ) {
      el.style.cursor = "crosshair";
    } else {
      el.style.cursor = "";
    }
  }, [
    pendingWindowPlacement,
    pendingDoorPlacement,
    projectOriginMoveToolActive,
    floorBeamSplitSession,
    roofContourJoinActive,
    activeToolCrosshair,
  ]);

  useEffect(() => {
    if (!openingMoveModeActive || selectedIds.length !== 1) {
      setMoveEdit(null);
      setOpeningMoveDragHud(null);
      setOpeningAlongMoveModal(null);
      useAppStore.getState().setOpeningAlongMoveNumericModalOpen(false);
    }
  }, [openingMoveModeActive, selectedIds]);

  useEffect(() => {
    if (!openingAlongMoveModal) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const el = openingAlongMoveInputRef.current;
      if (!el) {
        return;
      }
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [openingAlongMoveModal]);

  useEffect(() => {
    if (!projectOriginMoveToolActive) {
      return;
    }
    setWallHint({
      left: 12,
      top: 56,
      lines: hintLines("База плана (0,0)", [
        { text: "Клик — новая точка · Пробел — ввод XY (мир) · Esc — выход", variant: "muted" },
      ]),
    });
    return () => setWallHint(null);
  }, [projectOriginMoveToolActive]);

  useEffect(() => {
    if (!moveEdit) return;
    const raf = requestAnimationFrame(() => {
      const el = moveEditInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [moveEdit?.openingId, moveEdit?.side, moveEdit?.face, moveEdit?.left, moveEdit?.top]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    const appRef: { current: Application | null } = { current: null };
    const gridG = new Graphics();
    const foundationStripsG = new Graphics();
    foundationStripsG.eventMode = "none";
    const foundationPilesG = new Graphics();
    foundationPilesG.eventMode = "none";
    const slabsG = new Graphics();
    slabsG.eventMode = "none";
    const slabPreviewG = new Graphics();
    slabPreviewG.eventMode = "none";
    const roofBattens2dG = new Graphics();
    roofBattens2dG.eventMode = "none";
    const roofPlanesG = new Graphics();
    roofPlanesG.eventMode = "none";
    const roofSystemRidgesG = new Graphics();
    roofSystemRidgesG.eventMode = "none";
    const roofPlanePreviewG = new Graphics();
    roofPlanePreviewG.eventMode = "none";
    const roofPlaneLabelsC = new Container();
    roofPlaneLabelsC.eventMode = "none";
    const wallsG = new Graphics();
    const floorBeamsG = new Graphics();
    floorBeamsG.eventMode = "none";
    const planLinesG = new Graphics();
    planLinesG.eventMode = "none";
    const wallCalcG = new Graphics();
    wallCalcG.eventMode = "none";
    const wallCalcLabelC = new Container();
    wallCalcLabelC.eventMode = "none";
    const openingsG = new Graphics();
    const wallLabelsC = new Container();
    wallLabelsC.eventMode = "none";
    const windowOpeningLabelsC = new Container();
    windowOpeningLabelsC.eventMode = "none";
    const dimensionsG = new Graphics();
    dimensionsG.eventMode = "none";
    const dimensionsLabelC = new Container();
    const openingMoveG = new Graphics();
    openingMoveG.eventMode = "none";
    const openingMoveLabelC = new Container();
    openingMoveLabelC.eventMode = "none";
    dimensionsLabelC.eventMode = "none";
    const jointPickG = new Graphics();
    jointPickG.eventMode = "none";
    const roofContourJoinG = new Graphics();
    roofContourJoinG.eventMode = "none";
    const windowPlacementG = new Graphics();
    windowPlacementG.eventMode = "none";
    const previewG = new Graphics();
    const lengthChangeG = new Graphics();
    lengthChangeG.eventMode = "none";
    const snapMarkerG = new Graphics();
    const entityCopyGhostG = new Graphics();
    entityCopyGhostG.eventMode = "none";
    const entityCopySnapG = new Graphics();
    entityCopySnapG.eventMode = "none";
    const rulerG = new Graphics();
    rulerG.eventMode = "none";
    const lineG = new Graphics();
    lineG.eventMode = "none";
    const marqueeG = new Graphics();
    const roofPlaneEditHandlesG = new Graphics();
    roofPlaneEditHandlesG.eventMode = "none";
    const originMarkerC = new Container();
    originMarkerC.eventMode = "none";
    const worldRoot = new Container();
    worldRoot.eventMode = "static";

    const panning = { active: false, sx: 0, sy: 0, panXMm: 0, panYMm: 0, zoom: 1 };
    let marquee: MarqueeDrag | null = null;

    let anchorCrosshairShown = false;

    const applyAnchorCrosshairCursorTargets = (canvasEl: HTMLCanvasElement, value: string) => {
      canvasEl.style.cursor = value;
      const par = canvasEl.parentElement;
      if (par) {
        par.style.cursor = value;
      }
    };

    const syncAnchorCrosshairOverlay = (canvas: HTMLCanvasElement) => {
      const inner = anchorCrosshairInnerRef.current;
      if (!inner) {
        return;
      }
      const app = appRef.current;
      if (!app) {
        return;
      }
      const st = useAppStore.getState();
      const ws = st.wallPlacementSession;
      const fsSess = st.foundationStripPlacementSession;
      const fpSess = st.foundationPilePlacementSession;
      const slabSessCross = st.slabPlacementSession;
      const ecSessCross = st.entityCopySession;
      const fpMc = st.foundationPileMoveCopySession;
      const fbMc = st.floorBeamMoveCopySession;
      const firstPh =
        ws && (ws.phase === "waitingFirstWallPoint" || ws.phase === "waitingOriginAndFirst");
      const foundationPickCrosshair =
        (fsSess != null || fpSess != null) &&
        fpMc == null &&
        fbMc == null &&
        !st.openingMoveModeActive &&
        !st.projectOriginMoveToolActive;
      const pileMovePickCrosshair =
        (fpMc != null || fbMc != null) && !st.openingMoveModeActive && !st.projectOriginMoveToolActive;
      const wallPickCrosshair =
        ws != null &&
        !st.wallCoordinateModalOpen &&
        !st.wallAnchorCoordinateModalOpen &&
        (ws.phase === "waitingSecondPoint" ||
          ws.phase === "waitingFirstWallPoint" ||
          ws.phase === "waitingOriginAndFirst") &&
        !st.openingMoveModeActive &&
        !st.projectOriginMoveToolActive;
      const rulerShow =
        st.activeTool === "ruler" && st.ruler2dSession != null && !st.openingMoveModeActive && !st.projectOriginMoveToolActive;
      const lineToolShow =
        st.activeTool === "line" && st.line2dSession != null && !st.openingMoveModeActive && !st.projectOriginMoveToolActive;
      const lengthChangeShow =
        st.activeTool === "changeLength" &&
        !st.openingMoveModeActive &&
        !st.lengthChangeCoordinateModalOpen &&
        !st.projectOriginMoveToolActive;
      const slabCrosshairActive =
        slabSessCross != null && !st.openingMoveModeActive && !st.projectOriginMoveToolActive;
      const entityCopyCrosshairActive =
        ecSessCross != null &&
        !st.entityCopyCoordinateModalOpen &&
        !st.openingMoveModeActive &&
        !st.projectOriginMoveToolActive;
      const fbs = st.floorBeamPlacementSession;
      const beamFirstPh = fbs && (fbs.phase === "waitingFirstPoint" || fbs.phase === "waitingOriginAndFirst");
      const beamPickCrosshair =
        fbs != null &&
        (fbs.phase === "waitingSecondPoint" ||
          fbs.phase === "waitingFirstPoint" ||
          fbs.phase === "waitingOriginAndFirst") &&
        !st.floorBeamPlacementCoordinateModalOpen &&
        !st.openingMoveModeActive &&
        !st.projectOriginMoveToolActive;
      const rpsCross = st.roofPlanePlacementSession;
      const roofPickCrosshair =
        rpsCross != null &&
        !st.openingMoveModeActive &&
        !st.projectOriginMoveToolActive;
      const roofContourJoinPickCrosshair =
        st.roofContourJoinSession != null &&
        st.currentProject.viewState.editor2dPlanScope === "roof" &&
        !st.openingMoveModeActive &&
        !st.projectOriginMoveToolActive;
      const roofPlaneEditCrosshair =
        roofPlaneEditPointerRef.current?.dragActive === true &&
        st.activeTool === "select" &&
        !st.openingMoveModeActive &&
        !st.projectOriginMoveToolActive;
      const show =
        (wallPickCrosshair ||
          beamPickCrosshair ||
          roofPickCrosshair ||
          roofContourJoinPickCrosshair ||
          roofPlaneEditCrosshair ||
          foundationPickCrosshair ||
          pileMovePickCrosshair ||
          rulerShow ||
          lineToolShow ||
          lengthChangeShow ||
          slabCrosshairActive ||
          entityCopyCrosshairActive) &&
        !panning.active &&
        !marquee &&
        lastPointerAnchorCrosshairRef.current.inside;

      if (!show) {
        inner.style.visibility = "hidden";
        if (anchorCrosshairShown) {
          anchorCrosshairShown = false;
          if (!panning.active && !st.openingMoveModeActive) {
            applyAnchorCrosshairCursorTargets(canvas, "");
            const pixiViewOff = app.view as HTMLCanvasElement | undefined;
            if (pixiViewOff) {
              pixiViewOff.style.cursor = "";
            }
          }
        }
        return;
      }

      const w = app.renderer.width;
      const h = app.renderer.height;
      const v2 = st.viewport2d;
      const t = buildViewportTransform(w, h, v2.panXMm, v2.panYMm, v2.zoomPixelsPerMm);
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / w;
      const scaleY = rect.height / h;
      const last = lastPointerAnchorCrosshairRef.current;
      const proj = st.currentProject;
      const e2 = proj.settings.editor2d;

      let centerRx: number;
      let centerRy: number;

      if (fbMc) {
        if (fbMc.phase === "pickTarget" && fbMc.baseAnchorWorldMm) {
          const d = fbMc.dragDeltaMm ?? { x: 0, y: 0 };
          const basePt = { x: fbMc.baseAnchorWorldMm.x + d.x, y: fbMc.baseAnchorWorldMm.y + d.y };
          const sc = worldToScreen(basePt.x, basePt.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else if (fbMc.phase === "pickBase" && fbMc.pickBaseHoverWorldMm) {
          const sc = worldToScreen(fbMc.pickBaseHoverWorldMm.x, fbMc.pickBaseHoverWorldMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
            excludeFloorBeamId: fbMc.workingBeamId,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (entityCopyCrosshairActive && ecSessCross) {
        const ptEc =
          ecSessCross.resolvedCursorWorldMm ?? { x: last.worldX, y: last.worldY };
        const scEc = worldToScreen(ptEc.x, ptEc.y, t);
        centerRx = scEc.x;
        centerRy = scEc.y;
      } else if (fpMc) {
        if (fpMc.phase === "pickTarget" && fpMc.baseOffsetFromCenterMm && fpMc.previewCenterMm) {
          const off = fpMc.baseOffsetFromCenterMm;
          const pc = fpMc.previewCenterMm;
          const basePt = { x: pc.x + off.x, y: pc.y + off.y };
          const sc = worldToScreen(basePt.x, basePt.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
            excludeFoundationPileId: fpMc.workingPileId,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (rulerShow) {
        const rs = st.ruler2dSession!;
        if (rs.phase === "stretching" && rs.firstMm && rs.previewEndMm) {
          const sc = worldToScreen(rs.previewEndMm.x, rs.previewEndMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (lineToolShow) {
        const ls = st.line2dSession!;
        if (ls.phase === "stretching" && ls.firstMm && ls.previewEndMm) {
          const sc = worldToScreen(ls.previewEndMm.x, ls.previewEndMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (lengthChangeShow) {
        const lc = st.lengthChange2dSession;
        if (lc) {
          const sc = worldToScreen(lc.previewMovingMm.x, lc.previewMovingMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (fsSess) {
        if (fsSess.phase === "waitingSecondPoint" && fsSess.previewEndMm) {
          const sc = worldToScreen(fsSess.previewEndMm.x, fsSess.previewEndMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (fpSess) {
        if (fpSess.previewWorldMm) {
          const sc = worldToScreen(fpSess.previewWorldMm.x, fpSess.previewWorldMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (slabCrosshairActive && slabSessCross) {
        if (st.slabCoordinateModalOpen && slabSessCross.previewEndMm) {
          const scSl = worldToScreen(slabSessCross.previewEndMm.x, slabSessCross.previewEndMm.y, t);
          centerRx = scSl.x;
          centerRy = scSl.y;
        } else if (
          slabSessCross.previewEndMm &&
          (slabSessCross.phase === "waitingSecondPoint" || slabSessCross.phase === "polylineDrawing")
        ) {
          const scSl2 = worldToScreen(slabSessCross.previewEndMm.x, slabSessCross.previewEndMm.y, t);
          centerRx = scSl2.x;
          centerRy = scSl2.y;
        } else {
          const snapSl = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          const scSl3 = worldToScreen(snapSl.point.x, snapSl.point.y, t);
          centerRx = scSl3.x;
          centerRy = scSl3.y;
        }
      } else if (roofPickCrosshair && rpsCross) {
        const rp = rpsCross;
        if (rp.previewEndMm) {
          const scRp = worldToScreen(rp.previewEndMm.x, rp.previewEndMm.y, t);
          centerRx = scRp.x;
          centerRy = scRp.y;
        } else {
          const snapRp = resolveWallPlacementToolSnap({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
            linearPlacementMode: e2.linearPlacementMode,
          });
          const scRp0 = worldToScreen(snapRp.point.x, snapRp.point.y, t);
          centerRx = scRp0.x;
          centerRy = scRp0.y;
        }
      } else if (roofContourJoinPickCrosshair) {
        const scRj = worldToScreen(last.worldX, last.worldY, t);
        centerRx = scRj.x;
        centerRy = scRj.y;
      } else if (beamPickCrosshair && fbs) {
        if (fbs.phase === "waitingSecondPoint" && fbs.previewEndMm) {
          const sc = worldToScreen(fbs.previewEndMm.x, fbs.previewEndMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else if (beamFirstPh && fbs.previewEndMm) {
          const sc = worldToScreen(fbs.previewEndMm.x, fbs.previewEndMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveWallPlacementToolSnap({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
            linearPlacementMode: e2.linearPlacementMode,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (wallPickCrosshair && ws) {
        const am = st.wallAnchorPlacementModeActive;
        const anchorPt = st.wallPlacementAnchorMm;
        const ap = st.wallPlacementAnchorPreviewEndMm;
        if (ws.phase === "waitingSecondPoint" && ws.previewEndMm) {
          const sc = worldToScreen(ws.previewEndMm.x, ws.previewEndMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else if (firstPh && am && anchorPt && ap) {
          const sc = worldToScreen(ap.x, ap.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else if (firstPh && ws.previewEndMm) {
          const sc = worldToScreen(ws.previewEndMm.x, ws.previewEndMm.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else {
          const snap = resolveWallPlacementToolSnap({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
            linearPlacementMode: e2.linearPlacementMode,
          });
          const sc = worldToScreen(snap.point.x, snap.point.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      } else if (roofPlaneEditCrosshair) {
        const snapRe = resolveSnap2d({
          rawWorldMm: { x: last.worldX, y: last.worldY },
          viewport: t,
          project: proj,
          snapSettings: {
            snapToVertex: e2.snapToVertex,
            snapToEdge: e2.snapToEdge,
            snapToGrid: e2.snapToGrid,
          },
          gridStepMm: proj.settings.gridStepMm,
        });
        const scRe = worldToScreen(snapRe.point.x, snapRe.point.y, t);
        centerRx = scRe.x;
        centerRy = scRe.y;
      } else {
        const sc = worldToScreen(last.worldX, last.worldY, t);
        centerRx = sc.x;
        centerRy = sc.y;
      }

      const cssX = centerRx * scaleX;
      const cssY = centerRy * scaleY;

      let snapActive = false;
      if (fbMc) {
        if (fbMc.phase === "pickTarget") {
          snapActive = Boolean(fbMc.lastSnapKind && fbMc.lastSnapKind !== "none");
        } else {
          snapActive = Boolean(fbMc.pickBaseHoverSnapKind && fbMc.pickBaseHoverSnapKind !== "none");
        }
      } else if (fpMc) {
        if (fpMc.phase === "pickTarget") {
          snapActive = Boolean(fpMc.lastSnapKind && fpMc.lastSnapKind !== "none");
        } else {
          const snP = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
            excludeFoundationPileId: fpMc.workingPileId,
          });
          snapActive = snP.kind !== "none";
        }
      } else if (entityCopyCrosshairActive && ecSessCross) {
        snapActive = Boolean(ecSessCross.lastSnapKind && ecSessCross.lastSnapKind !== "none");
      } else if (fsSess) {
        if (fsSess.phase === "waitingSecondPoint") {
          snapActive = Boolean(fsSess.lastSnapKind && fsSess.lastSnapKind !== "none");
        } else {
          const snFs = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          snapActive = snFs.kind !== "none";
        }
      } else if (fpSess) {
        snapActive = Boolean(fpSess.lastSnapKind && fpSess.lastSnapKind !== "none");
      } else if (beamPickCrosshair && fbs) {
        if (fbs.phase === "waitingSecondPoint") {
          snapActive = Boolean(fbs.lastSnapKind && fbs.lastSnapKind !== "none");
        } else if (beamFirstPh) {
          snapActive = Boolean(fbs.lastSnapKind && fbs.lastSnapKind !== "none");
        }
      } else if (roofPickCrosshair && rpsCross) {
        const rpSn = rpsCross;
        if (rpSn.phase === "waitingSecondPoint") {
          if (rpSn.shiftDirectionLockUnit) {
            snapActive = Boolean(
              rpSn.shiftLockReferenceMm && rpSn.lastSnapKind && rpSn.lastSnapKind !== "none",
            );
          } else {
            snapActive = Boolean(rpSn.lastSnapKind && rpSn.lastSnapKind !== "none");
          }
        } else {
          snapActive = Boolean(rpSn.lastSnapKind && rpSn.lastSnapKind !== "none");
        }
      } else if (roofContourJoinPickCrosshair) {
        snapActive = false;
      } else if (wallPickCrosshair && ws) {
        if (ws.phase === "waitingSecondPoint") {
          snapActive = Boolean(ws.lastSnapKind && ws.lastSnapKind !== "none");
        } else if (firstPh && st.wallAnchorPlacementModeActive && st.wallPlacementAnchorMm && st.wallPlacementAnchorPreviewEndMm) {
          snapActive = Boolean(
            st.wallPlacementAnchorLastSnapKind && st.wallPlacementAnchorLastSnapKind !== "none",
          );
        } else if (firstPh) {
          snapActive = Boolean(ws.lastSnapKind && ws.lastSnapKind !== "none");
        }
      } else if (lineToolShow && st.line2dSession) {
        const lsSn = st.line2dSession;
        if (lsSn.phase === "stretching") {
          snapActive = Boolean(lsSn.lastSnapKind && lsSn.lastSnapKind !== "none");
        } else if (lsSn.phase === "pickFirst") {
          const sn0 = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          snapActive = sn0.kind !== "none";
        }
      } else if (rulerShow && st.ruler2dSession) {
        const rsSn = st.ruler2dSession;
        if (rsSn.phase === "stretching") {
          snapActive = Boolean(rsSn.lastSnapKind && rsSn.lastSnapKind !== "none");
        } else if (rsSn.phase === "pickFirst") {
          const sn1 = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          snapActive = sn1.kind !== "none";
        }
      } else if (slabCrosshairActive && slabSessCross) {
        if (st.slabCoordinateModalOpen) {
          snapActive = Boolean(slabSessCross.lastSnapKind && slabSessCross.lastSnapKind !== "none");
        } else if (slabSessCross.phase === "waitingSecondPoint" || slabSessCross.phase === "polylineDrawing") {
          snapActive = Boolean(slabSessCross.lastSnapKind && slabSessCross.lastSnapKind !== "none");
        } else {
          const snSlab = resolveSnap2d({
            rawWorldMm: { x: last.worldX, y: last.worldY },
            viewport: t,
            project: proj,
            snapSettings: {
              snapToVertex: e2.snapToVertex,
              snapToEdge: e2.snapToEdge,
              snapToGrid: e2.snapToGrid,
            },
            gridStepMm: proj.settings.gridStepMm,
          });
          snapActive = snSlab.kind !== "none";
        }
      } else if (roofPlaneEditCrosshair) {
        const snRe2 = resolveSnap2d({
          rawWorldMm: { x: last.worldX, y: last.worldY },
          viewport: t,
          project: proj,
          snapSettings: {
            snapToVertex: e2.snapToVertex,
            snapToEdge: e2.snapToEdge,
            snapToGrid: e2.snapToGrid,
          },
          gridStepMm: proj.settings.gridStepMm,
        });
        snapActive = snRe2.kind !== "none";
      }
      inner.dataset["snapActive"] = snapActive ? "1" : "0";

      inner.style.visibility = "visible";
      inner.style.transform = `translate3d(${cssX}px, ${cssY}px, 0) translate(-50%, -50%)`;
      applyAnchorCrosshairCursorTargets(canvas, "none");
      const pixiView = app.view as HTMLCanvasElement | undefined;
      if (pixiView) {
        pixiView.style.cursor = "none";
      }
      anchorCrosshairShown = true;
    };

    const paint = () => {
      paintWorkspaceRef.current = paint;
      const app = appRef.current;
      if (!app) {
        return;
      }
      const {
        currentProject,
        viewport2d,
        selectedEntityIds,
        wallPlacementSession,
        floorBeamPlacementSession,
      } = useAppStore.getState();
      const w = app.renderer.width;
      const h = app.renderer.height;
      const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
      const { bg: canvasBg } = readCanvasColorsFromTheme();
      const gridPaint = readGridPaintFromTheme();
      if (app.renderer.background) {
        app.renderer.background.color = canvasBg;
      }
      const selected = new Set(selectedEntityIds);
      const contextIds = sortedVisibleContextLayerIds(currentProject);
      const show2dLayers = currentProject.viewState.show2dProfileLayers !== false;

      gridG.clear();
      if (currentProject.settings.show2dGrid) {
        const lines = buildScreenGridLines(
          w,
          h,
          t,
          currentProject.settings.gridStepMm,
          currentProject.projectOrigin,
        );
        for (const ln of lines) {
          gridG.moveTo(ln.x0, ln.y0);
          gridG.lineTo(ln.x1, ln.y1);
          const major = ln.kind === "major";
          gridG.stroke({
            width: 1,
            color: major ? gridPaint.majorColor : gridPaint.minorColor,
            alpha: major ? gridPaint.majorAlpha : gridPaint.minorAlpha,
          });
        }
      }

      foundationStripsG.clear();
      let firstFs = true;
      for (const lid of contextIds) {
        const ctxFs = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawFoundationStrips2d(foundationStripsG, ctxFs.foundationStrips, t, selected, {
          appearance: "context",
          clear: firstFs,
        });
        firstFs = false;
      }
      const layerView = narrowProjectToActiveLayer(currentProject);
      drawFoundationStrips2d(foundationStripsG, layerView.foundationStrips, t, selected, {
        appearance: "active",
        clear: firstFs,
      });

      foundationPilesG.clear();
      let firstPileDraw = true;
      for (const lid of contextIds) {
        const ctxPiles = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawFoundationPiles2d(foundationPilesG, ctxPiles.foundationPiles, t, selected, {
          appearance: "context",
          clear: firstPileDraw,
          anchorMarkersZoomPxPerMm: viewport2d.zoomPixelsPerMm,
        });
        firstPileDraw = false;
      }
      drawFoundationPiles2d(foundationPilesG, layerView.foundationPiles, t, selected, {
        appearance: "active",
        clear: firstPileDraw,
        anchorMarkersZoomPxPerMm: viewport2d.zoomPixelsPerMm,
      });

      slabsG.clear();
      let firstSlabDraw = true;
      for (const lid of contextIds) {
        const ctxSlabs = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawSlabs2d(slabsG, ctxSlabs.slabs, t, selected, { clear: firstSlabDraw });
        firstSlabDraw = false;
      }
      drawSlabs2d(slabsG, layerView.slabs, t, selected, { clear: firstSlabDraw });

      slabPreviewG.clear();
      const slabSessPaint = useAppStore.getState().slabPlacementSession;
      if (slabSessPaint?.previewEndMm) {
        const zSl = viewport2d.zoomPixelsPerMm;
        const closeTolSl = Math.max(20, 35 / Math.max(zSl, 1e-6));
        if (
          slabSessPaint.buildMode === "rectangle" &&
          slabSessPaint.phase === "waitingSecondPoint" &&
          slabSessPaint.firstPointMm
        ) {
          const corners = rectangleCornersFromDiagonalMm(slabSessPaint.firstPointMm, slabSessPaint.previewEndMm);
          for (let i = 0; i < corners.length; i++) {
            const a = worldToScreen(corners[i]!.x, corners[i]!.y, t);
            const b = worldToScreen(corners[(i + 1) % corners.length]!.x, corners[(i + 1) % corners.length]!.y, t);
            slabPreviewG.moveTo(a.x, a.y);
            slabPreviewG.lineTo(b.x, b.y);
          }
          slabPreviewG.stroke({ width: 1.35, color: 0x0ea5e9, alpha: 0.88, cap: "round", join: "round" });
        } else {
          const hf =
            slabSessPaint.phase === "polylineDrawing" && slabSessPaint.firstPointMm
              ? slabSessPaint.firstPointMm
              : null;
          const nearClose =
            hf &&
            slabSessPaint.polylineVerticesMm.length >= 3 &&
            Math.hypot(slabSessPaint.previewEndMm.x - hf.x, slabSessPaint.previewEndMm.y - hf.y) < closeTolSl;
          drawSlabPlacementPreview2d(
            slabPreviewG,
            slabSessPaint.phase === "polylineDrawing" ? slabSessPaint.polylineVerticesMm : [],
            slabSessPaint.previewEndMm,
            t,
            {
              highlightFirstMm: hf,
              firstHighlightActive: Boolean(nearClose),
            },
          );
        }
      }

      const roofSysSessPaint = useAppStore.getState().roofSystemPlacementSession;
      if (roofSysSessPaint?.previewEndMm && roofSysSessPaint.phase === "waitingSecondCorner" && roofSysSessPaint.firstPointMm) {
        const cornersRs = rectangleCornersFromDiagonalMm(roofSysSessPaint.firstPointMm, roofSysSessPaint.previewEndMm);
        for (let i = 0; i < cornersRs.length; i++) {
          const a = worldToScreen(cornersRs[i]!.x, cornersRs[i]!.y, t);
          const b = worldToScreen(cornersRs[(i + 1) % cornersRs.length]!.x, cornersRs[(i + 1) % cornersRs.length]!.y, t);
          slabPreviewG.moveTo(a.x, a.y);
          slabPreviewG.lineTo(b.x, b.y);
        }
        slabPreviewG.stroke({ width: 1.35, color: 0xf59e0b, alpha: 0.9, cap: "round", join: "round" });
      }

      const roofPlanesForLabelLayout: RoofPlaneEntity[] = [];
      const roofLabelSeenIds = new Set<string>();
      for (const lid of contextIds) {
        const ctxRoofLbl = narrowProjectToLayerSet(currentProject, new Set([lid]));
        for (const rp of ctxRoofLbl.roofPlanes) {
          if (!roofLabelSeenIds.has(rp.id)) {
            roofLabelSeenIds.add(rp.id);
            roofPlanesForLabelLayout.push(rp);
          }
        }
      }
      for (const rp of layerView.roofPlanes) {
        if (!roofLabelSeenIds.has(rp.id)) {
          roofLabelSeenIds.add(rp.id);
          roofPlanesForLabelLayout.push(rp);
        }
      }
      const roofLabelLayouts = computeRoofLabelLayouts2d(roofPlanesForLabelLayout, t, {
        style: { fontSizePx: 11, lineHeightFactor: 1.28 },
      });
      const roofLabelLayoutByPlaneId = new Map(roofLabelLayouts.map((l) => [l.planeId, l]));

      const calculatedRoofPlaneIds = new Set<string>();
      for (const c of currentProject.roofAssemblyCalculations) {
        for (const id of c.roofPlaneIds) {
          calculatedRoofPlaneIds.add(id);
        }
      }

      roofBattens2dG.clear();
      let firstBattenDraw = true;
      for (const lid of contextIds) {
        const ctxRoof = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawRoofBattensPlan2d(roofBattens2dG, currentProject, ctxRoof.roofPlanes, calculatedRoofPlaneIds, t, {
          clear: firstBattenDraw,
        });
        firstBattenDraw = false;
      }
      drawRoofBattensPlan2d(roofBattens2dG, currentProject, layerView.roofPlanes, calculatedRoofPlaneIds, t, {
        clear: firstBattenDraw,
      });

      roofPlanesG.clear();
      let firstRoofDraw = true;
      for (const lid of contextIds) {
        const ctxRoof = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawRoofPlanes2d(roofPlanesG, ctxRoof.roofPlanes, t, selected, {
          clear: firstRoofDraw,
          labelLayoutByPlaneId: roofLabelLayoutByPlaneId,
        });
        firstRoofDraw = false;
      }
      drawRoofPlanes2d(roofPlanesG, layerView.roofPlanes, t, selected, {
        clear: firstRoofDraw,
        labelLayoutByPlaneId: roofLabelLayoutByPlaneId,
      });

      roofSystemRidgesG.clear();
      let firstRidge = true;
      for (const lid of contextIds) {
        const ctxSys = narrowProjectToLayerSet(currentProject, new Set([lid])).roofSystems;
        drawRoofSystemRidges2d(roofSystemRidgesG, ctxSys, t, { clear: firstRidge });
        firstRidge = false;
      }
      drawRoofSystemRidges2d(roofSystemRidgesG, layerView.roofSystems, t, { clear: firstRidge });

      clearWallMarkLabelContainer(roofPlaneLabelsC);
      appendRoofPlaneLabels2d(roofPlaneLabelsC, roofPlanesForLabelLayout, roofLabelLayoutByPlaneId, t, {
        fontSizePx: 11,
        lineHeightFactor: 1.28,
      });

      roofPlanePreviewG.clear();
      const roofSessPaint = useAppStore.getState().roofPlanePlacementSession;
      if (roofSessPaint?.p1 && roofSessPaint.previewEndMm) {
        if (roofSessPaint.phase === "waitingSecondPoint") {
          drawRoofPlanePlacementPreview2d(
            roofPlanePreviewG,
            {
              phase: "waitingSecondPoint",
              p1: roofSessPaint.p1,
              p2OrPreview: roofSessPaint.previewEndMm,
              depthNormal: null,
              depthMm: null,
            },
            t,
          );
        } else if (roofSessPaint.phase === "waitingDepth" && roofSessPaint.p2) {
          drawRoofPlanePlacementPreview2d(
            roofPlanePreviewG,
            {
              phase: "waitingDepth",
              p1: roofSessPaint.p1,
              p2OrPreview: roofSessPaint.p2,
              depthNormal: roofSessPaint.previewSlopeNormal,
              depthMm: roofSessPaint.previewDepthMm,
            },
            t,
          );
        }
      }

      wallsG.clear();
      openingsG.clear();
      clearWallMarkLabelContainer(wallLabelsC);
      clearWallMarkLabelContainer(windowOpeningLabelsC);
      pruneWallLabelStickyState(new Set(currentProject.walls.map((w) => w.id)));
      let firstDraw = true;
      for (const lid of contextIds) {
        const ctxSlice = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawWallsAndOpenings2d(wallsG, openingsG, ctxSlice, t, selected, {
          appearance: "context",
          clear: firstDraw,
          show2dProfileLayers: show2dLayers,
        });
        appendWallMarkLabels2d(wallLabelsC, ctxSlice, t, "context", { dimensionProject: currentProject });
        appendWindowOpeningLabels2d(windowOpeningLabelsC, ctxSlice, t, "context", {
          dimensionProject: currentProject,
        });
        appendDoorOpeningLabels2d(windowOpeningLabelsC, ctxSlice, t, "context", {
          dimensionProject: currentProject,
        });
        firstDraw = false;
      }
      drawWallsAndOpenings2d(wallsG, openingsG, layerView, t, selected, {
        appearance: "active",
        clear: firstDraw,
        show2dProfileLayers: show2dLayers,
      });
      appendWallMarkLabels2d(wallLabelsC, layerView, t, "active", { dimensionProject: currentProject });
      appendWindowOpeningLabels2d(windowOpeningLabelsC, layerView, t, "active", {
        dimensionProject: currentProject,
      });
      appendDoorOpeningLabels2d(windowOpeningLabelsC, layerView, t, "active", {
        dimensionProject: currentProject,
      });

      floorBeamsG.clear();
      const highlightBeamOverStock = currentProject.viewState.editor2dPlanScope === "floorStructure";
      const overStockPaint = highlightBeamOverStock ? readFloorBeamOverStockPaintFromTheme() : null;
      let firstBeamDraw = true;
      for (const lid of contextIds) {
        const ctxBeams = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawFloorBeams2d(floorBeamsG, currentProject, ctxBeams.floorBeams, t, selected, {
          appearance: "context",
          clear: firstBeamDraw,
          highlightOverLinearStock: highlightBeamOverStock,
          overStockPaint,
        });
        firstBeamDraw = false;
      }
      drawFloorBeams2d(floorBeamsG, currentProject, layerView.floorBeams, t, selected, {
        appearance: "active",
        clear: firstBeamDraw,
        highlightOverLinearStock: highlightBeamOverStock,
        overStockPaint,
      });

      planLinesG.clear();
      let firstPlanDraw = true;
      for (const lid of contextIds) {
        const ctxPl = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawPlanLines2d(planLinesG, ctxPl.planLines, t, selected, "context", firstPlanDraw);
        firstPlanDraw = false;
      }
      drawPlanLines2d(planLinesG, layerView.planLines, t, selected, "active", firstPlanDraw);

      const visibleWallIds = collectVisibleWallIds2d(currentProject);
      drawWallCalculationOverlay2d(wallCalcG, currentProject, visibleWallIds, t);
      drawOpeningFramingPlan2d(wallCalcG, currentProject, visibleWallIds, t);
      appendWallLumberLabels2d(wallCalcLabelC, currentProject, visibleWallIds, t);

      drawDimensions2d(dimensionsG, dimensionsLabelC, currentProject, t);
      openingMoveG.clear();
      for (const ch of [...openingMoveLabelC.children]) {
        ch.destroy({ children: true });
      }
      openingMoveLabelC.removeChildren();
      moveDimHitsRef.current = [];
      const moveMode = useAppStore.getState().openingMoveModeActive;
      if (moveMode && selectedEntityIds.length === 1) {
        const m = openingMoveMetrics(currentProject, selectedEntityIds[0]!);
        if (m) {
          const wall = currentProject.walls.find((w0) => w0.id === m.wallId);
          if (wall) {
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const L = Math.hypot(dx, dy);
            if (L > 1e-6) {
              const ux = dx / L;
              const uy = dy / L;
              const nx = -uy;
              const ny = ux;
              const wmx = (wall.start.x + wall.end.x) / 2;
              const wmy = (wall.start.y + wall.end.y) / 2;
              const outRef0 = worldToScreen(wmx, wmy, t);
              const outRef1 = worldToScreen(wmx + nx * 100, wmy + ny * 100, t);
              const nOutSx = outRef1.x - outRef0.x;
              const nOutSy = outRef1.y - outRef0.y;
              const { line: dimLineCol, text: dimTextCol } = readDimensionStyleColors();
              const innerSign = wallInnerNormalSign(currentProject, wall.id);
              const halfT = wall.thicknessMm / 2;
              const faceShiftMm = 12 / t.zoomPixelsPerMm;
              const chainShiftInnerMm = 32 / t.zoomPixelsPerMm;
              const chainShiftOuterMm = 50 / t.zoomPixelsPerMm;
              const primaryLeftMm = m.leftEdgeMm - m.primaryLeftRefAlongMm;
              const primaryRightMm = m.primaryRightRefAlongMm - (m.leftEdgeMm + m.widthMm);
              const outerLeftMm = m.outerLeftGapMm;
              const outerRightMm = m.outerRightGapMm;
              const faceGeom = (wallFace: "inner" | "outer", leftRefAlong: number, rightRefAlong: number) => {
                const faceSign = wallFace === "inner" ? innerSign : -innerSign;
                const baseOff = faceSign * halfT;
                const openStart = m.leftEdgeMm;
                const openEnd = m.leftEdgeMm + m.widthMm;
                const pBase = { x: wall.start.x + nx * baseOff, y: wall.start.y + ny * baseOff };
                const pLeftRef = { x: pBase.x + ux * leftRefAlong, y: pBase.y + uy * leftRefAlong };
                const pRightRef = { x: pBase.x + ux * rightRefAlong, y: pBase.y + uy * rightRefAlong };
                const pOpenStart = { x: pBase.x + ux * openStart, y: pBase.y + uy * openStart };
                const pOpenEnd = { x: pBase.x + ux * openEnd, y: pBase.y + uy * openEnd };
                const chain = wallFace === "inner" ? chainShiftInnerMm : chainShiftOuterMm;
                const nOut = faceSign * (faceShiftMm + chain);
                const shift = (p: { x: number; y: number }) => ({ x: p.x + nx * nOut, y: p.y + ny * nOut });
                return {
                  left0: worldToScreen(shift(pLeftRef).x, shift(pLeftRef).y, t),
                  left1: worldToScreen(shift(pOpenStart).x, shift(pOpenStart).y, t),
                  right0: worldToScreen(shift(pOpenEnd).x, shift(pOpenEnd).y, t),
                  right1: worldToScreen(shift(pRightRef).x, shift(pRightRef).y, t),
                };
              };
              const inner = faceGeom("inner", m.primaryLeftRefAlongMm, m.primaryRightRefAlongMm);
              const outer = faceGeom("outer", m.outerLeftRefAlongMm, m.outerRightRefAlongMm);
              const drawDim = (
                s0: { x: number; y: number },
                s1: { x: number; y: number },
                anchor: MoveDimSide,
                face: "inner" | "outer",
                valueMm: number,
                emphasis: "primary" | "secondary",
              ) => {
                const lineW = emphasis === "primary" ? 2 : 1;
                const lineAlpha = emphasis === "primary" ? 0.98 : 0.52;
                const fontPx = emphasis === "primary" ? DIMENSION_FONT_SIZE_PX + 1 : DIMENSION_FONT_SIZE_PX - 1;
                openingMoveG.moveTo(s0.x, s0.y);
                openingMoveG.lineTo(s1.x, s1.y);
                openingMoveG.stroke({ width: lineW, color: dimLineCol, alpha: lineAlpha, cap: "butt" });
                const vxRaw = s1.x - s0.x;
                const vyRaw = s1.y - s0.y;
                const vLen = Math.hypot(vxRaw, vyRaw);
                let vx = 1;
                let vy = 0;
                let px = 0;
                let py = 1;
                if (vLen > 1e-6) {
                  vx = vxRaw / vLen;
                  vy = vyRaw / vLen;
                  px = -vy;
                  py = vx;
                  const tick = DIMENSION_TICK_HALF_PX;
                  const drawTick = (x: number, y: number) => {
                    openingMoveG.moveTo(x - px * tick, y - py * tick);
                    openingMoveG.lineTo(x + px * tick, y + py * tick);
                    openingMoveG.stroke({ width: lineW, color: dimLineCol, alpha: lineAlpha, cap: "butt" });
                  };
                  drawTick(s0.x, s0.y);
                  drawTick(s1.x, s1.y);
                }
                const mx = (s0.x + s1.x) / 2;
                const my = (s0.y + s1.y) / 2;
                const txt = new Text({
                  text: `${Math.round(valueMm)}`,
                  style: {
                    fontFamily: DIMENSION_TEXT_FONT_STACK,
                    fontSize: fontPx,
                    fontWeight: emphasis === "primary" ? "600" : "400",
                    fill: dimTextCol,
                  },
                });
                txt.anchor.set(0.5);
                const shortDim = vLen < txt.width + 26;
                if (shortDim) {
                  const sideMul = anchor === "left" ? -1 : 1;
                  const lx0 = s1.x + vx * 8 * sideMul;
                  const ly0 = s1.y + vy * 8 * sideMul;
                  const lx1 = lx0 + vx * 10 * sideMul;
                  const ly1 = ly0 + vy * 10 * sideMul;
                  openingMoveG.moveTo(lx0, ly0);
                  openingMoveG.lineTo(lx1, ly1);
                  openingMoveG.stroke({ width: lineW, color: dimLineCol, alpha: lineAlpha, cap: "butt" });
                  txt.x = lx1 + px * 10;
                  txt.y = ly1 + py * 10;
                } else {
                  const offPx = dimensionLabelOffsetFromDimAxisPx();
                  const dot = px * nOutSx + py * nOutSy;
                  const sign = dot >= 0 ? 1 : -1;
                  txt.x = mx + px * sign * offPx;
                  txt.y = my + py * sign * offPx;
                }
                openingMoveLabelC.addChild(txt);
                const wbox = Math.max(34, txt.width + 10);
                const hbox = Math.max(18, txt.height + 8);
                const tx0 = txt.x - wbox / 2;
                const ty0 = txt.y - hbox / 2;
                const tx1 = txt.x + wbox / 2;
                const ty1 = txt.y + hbox / 2;
                const lx0 = Math.min(s0.x, s1.x) - 8;
                const ly0 = Math.min(s0.y, s1.y) - 8;
                const lx1 = Math.max(s0.x, s1.x) + 8;
                const ly1 = Math.max(s0.y, s1.y) + 8;
                const hx0 = Math.min(tx0, lx0);
                const hy0 = Math.min(ty0, ly0);
                const hx1 = Math.max(tx1, lx1);
                const hy1 = Math.max(ty1, ly1);
                moveDimHitsRef.current = [
                  ...moveDimHitsRef.current,
                  { anchor, face, x: hx0, y: hy0, w: hx1 - hx0, h: hy1 - hy0, valueMm },
                ];
              };
              drawDim(inner.left0, inner.left1, "left", "inner", primaryLeftMm, "primary");
              drawDim(outer.left0, outer.left1, "left", "outer", outerLeftMm, "secondary");
              drawDim(inner.right0, inner.right1, "right", "inner", primaryRightMm, "primary");
              drawDim(outer.right0, outer.right1, "right", "outer", outerRightMm, "secondary");
            }
          }
        }
      }

      jointPickG.clear();
      const jSession = useAppStore.getState().wallJointSession;
      if (jSession) {
        drawWallJointPickOverlay(
          jointPickG,
          layerView.walls,
          t,
          jSession.phase === "pickSecond" ? jSession.first : undefined,
          jointHoverRef.current,
        );
      }

      roofContourJoinG.clear();
      const rjSessPaint = useAppStore.getState().roofContourJoinSession;
      if (rjSessPaint && currentProject.viewState.editor2dPlanScope === "roof") {
        drawRoofContourJoinOverlay2d(roofContourJoinG, rjSessPaint, layerView.roofPlanes, t);
      }

      windowPlacementG.clear();
      const pendWinPaint = useAppStore.getState().pendingWindowPlacement;
      const pendDoorPaint = useAppStore.getState().pendingDoorPlacement;
      const hoverWin = windowPlacementHoverRef.current;
      if (pendWinPaint && hoverWin) {
        const wall = currentProject.walls.find((w) => w.id === hoverWin.wallId);
        if (wall) {
          drawWindowPlacementPreview2d(
            windowPlacementG,
            wall,
            hoverWin.leftAlongMm,
            hoverWin.openingWidthMm,
            hoverWin.valid,
            t,
          );
        }
      }
      if (pendDoorPaint?.phase === "pickWall" && hoverWin) {
        const wall = currentProject.walls.find((w) => w.id === hoverWin.wallId);
        if (wall) {
          drawWindowPlacementPreview2d(
            windowPlacementG,
            wall,
            hoverWin.leftAlongMm,
            hoverWin.openingWidthMm,
            hoverWin.valid,
            t,
          );
        }
      }
      if (
        pendDoorPaint?.phase === "chooseSwing" &&
        pendDoorPaint.wallId != null &&
        pendDoorPaint.leftAlongMm != null
      ) {
        const wall = currentProject.walls.find((w) => w.id === pendDoorPaint.wallId);
        const opDoor = currentProject.openings.find((o) => o.id === pendDoorPaint.openingId);
        if (wall && opDoor && opDoor.kind === "door") {
          drawDoorPlacementPreview2d(
            windowPlacementG,
            wall,
            pendDoorPaint.leftAlongMm,
            opDoor.widthMm,
            pendDoorPaint.swingPreview ?? opDoor.doorSwing ?? "in_right",
            true,
            t,
            { drawSwing: opDoor.isEmptyOpening !== true },
          );
        }
      }

      previewG.clear();
      if (
        wallPlacementSession?.phase === "waitingSecondPoint" &&
        wallPlacementSession.firstPointMm &&
        wallPlacementSession.previewEndMm
      ) {
        const placementMode = currentProject.settings.editor2d.linearPlacementMode;
        const shapeMode = currentProject.settings.editor2d.wallShapeMode;
        const thick = wallPlacementSession.draft.thicknessMm;
        const previewProfile = getProfileById(currentProject, wallPlacementSession.draft.profileId);
        const layeredPreviewOpts = {
          profile: previewProfile,
          show2dProfileLayers: show2dLayers,
          thicknessMm: thick,
          zoomPixelsPerMm: viewport2d.zoomPixelsPerMm,
        };
        if (shapeMode === "rectangle") {
          drawRectangleWallPlacementPreview(
            previewG,
            wallPlacementSession.firstPointMm,
            wallPlacementSession.previewEndMm,
            thick,
            placementMode,
            t,
            layeredPreviewOpts,
          );
        } else {
          drawWallPlacementPreview(
            previewG,
            wallPlacementSession.firstPointMm,
            wallPlacementSession.previewEndMm,
            thick,
            placementMode,
            t,
            layeredPreviewOpts,
          );
        }
        if (
          wallPlacementSession.angleSnapLockedDeg != null &&
          wallPlacementSession.shiftDirectionLockUnit == null
        ) {
          const f = wallPlacementSession.firstPointMm;
          const e = wallPlacementSession.previewEndMm;
          const a = worldToScreen(f.x, f.y, t);
          const b = worldToScreen(e.x, e.y, t);
          previewG.moveTo(a.x, a.y);
          previewG.lineTo(b.x, b.y);
          previewG.stroke({ width: 1.75, color: 0x34d399, alpha: 0.55 });
        }
        if (wallPlacementSession.shiftDirectionLockUnit && wallPlacementSession.firstPointMm) {
          drawShiftDirectionLockGuides2d(
            previewG,
            wallPlacementSession.firstPointMm,
            wallPlacementSession.shiftDirectionLockUnit,
            w,
            h,
            t,
            {
              referenceMm: wallPlacementSession.shiftLockReferenceMm,
              previewEndMm: wallPlacementSession.previewEndMm,
            },
          );
        }
      }

      if (
        floorBeamPlacementSession?.phase === "waitingSecondPoint" &&
        floorBeamPlacementSession.firstPointMm &&
        floorBeamPlacementSession.previewEndMm
      ) {
        const placementModeFb = currentProject.settings.editor2d.linearPlacementMode;
        const thickFb = floorBeamPlacementSession.draft.planThicknessMm;
        const previewProfileFb = getProfileById(currentProject, floorBeamPlacementSession.draft.profileId);
        drawWallPlacementPreview(
          previewG,
          floorBeamPlacementSession.firstPointMm,
          floorBeamPlacementSession.previewEndMm,
          thickFb,
          placementModeFb,
          t,
          {
            profile: previewProfileFb,
            show2dProfileLayers: show2dLayers,
            thicknessMm: thickFb,
            zoomPixelsPerMm: viewport2d.zoomPixelsPerMm,
          },
        );
        if (
          floorBeamPlacementSession.angleSnapLockedDeg != null &&
          floorBeamPlacementSession.shiftDirectionLockUnit == null
        ) {
          const f0 = floorBeamPlacementSession.firstPointMm;
          const e0 = floorBeamPlacementSession.previewEndMm;
          const a0 = worldToScreen(f0.x, f0.y, t);
          const b0 = worldToScreen(e0.x, e0.y, t);
          previewG.moveTo(a0.x, a0.y);
          previewG.lineTo(b0.x, b0.y);
          previewG.stroke({ width: 1.75, color: 0x34d399, alpha: 0.55 });
        }
        if (floorBeamPlacementSession.shiftDirectionLockUnit && floorBeamPlacementSession.firstPointMm) {
          drawShiftDirectionLockGuides2d(
            previewG,
            floorBeamPlacementSession.firstPointMm,
            floorBeamPlacementSession.shiftDirectionLockUnit,
            w,
            h,
            t,
            {
              referenceMm: floorBeamPlacementSession.shiftLockReferenceMm,
              previewEndMm: floorBeamPlacementSession.previewEndMm,
            },
          );
        }
      }

      const fsSessPreview = useAppStore.getState().foundationStripPlacementSession;
      if (
        fsSessPreview?.phase === "waitingSecondPoint" &&
        fsSessPreview.firstPointMm &&
        fsSessPreview.previewEndMm
      ) {
        const f = fsSessPreview.firstPointMm;
        const e = fsSessPreview.previewEndMm;
        const d = fsSessPreview.draft;
        if (d.buildMode === "linear") {
          const ref = fsSessPreview.lastReferenceWallId ?? undefined;
          const n = pickOutwardNormalForStripAxisMm(currentProject, f, e, ref);
          const q = foundationStripSegmentFootprintQuadMm(f, e, n.nx, n.ny, d.side1Mm, d.side2Mm);
          drawFoundationStripPreviewQuads(previewG, [q], t);
        } else {
          const xmin = Math.min(f.x, e.x);
          const xmax = Math.max(f.x, e.x);
          const ymin = Math.min(f.y, e.y);
          const ymax = Math.max(f.y, e.y);
          const { outer, inner } = foundationStripOrthoRingFootprintContoursMm(
            xmin,
            xmax,
            ymin,
            ymax,
            d.side1Mm,
            d.side2Mm,
          );
          drawFoundationStripPreviewRing(previewG, outer, inner, t);
        }
      }

      const fpSessPreview = useAppStore.getState().foundationPilePlacementSession;
      if (fpSessPreview?.previewWorldMm) {
        const draft = fpSessPreview.draft;
        const previewPile: FoundationPileEntity = {
          id: "__preview__",
          layerId: currentProject.activeLayerId,
          pileKind: "reinforcedConcrete",
          centerX: fpSessPreview.previewWorldMm.x,
          centerY: fpSessPreview.previewWorldMm.y,
          sizeMm: draft.sizeMm,
          capSizeMm: draft.capSizeMm,
          heightMm: draft.heightMm,
          levelMm: draft.levelMm,
          createdAt: "",
          updatedAt: "",
        };
        drawFoundationPiles2d(previewG, [previewPile], t, new Set(), {
          appearance: "active",
          clear: false,
        });
      }

      const fpMcPaint = useAppStore.getState().foundationPileMoveCopySession;
      if (fpMcPaint?.phase === "pickTarget" && fpMcPaint.previewCenterMm) {
        const ent = currentProject.foundationPiles.find((p0) => p0.id === fpMcPaint.workingPileId);
        if (ent) {
          const ghost: FoundationPileEntity = {
            ...ent,
            centerX: fpMcPaint.previewCenterMm.x,
            centerY: fpMcPaint.previewCenterMm.y,
          };
          drawFoundationPiles2d(previewG, [ghost], t, new Set(), {
            appearance: "ghost",
            clear: false,
          });
        }
      }

      const fbMcPaint = useAppStore.getState().floorBeamMoveCopySession;
      if (fbMcPaint?.phase === "pickTarget" && fbMcPaint.baseAnchorWorldMm) {
        const bEnt = currentProject.floorBeams.find((b0) => b0.id === fbMcPaint.workingBeamId);
        if (bEnt) {
          const d = fbMcPaint.dragDeltaMm ?? { x: 0, y: 0 };
          const ghostBeam = {
            ...bEnt,
            refStartMm: { x: bEnt.refStartMm.x + d.x, y: bEnt.refStartMm.y + d.y },
            refEndMm: { x: bEnt.refEndMm.x + d.x, y: bEnt.refEndMm.y + d.y },
          };
          drawFloorBeams2d(previewG, currentProject, [ghostBeam], t, new Set(), {
            appearance: "context",
            clear: false,
            highlightOverLinearStock: highlightBeamOverStock,
            overStockPaint,
          });
          const prevMm =
            fbMcPaint.previewTargetMm ??
            (fbMcPaint.dragDeltaMm != null
              ? {
                  x: fbMcPaint.baseAnchorWorldMm.x + fbMcPaint.dragDeltaMm.x,
                  y: fbMcPaint.baseAnchorWorldMm.y + fbMcPaint.dragDeltaMm.y,
                }
              : null);
          if (prevMm) {
            if (fbMcPaint.angleSnapLockedDeg != null && fbMcPaint.shiftDirectionLockUnit == null) {
              const f = fbMcPaint.baseAnchorWorldMm;
              const a = worldToScreen(f.x, f.y, t);
              const b = worldToScreen(prevMm.x, prevMm.y, t);
              previewG.moveTo(a.x, a.y);
              previewG.lineTo(b.x, b.y);
              previewG.stroke({ width: 1.25, color: 0x34d399, alpha: 0.5 });
            }
            if (fbMcPaint.shiftDirectionLockUnit) {
              drawShiftDirectionLockGuides2d(
                previewG,
                fbMcPaint.baseAnchorWorldMm,
                fbMcPaint.shiftDirectionLockUnit,
                w,
                h,
                t,
                {
                  referenceMm: fbMcPaint.shiftLockReferenceMm,
                  previewEndMm: prevMm,
                },
              );
            }
          }
        }
      }

      const wmPaint = useAppStore.getState().wallMoveCopySession;
      if (wmPaint?.phase === "pickTarget" && wmPaint.anchorWorldMm && wmPaint.previewTargetMm) {
        const wM = currentProject.walls.find((w) => w.id === wmPaint.workingWallId);
        if (wM) {
          const dx = wmPaint.previewTargetMm.x - wmPaint.anchorWorldMm.x;
          const dy = wmPaint.previewTargetMm.y - wmPaint.anchorWorldMm.y;
          const gs = { x: wM.start.x + dx, y: wM.start.y + dy };
          const ge = { x: wM.end.x + dx, y: wM.end.y + dy };
          const previewProfile = wM.profileId ? getProfileById(currentProject, wM.profileId) : undefined;
          const layeredPreviewOpts = {
            profile: previewProfile,
            show2dProfileLayers: show2dLayers,
            thicknessMm: wM.thicknessMm,
            zoomPixelsPerMm: viewport2d.zoomPixelsPerMm,
          };
          drawWallPlacementPreview(previewG, gs, ge, wM.thicknessMm, "center", t, layeredPreviewOpts);
          if (wmPaint.angleSnapLockedDeg != null && wmPaint.shiftDirectionLockUnit == null) {
            const f = wmPaint.anchorWorldMm;
            const e = wmPaint.previewTargetMm;
            const a = worldToScreen(f.x, f.y, t);
            const b = worldToScreen(e.x, e.y, t);
            previewG.moveTo(a.x, a.y);
            previewG.lineTo(b.x, b.y);
            previewG.stroke({ width: 1.75, color: 0x34d399, alpha: 0.55 });
          }
          if (wmPaint.shiftDirectionLockUnit && wmPaint.anchorWorldMm) {
            drawShiftDirectionLockGuides2d(
              previewG,
              wmPaint.anchorWorldMm,
              wmPaint.shiftDirectionLockUnit,
              w,
              h,
              t,
              {
                referenceMm: wmPaint.shiftLockReferenceMm,
                previewEndMm: wmPaint.previewTargetMm,
              },
            );
          }
        }
      }

      const stPaint = useAppStore.getState();

      lengthChangeG.clear();
      if (stPaint.activeTool === "changeLength") {
        const layerLc = narrowProjectToActiveLayer(currentProject);
        const lcPaint = stPaint.lengthChange2dSession;
        if (lcPaint) {
          const dx = lcPaint.previewMovingMm.x - lcPaint.fixedEndMm.x;
          const dy = lcPaint.previewMovingMm.y - lcPaint.fixedEndMm.y;
          const Lcur = dx * lcPaint.axisUx + dy * lcPaint.axisUy;
          const lcTarget = lcPaint.target;
          if (lcTarget.kind === "wall") {
            const wLc = layerLc.walls.find((w0) => w0.id === lcTarget.wallId);
            if (wLc) {
              const wPrev = wallWithMovedEndAtLength(wLc, lcPaint.movingEnd, Lcur);
              if (wPrev) {
                const previewProfile = wLc.profileId ? getProfileById(currentProject, wLc.profileId) : undefined;
                const layeredPreviewOpts = {
                  profile: previewProfile,
                  show2dProfileLayers: show2dLayers,
                  thicknessMm: wLc.thicknessMm,
                  zoomPixelsPerMm: viewport2d.zoomPixelsPerMm,
                };
                drawWallPlacementPreview(
                  previewG,
                  wPrev.start,
                  wPrev.end,
                  wLc.thicknessMm,
                  currentProject.settings.editor2d.linearPlacementMode,
                  t,
                  layeredPreviewOpts,
                );
              }
              drawLengthChangeDragOverlay(
                lengthChangeG,
                wLc,
                lcPaint.movingEnd,
                lcPaint.fixedEndMm,
                lcPaint.previewMovingMm,
                t,
              );
            }
          } else {
            const bLc = layerLc.floorBeams.find((b0) => b0.id === lcTarget.beamId);
            if (bLc) {
              const bPrev = floorBeamWithMovedRefEndAtLength(bLc, lcPaint.movingEnd, Lcur);
              if (bPrev) {
                drawFloorBeams2d(previewG, currentProject, [bPrev], t, new Set(), {
                  clear: false,
                  highlightOverLinearStock: highlightBeamOverStock,
                  overStockPaint,
                });
              }
              const origMoving =
                lcPaint.movingEnd === "end"
                  ? { x: bLc.refEndMm.x, y: bLc.refEndMm.y }
                  : { x: bLc.refStartMm.x, y: bLc.refStartMm.y };
              drawLengthChangeDragOverlayForSegment(
                lengthChangeG,
                lcPaint.fixedEndMm,
                lcPaint.previewMovingMm,
                origMoving,
                t,
              );
            }
          }
          if (lcPaint.shiftDirectionLockUnit) {
            drawShiftDirectionLockGuides2d(
              previewG,
              lcPaint.fixedEndMm,
              lcPaint.shiftDirectionLockUnit,
              w,
              h,
              t,
              {
                referenceMm: lcPaint.shiftLockReferenceMm,
                previewEndMm: lcPaint.previewMovingMm,
              },
            );
          }
        } else {
          const h = lengthChangeHoverRef.current;
          if (h) {
            drawLengthChangeEndHoverAtPoint(lengthChangeG, h.hoverPointMm, t);
          }
        }
      }

      const anchorOnP = stPaint.wallAnchorPlacementModeActive;
      const anchorP = stPaint.wallPlacementAnchorMm;
      const endP = stPaint.wallPlacementAnchorPreviewEndMm;
      const wsP = wallPlacementSession;
      const firstPhP =
        wsP && (wsP.phase === "waitingFirstWallPoint" || wsP.phase === "waitingOriginAndFirst");
      if (anchorOnP && anchorP && endP && firstPhP) {
        const a = worldToScreen(anchorP.x, anchorP.y, t);
        const b = worldToScreen(endP.x, endP.y, t);
        const cross = 8;
        previewG.moveTo(a.x - cross, a.y);
        previewG.lineTo(a.x + cross, a.y);
        previewG.moveTo(a.x, a.y - cross);
        previewG.lineTo(a.x, a.y + cross);
        previewG.stroke({ width: 1.25, color: 0xf59e0b, alpha: 0.92 });
        previewG.moveTo(a.x, a.y);
        previewG.lineTo(b.x, b.y);
        previewG.stroke({ width: 1, color: 0x94a3b8, alpha: 0.78 });
        if (stPaint.wallPlacementAnchorAngleSnapLockedDeg != null) {
          previewG.moveTo(a.x, a.y);
          previewG.lineTo(b.x, b.y);
          previewG.stroke({ width: 1.75, color: 0x34d399, alpha: 0.55 });
        }
        previewG.circle(b.x, b.y, 4);
        previewG.stroke({ width: 1, color: 0xe2e8f0, alpha: 0.85 });
      }

      snapMarkerG.clear();
      const wallFirstPickPh =
        wallPlacementSession &&
        (wallPlacementSession.phase === "waitingFirstWallPoint" ||
          wallPlacementSession.phase === "waitingOriginAndFirst") &&
        wallPlacementSession.firstPointMm == null;
      if (
        wallPlacementSession?.previewEndMm &&
        wallPlacementSession.lastSnapKind &&
        wallPlacementSession.lastSnapKind !== "none" &&
        wallFirstPickPh
      ) {
        const sk = wallPlacementSession.lastSnapKind;
        const p = wallPlacementSession.previewEndMm;
        const sc = worldToScreen(p.x, p.y, t);
        const col = sk === "vertex" ? 0x5cff8a : sk === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(sc.x, sc.y, 7);
        snapMarkerG.stroke({ width: 2, color: col, alpha: 0.95 });
        snapMarkerG.circle(sc.x, sc.y, 2);
        snapMarkerG.fill({ color: col, alpha: 0.95 });
      } else if (
        wallPlacementSession?.phase === "waitingSecondPoint" &&
        wallPlacementSession.shiftLockReferenceMm &&
        wallPlacementSession.lastSnapKind &&
        wallPlacementSession.lastSnapKind !== "none"
      ) {
        const sk = wallPlacementSession.lastSnapKind;
        const p = wallPlacementSession.shiftLockReferenceMm;
        const sc = worldToScreen(p.x, p.y, t);
        const col = sk === "vertex" ? 0x5cff8a : sk === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(sc.x, sc.y, 8);
        snapMarkerG.stroke({ width: 2, color: col, alpha: 0.95 });
        snapMarkerG.circle(sc.x, sc.y, 2);
        snapMarkerG.fill({ color: col, alpha: 0.95 });
      } else if (
        wallPlacementSession?.phase === "waitingSecondPoint" &&
        wallPlacementSession.previewEndMm &&
        wallPlacementSession.lastSnapKind &&
        wallPlacementSession.lastSnapKind !== "none" &&
        wallPlacementSession.shiftDirectionLockUnit == null
      ) {
        const sk = wallPlacementSession.lastSnapKind;
        const p = wallPlacementSession.previewEndMm;
        const sc = worldToScreen(p.x, p.y, t);
        const col = sk === "vertex" ? 0x5cff8a : sk === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(sc.x, sc.y, 7);
        snapMarkerG.stroke({ width: 2, color: col, alpha: 0.95 });
        snapMarkerG.circle(sc.x, sc.y, 2);
        snapMarkerG.fill({ color: col, alpha: 0.95 });
      }

      const fbMark = stPaint.floorBeamPlacementSession;
      const fbFirstPickPh =
        fbMark &&
        (fbMark.phase === "waitingFirstPoint" || fbMark.phase === "waitingOriginAndFirst") &&
        fbMark.firstPointMm == null;
      if (
        fbMark?.previewEndMm &&
        fbMark.lastSnapKind &&
        fbMark.lastSnapKind !== "none" &&
        fbFirstPickPh
      ) {
        const skFb = fbMark.lastSnapKind;
        const pFb = fbMark.previewEndMm;
        const scFb = worldToScreen(pFb.x, pFb.y, t);
        const colFb = skFb === "vertex" ? 0x5cff8a : skFb === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scFb.x, scFb.y, 7);
        snapMarkerG.stroke({ width: 2, color: colFb, alpha: 0.95 });
        snapMarkerG.circle(scFb.x, scFb.y, 2);
        snapMarkerG.fill({ color: colFb, alpha: 0.95 });
      } else if (
        fbMark?.phase === "waitingSecondPoint" &&
        fbMark.shiftLockReferenceMm &&
        fbMark.lastSnapKind &&
        fbMark.lastSnapKind !== "none"
      ) {
        const skFb2 = fbMark.lastSnapKind;
        const pFb2 = fbMark.shiftLockReferenceMm;
        const scFb2 = worldToScreen(pFb2.x, pFb2.y, t);
        const colFb2 = skFb2 === "vertex" ? 0x5cff8a : skFb2 === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scFb2.x, scFb2.y, 8);
        snapMarkerG.stroke({ width: 2, color: colFb2, alpha: 0.95 });
        snapMarkerG.circle(scFb2.x, scFb2.y, 2);
        snapMarkerG.fill({ color: colFb2, alpha: 0.95 });
      } else if (
        fbMark?.phase === "waitingSecondPoint" &&
        fbMark.previewEndMm &&
        fbMark.lastSnapKind &&
        fbMark.lastSnapKind !== "none" &&
        fbMark.shiftDirectionLockUnit == null
      ) {
        const skFb3 = fbMark.lastSnapKind;
        const pFb3 = fbMark.previewEndMm;
        const scFb3 = worldToScreen(pFb3.x, pFb3.y, t);
        const colFb3 = skFb3 === "vertex" ? 0x5cff8a : skFb3 === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scFb3.x, scFb3.y, 7);
        snapMarkerG.stroke({ width: 2, color: colFb3, alpha: 0.95 });
        snapMarkerG.circle(scFb3.x, scFb3.y, 2);
        snapMarkerG.fill({ color: colFb3, alpha: 0.95 });
      }

      const rpMark = stPaint.roofPlanePlacementSession;
      const rpFirstPickPh = rpMark && rpMark.phase === "waitingFirstPoint" && rpMark.p1 == null;
      if (
        rpMark?.previewEndMm &&
        rpMark.lastSnapKind &&
        rpMark.lastSnapKind !== "none" &&
        rpFirstPickPh
      ) {
        const skRp = rpMark.lastSnapKind;
        const pRp = rpMark.previewEndMm;
        const scRp = worldToScreen(pRp.x, pRp.y, t);
        const colRp = skRp === "vertex" ? 0x5cff8a : skRp === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scRp.x, scRp.y, 7);
        snapMarkerG.stroke({ width: 2, color: colRp, alpha: 0.95 });
        snapMarkerG.circle(scRp.x, scRp.y, 2);
        snapMarkerG.fill({ color: colRp, alpha: 0.95 });
      } else if (
        rpMark?.phase === "waitingSecondPoint" &&
        rpMark.shiftLockReferenceMm &&
        rpMark.lastSnapKind &&
        rpMark.lastSnapKind !== "none"
      ) {
        const skRp2 = rpMark.lastSnapKind;
        const pRp2 = rpMark.shiftLockReferenceMm;
        const scRp2 = worldToScreen(pRp2.x, pRp2.y, t);
        const colRp2 = skRp2 === "vertex" ? 0x5cff8a : skRp2 === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scRp2.x, scRp2.y, 8);
        snapMarkerG.stroke({ width: 2, color: colRp2, alpha: 0.95 });
        snapMarkerG.circle(scRp2.x, scRp2.y, 2);
        snapMarkerG.fill({ color: colRp2, alpha: 0.95 });
      } else if (
        rpMark?.phase === "waitingSecondPoint" &&
        rpMark.previewEndMm &&
        rpMark.lastSnapKind &&
        rpMark.lastSnapKind !== "none" &&
        rpMark.shiftDirectionLockUnit == null
      ) {
        const skRp3 = rpMark.lastSnapKind;
        const pRp3 = rpMark.previewEndMm;
        const scRp3 = worldToScreen(pRp3.x, pRp3.y, t);
        const colRp3 = skRp3 === "vertex" ? 0x5cff8a : skRp3 === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scRp3.x, scRp3.y, 7);
        snapMarkerG.stroke({ width: 2, color: colRp3, alpha: 0.95 });
        snapMarkerG.circle(scRp3.x, scRp3.y, 2);
        snapMarkerG.fill({ color: colRp3, alpha: 0.95 });
      } else if (
        rpMark?.phase === "waitingDepth" &&
        rpMark.previewEndMm &&
        rpMark.lastSnapKind &&
        rpMark.lastSnapKind !== "none"
      ) {
        const skRp4 = rpMark.lastSnapKind;
        const pRp4 = rpMark.previewEndMm;
        const scRp4 = worldToScreen(pRp4.x, pRp4.y, t);
        const colRp4 = skRp4 === "vertex" ? 0x5cff8a : skRp4 === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scRp4.x, scRp4.y, 7);
        snapMarkerG.stroke({ width: 2, color: colRp4, alpha: 0.95 });
        snapMarkerG.circle(scRp4.x, scRp4.y, 2);
        snapMarkerG.fill({ color: colRp4, alpha: 0.95 });
      }

      const fbMvMark = stPaint.floorBeamMoveCopySession;
      const subtleMoveMark = (sx: number, sy: number, sk: "vertex" | "edge" | "grid") => {
        const colM = sk === "vertex" ? 0x5cff8a : sk === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(sx, sy, 3.5);
        snapMarkerG.stroke({ width: 1, color: colM, alpha: 0.82 });
        snapMarkerG.circle(sx, sy, 1.25);
        snapMarkerG.fill({ color: colM, alpha: 0.88 });
      };
      if (
        fbMvMark?.phase === "pickBase" &&
        fbMvMark.pickBaseHoverWorldMm &&
        fbMvMark.pickBaseHoverSnapKind &&
        fbMvMark.pickBaseHoverSnapKind !== "none"
      ) {
        const skBm = fbMvMark.pickBaseHoverSnapKind;
        const pBm = fbMvMark.pickBaseHoverWorldMm;
        const scBm = worldToScreen(pBm.x, pBm.y, t);
        subtleMoveMark(scBm.x, scBm.y, skBm === "vertex" ? "vertex" : skBm === "edge" ? "edge" : "grid");
      } else if (
        fbMvMark?.phase === "pickTarget" &&
        fbMvMark.baseAnchorWorldMm &&
        fbMvMark.shiftLockReferenceMm &&
        fbMvMark.lastSnapKind &&
        fbMvMark.lastSnapKind !== "none"
      ) {
        const skL = fbMvMark.lastSnapKind;
        const pL = fbMvMark.shiftLockReferenceMm;
        const scL = worldToScreen(pL.x, pL.y, t);
        subtleMoveMark(scL.x, scL.y, skL === "vertex" ? "vertex" : skL === "edge" ? "edge" : "grid");
      } else if (
        fbMvMark?.phase === "pickTarget" &&
        fbMvMark.previewTargetMm &&
        fbMvMark.lastSnapKind &&
        fbMvMark.lastSnapKind !== "none" &&
        fbMvMark.shiftDirectionLockUnit == null
      ) {
        const skT = fbMvMark.lastSnapKind;
        const pT = fbMvMark.previewTargetMm;
        const scT = worldToScreen(pT.x, pT.y, t);
        subtleMoveMark(scT.x, scT.y, skT === "vertex" ? "vertex" : skT === "edge" ? "edge" : "grid");
      }

      const fsMark = stPaint.foundationStripPlacementSession;
      if (
        fsMark &&
        fsMark.phase === "waitingFirstPoint" &&
        fsMark.previewEndMm &&
        fsMark.lastSnapKind &&
        fsMark.lastSnapKind !== "none"
      ) {
        const skF = fsMark.lastSnapKind;
        const pF = fsMark.previewEndMm;
        const scF = worldToScreen(pF.x, pF.y, t);
        const colF = skF === "vertex" ? 0x5cff8a : skF === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scF.x, scF.y, 7);
        snapMarkerG.stroke({ width: 2, color: colF, alpha: 0.95 });
        snapMarkerG.circle(scF.x, scF.y, 2);
        snapMarkerG.fill({ color: colF, alpha: 0.95 });
      } else if (
        fsMark &&
        fsMark.phase === "waitingSecondPoint" &&
        fsMark.previewEndMm &&
        fsMark.lastSnapKind &&
        fsMark.lastSnapKind !== "none"
      ) {
        const skF2 = fsMark.lastSnapKind;
        const pF2 = fsMark.previewEndMm;
        const scF2 = worldToScreen(pF2.x, pF2.y, t);
        const colF2 = skF2 === "vertex" ? 0x5cff8a : skF2 === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scF2.x, scF2.y, 7);
        snapMarkerG.stroke({ width: 2, color: colF2, alpha: 0.95 });
        snapMarkerG.circle(scF2.x, scF2.y, 2);
        snapMarkerG.fill({ color: colF2, alpha: 0.95 });
      }

      const fpMark = stPaint.foundationPilePlacementSession;
      if (
        fpMark &&
        fpMark.previewWorldMm &&
        fpMark.lastSnapKind &&
        fpMark.lastSnapKind !== "none"
      ) {
        const skP = fpMark.lastSnapKind;
        const pP = fpMark.previewWorldMm;
        const scP = worldToScreen(pP.x, pP.y, t);
        const colP = skP === "vertex" ? 0x5cff8a : skP === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scP.x, scP.y, 7);
        snapMarkerG.stroke({ width: 2, color: colP, alpha: 0.95 });
        snapMarkerG.circle(scP.x, scP.y, 2);
        snapMarkerG.fill({ color: colP, alpha: 0.95 });
      }

      const slabMark = stPaint.slabPlacementSession;
      if (
        slabMark &&
        slabMark.previewEndMm &&
        slabMark.lastSnapKind &&
        slabMark.lastSnapKind !== "none" &&
        (slabMark.phase === "waitingFirstPoint" ||
          slabMark.phase === "waitingSecondPoint" ||
          slabMark.phase === "polylineDrawing")
      ) {
        const skSl = slabMark.lastSnapKind;
        const pSl = slabMark.previewEndMm;
        const scSl = worldToScreen(pSl.x, pSl.y, t);
        const colSl = skSl === "vertex" ? 0x5cff8a : skSl === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scSl.x, scSl.y, 7);
        snapMarkerG.stroke({ width: 2, color: colSl, alpha: 0.95 });
        snapMarkerG.circle(scSl.x, scSl.y, 2);
        snapMarkerG.fill({ color: colSl, alpha: 0.95 });
      }

      if (
        stPaint.wallAnchorPlacementModeActive &&
        stPaint.wallPlacementAnchorMm &&
        stPaint.wallPlacementAnchorPreviewEndMm &&
        wsP &&
        (wsP.phase === "waitingFirstWallPoint" || wsP.phase === "waitingOriginAndFirst") &&
        stPaint.wallPlacementAnchorLastSnapKind &&
        stPaint.wallPlacementAnchorLastSnapKind !== "none"
      ) {
        const skA = stPaint.wallPlacementAnchorLastSnapKind;
        const pA = stPaint.wallPlacementAnchorPreviewEndMm;
        const scA = worldToScreen(pA.x, pA.y, t);
        const colA = skA === "vertex" ? 0x5cff8a : skA === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scA.x, scA.y, 7);
        snapMarkerG.stroke({ width: 2, color: colA, alpha: 0.95 });
        snapMarkerG.circle(scA.x, scA.y, 2);
        snapMarkerG.fill({ color: colA, alpha: 0.95 });
      }

      if (
        wmPaint?.phase === "pickTarget" &&
        wmPaint.previewTargetMm &&
        wmPaint.lastSnapKind &&
        wmPaint.lastSnapKind !== "none"
      ) {
        const skW = wmPaint.lastSnapKind;
        const pW = wmPaint.shiftLockReferenceMm ?? wmPaint.previewTargetMm;
        const scW = worldToScreen(pW.x, pW.y, t);
        const colW = skW === "vertex" ? 0x5cff8a : skW === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scW.x, scW.y, 7);
        snapMarkerG.stroke({ width: 2, color: colW, alpha: 0.95 });
        snapMarkerG.circle(scW.x, scW.y, 2);
        snapMarkerG.fill({ color: colW, alpha: 0.95 });
      }

      if (
        stPaint.activeTool === "changeLength" &&
        stPaint.lengthChange2dSession &&
        stPaint.lengthChange2dSession.shiftLockReferenceMm &&
        stPaint.lengthChange2dSession.lastSnapKind &&
        stPaint.lengthChange2dSession.lastSnapKind !== "none"
      ) {
        const lcSnap = stPaint.lengthChange2dSession;
        const pSn = lcSnap.shiftLockReferenceMm!;
        const scSn = worldToScreen(pSn.x, pSn.y, t);
        const skSn = lcSnap.lastSnapKind;
        const colSn = skSn === "vertex" ? 0x5cff8a : skSn === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scSn.x, scSn.y, 8);
        snapMarkerG.stroke({ width: 2, color: colSn, alpha: 0.95 });
        snapMarkerG.circle(scSn.x, scSn.y, 2);
        snapMarkerG.fill({ color: colSn, alpha: 0.95 });
      } else if (
        stPaint.activeTool === "changeLength" &&
        stPaint.lengthChange2dSession &&
        stPaint.lengthChange2dSession.lastSnapKind &&
        stPaint.lengthChange2dSession.lastSnapKind !== "none" &&
        stPaint.lengthChange2dSession.shiftDirectionLockUnit == null
      ) {
        const lcSnap = stPaint.lengthChange2dSession;
        const pSn = lcSnap.previewMovingMm;
        const scSn = worldToScreen(pSn.x, pSn.y, t);
        const skSn = lcSnap.lastSnapKind;
        const colSn = skSn === "vertex" ? 0x5cff8a : skSn === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scSn.x, scSn.y, 7);
        snapMarkerG.stroke({ width: 2, color: colSn, alpha: 0.95 });
        snapMarkerG.circle(scSn.x, scSn.y, 2);
        snapMarkerG.fill({ color: colSn, alpha: 0.95 });
      }

      entityCopyGhostG.clear();
      entityCopySnapG.clear();
      const ecPaint = stPaint.entityCopySession;
      if (ecPaint) {
        drawEntityCopySnapMarkers2d(entityCopySnapG, ecPaint.snapMarkers, t);
        if (
          ecPaint.phase === "pickTarget" &&
          ecPaint.worldAnchorStart &&
          ecPaint.previewTargetWorldMm
        ) {
          const gdx = ecPaint.previewTargetWorldMm.x - ecPaint.worldAnchorStart.x;
          const gdy = ecPaint.previewTargetWorldMm.y - ecPaint.worldAnchorStart.y;
          drawEntityCopyGhost2d(
            entityCopyGhostG,
            stPaint.currentProject,
            ecPaint.target,
            gdx,
            gdy,
            t,
          );
        }
      }

      rulerG.clear();
      const toolPaint = stPaint.activeTool;
      const rSess = stPaint.ruler2dSession;
      const RULER_STROKE = 0xd97706;
      if (toolPaint === "ruler" && rSess?.firstMm) {
        const endRm =
          rSess.phase === "stretching" ? rSess.previewEndMm : rSess.phase === "done" ? rSess.secondMm : null;
        if (endRm) {
          const p0 = rSess.firstMm;
          const s0 = worldToScreen(p0.x, p0.y, t);
          const s1 = worldToScreen(endRm.x, endRm.y, t);
          rulerG.moveTo(s0.x, s0.y);
          rulerG.lineTo(s1.x, s1.y);
          rulerG.stroke({ width: 1.15, color: RULER_STROKE, alpha: 0.9 });
          rulerG.circle(s0.x, s0.y, 3);
          rulerG.fill({ color: RULER_STROKE, alpha: 0.88 });
          rulerG.stroke({ width: 0.9, color: RULER_STROKE, alpha: 0.92 });
          rulerG.circle(s1.x, s1.y, 3);
          rulerG.fill({
            color: RULER_STROKE,
            alpha: rSess.phase === "stretching" ? 0.4 : 0.88,
          });
          rulerG.stroke({ width: 0.9, color: RULER_STROKE, alpha: 0.92 });
        }
        if (
          rSess.phase === "stretching" &&
          rSess.shiftDirectionLockUnit &&
          rSess.firstMm &&
          endRm
        ) {
          drawShiftDirectionLockGuides2d(
            rulerG,
            rSess.firstMm,
            rSess.shiftDirectionLockUnit,
            w,
            h,
            t,
            {
              referenceMm: rSess.shiftLockReferenceMm,
              previewEndMm: rSess.previewEndMm,
            },
          );
        }
      }

      if (
        toolPaint === "ruler" &&
        rSess?.phase === "stretching" &&
        rSess.previewEndMm &&
        rSess.lastSnapKind &&
        rSess.lastSnapKind !== "none"
      ) {
        const skR = rSess.lastSnapKind;
        const pR = rSess.shiftLockReferenceMm ?? rSess.previewEndMm;
        const scR = worldToScreen(pR.x, pR.y, t);
        const colR = skR === "vertex" ? 0x5cff8a : skR === "edge" ? 0x5ab4ff : 0xffc857;
        const rPx = 4;
        snapMarkerG.circle(scR.x, scR.y, rPx);
        snapMarkerG.stroke({ width: 1.15, color: colR, alpha: 0.88 });
        snapMarkerG.circle(scR.x, scR.y, 1.35);
        snapMarkerG.fill({ color: colR, alpha: 0.92 });
      }

      lineG.clear();
      const lSess = stPaint.line2dSession;
      const LINE_STROKE = 0x38bdf8;
      if (toolPaint === "line" && lSess?.firstMm && lSess.phase === "stretching" && lSess.previewEndMm) {
        const p0l = lSess.firstMm;
        const endL = lSess.previewEndMm;
        const s0l = worldToScreen(p0l.x, p0l.y, t);
        const s1l = worldToScreen(endL.x, endL.y, t);
        lineG.moveTo(s0l.x, s0l.y);
        lineG.lineTo(s1l.x, s1l.y);
        lineG.stroke({ width: 1.35, color: LINE_STROKE, alpha: 0.92 });
        lineG.circle(s0l.x, s0l.y, 3.5);
        lineG.fill({ color: LINE_STROKE, alpha: 0.88 });
        lineG.stroke({ width: 1, color: LINE_STROKE, alpha: 0.95 });
        lineG.circle(s1l.x, s1l.y, 3.5);
        lineG.fill({ color: LINE_STROKE, alpha: 0.45 });
        lineG.stroke({ width: 1, color: LINE_STROKE, alpha: 0.95 });
        if (
          lSess.angleSnapLockedDeg != null &&
          lSess.shiftDirectionLockUnit == null
        ) {
          lineG.moveTo(s0l.x, s0l.y);
          lineG.lineTo(s1l.x, s1l.y);
          lineG.stroke({ width: 1.75, color: 0x34d399, alpha: 0.55 });
        }
        if (lSess.shiftDirectionLockUnit) {
          drawShiftDirectionLockGuides2d(
            lineG,
            lSess.firstMm,
            lSess.shiftDirectionLockUnit,
            w,
            h,
            t,
            {
              referenceMm: lSess.shiftLockReferenceMm,
              previewEndMm: lSess.previewEndMm,
            },
          );
        }
      }

      if (
        toolPaint === "line" &&
        lSess?.phase === "stretching" &&
        lSess.previewEndMm &&
        lSess.lastSnapKind &&
        lSess.lastSnapKind !== "none"
      ) {
        const skL = lSess.lastSnapKind;
        const pL = lSess.shiftLockReferenceMm ?? lSess.previewEndMm;
        const scL = worldToScreen(pL.x, pL.y, t);
        const colL = skL === "vertex" ? 0x5cff8a : skL === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scL.x, scL.y, 7);
        snapMarkerG.stroke({ width: 2, color: colL, alpha: 0.95 });
        snapMarkerG.circle(scL.x, scL.y, 2);
        snapMarkerG.fill({ color: colL, alpha: 0.95 });
      }

      marqueeG.clear();
      if (marquee) {
        const x = Math.min(marquee.sx, marquee.cx);
        const y = Math.min(marquee.sy, marquee.cy);
        const rw = Math.abs(marquee.cx - marquee.sx);
        const rh = Math.abs(marquee.cy - marquee.sy);
        marqueeG.rect(x, y, rw, rh);
        marqueeG.fill({ color: 0x5aa7ff, alpha: 0.14 });
        marqueeG.stroke({ width: 1, color: 0x5aa7ff, alpha: 0.9 });
      }

      const stOrigin = useAppStore.getState();
      const oMark = currentProject.projectOrigin;
      if (oMark) {
        drawProjectOriginMarker2d(originMarkerC, oMark, t, {
          toolActive: stOrigin.projectOriginMoveToolActive,
        });
      } else {
        for (const ch of [...originMarkerC.children]) {
          ch.destroy({ children: true });
        }
        originMarkerC.removeChildren();
      }

      roofPlaneEditHandlesG.clear();
      const stRoofEdit = useAppStore.getState();
      const roofEditHandlesVisible =
        stRoofEdit.activeTool === "select" &&
        stRoofEdit.currentProject.viewState.editor2dPlanScope === "roof" &&
        !stRoofEdit.roofContourJoinSession &&
        stRoofEdit.selectedEntityIds.length === 1;
      if (!roofEditHandlesVisible) {
        roofPlaneEditSelectedRef.current = null;
      }
      if (roofEditHandlesVisible) {
        const onlyRpId = stRoofEdit.selectedEntityIds[0]!;
        const rpSel = layerView.roofPlanes.find((r) => r.id === onlyRpId);
        const quadSel = rpSel ? roofPlaneQuad4OrNull(rpSel) : null;
        if (quadSel) {
          const sr = roofPlaneEditSelectedRef.current;
          if (sr && sr.planeId !== onlyRpId) {
            roofPlaneEditSelectedRef.current = null;
          }
          const rpAct = roofPlaneEditPointerRef.current;
          const roofEditActiveUi =
            rpAct != null
              ? {
                  planeId: rpAct.planeId,
                  kind: rpAct.kind,
                  edgeIndex: rpAct.edgeIndex,
                  cornerIndex: rpAct.cornerIndex,
                  dragActive: rpAct.dragActive,
                }
              : null;
          drawRoofPlaneEditHandles2d(
            roofPlaneEditHandlesG,
            quadSel,
            t,
            onlyRpId,
            roofPlaneEditHoverRef.current,
            roofPlaneEditSelectedRef.current,
            roofEditActiveUi,
          );
        }
      }

      syncAnchorCrosshairOverlay(app.canvas as HTMLCanvasElement);
    };

    let detachListeners: (() => void) | null = null;
    let unsubStore: (() => void) | null = null;
    let unsubTheme: (() => void) | null = null;
    let ro: ResizeObserver | null = null;

    void (async () => {
      const app = new Application();
      const initialCanvas = readCanvasColorsFromTheme();
      await app.init({
        resizeTo: host,
        background: initialCanvas.bg,
        antialias: true,
        autoDensity: true,
        resolution: typeof window !== "undefined" ? window.devicePixelRatio : 1,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      appRef.current = app;
      host.appendChild(app.canvas as HTMLCanvasElement);

      worldRoot.hitArea = app.screen;
      worldRoot.addChild(gridG);
      worldRoot.addChild(foundationStripsG);
      worldRoot.addChild(foundationPilesG);
      worldRoot.addChild(slabsG);
      worldRoot.addChild(slabPreviewG);
      worldRoot.addChild(roofBattens2dG);
      worldRoot.addChild(roofPlanesG);
      worldRoot.addChild(roofSystemRidgesG);
      worldRoot.addChild(roofPlanePreviewG);
      worldRoot.addChild(wallsG);
      worldRoot.addChild(floorBeamsG);
      worldRoot.addChild(planLinesG);
      worldRoot.addChild(wallCalcG);
      worldRoot.addChild(wallCalcLabelC);
      worldRoot.addChild(openingsG);
      worldRoot.addChild(wallLabelsC);
      worldRoot.addChild(windowOpeningLabelsC);
      worldRoot.addChild(roofPlaneLabelsC);
      worldRoot.addChild(dimensionsG);
      worldRoot.addChild(dimensionsLabelC);
      worldRoot.addChild(openingMoveG);
      worldRoot.addChild(openingMoveLabelC);
      worldRoot.addChild(jointPickG);
      worldRoot.addChild(roofContourJoinG);
      worldRoot.addChild(windowPlacementG);
      worldRoot.addChild(previewG);
      worldRoot.addChild(lengthChangeG);
      worldRoot.addChild(snapMarkerG);
      worldRoot.addChild(entityCopyGhostG);
      worldRoot.addChild(entityCopySnapG);
      worldRoot.addChild(rulerG);
      worldRoot.addChild(lineG);
      worldRoot.addChild(marqueeG);
      worldRoot.addChild(originMarkerC);
      worldRoot.addChild(roofPlaneEditHandlesG);
      app.stage.addChild(worldRoot);
      useAppStore.getState().setViewportCanvas2dPx(app.renderer.width, app.renderer.height);

      const onWheel = (ev: WheelEvent) => {
        ev.preventDefault();
        const canvas = app.canvas as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        const sx = ev.clientX - rect.left;
        const sy = ev.clientY - rect.top;
        const w = app.renderer.width;
        const h = app.renderer.height;
        const { viewport2d } = useAppStore.getState();
        const before = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const worldAt = screenToWorld(sx, sy, before);
        const factor = ev.deltaY > 0 ? 0.9 : 1.1;
        const nextZoom = Math.min(2, Math.max(0.01, viewport2d.zoomPixelsPerMm * factor));
        const after = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, nextZoom);
        const worldAtAfter = screenToWorld(sx, sy, after);
        useAppStore.getState().setViewport2d({
          ...viewport2d,
          zoomPixelsPerMm: nextZoom,
          panXMm: viewport2d.panXMm + (worldAt.x - worldAtAfter.x),
          panYMm: viewport2d.panYMm + (worldAt.y - worldAtAfter.y),
        });
      };

      const canvas = app.canvas as HTMLCanvasElement;
      canvasForOpeningDragRef.current = canvas;
      canvas.addEventListener("wheel", onWheel, { passive: false });

      /** Capture для панорамы ПКМ в режиме «Выделение». */
      let panPointerId = 0;

      const onCanvasContextMenu = (e: MouseEvent) => {
        e.preventDefault();
      };
      canvas.addEventListener("contextmenu", onCanvasContextMenu);

      const endPan = () => {
        if (panPointerId !== 0) {
          try {
            canvas.releasePointerCapture(panPointerId);
          } catch {
            /* ignore */
          }
          panPointerId = 0;
        }
        panning.active = false;
        applyAnchorCrosshairCursorTargets(canvas, "");
        syncAnchorCrosshairOverlay(canvas);
      };

      let marqueePointerId = 0;

      const finalizeMarquee = () => {
        const m = marquee;
        if (!m) {
          return;
        }
        const pid = marqueePointerId;
        marquee = null;
        marqueePointerId = 0;
        try {
          canvas.releasePointerCapture(pid);
        } catch {
          /* ignore */
        }

        const dist = Math.hypot(m.cx - m.sx, m.cy - m.sy);
        const w = app.renderer.width;
        const h = app.renderer.height;
        const { viewport2d, currentProject, activeTool } = useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);

        if (dist < MARQUEE_MIN_DRAG_PX) {
          if (activeTool === "select") {
            const store = useAppStore.getState();
            const wClick = screenToWorld(m.sx, m.sy, t);
            const layerView = narrowProjectToActiveLayer(currentProject);
            const tol = openingPickTolerancesMm(viewport2d.zoomPixelsPerMm);
            const hitOp = pickPlacedOpeningOnLayerSlice(layerView, wClick, tol.along, tol.perp);
            if (hitOp) {
              if (m.shiftKey) {
                const s = new Set(store.selectedEntityIds);
                if (s.has(hitOp.id)) {
                  s.delete(hitOp.id);
                } else {
                  s.add(hitOp.id);
                }
                store.setSelectedEntityIds([...s]);
              } else {
                store.setSelectedEntityIds([hitOp.id]);
              }
            } else {
              const segTol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
              const hitLine = pickClosestPlanLineAlongPoint(wClick, layerView.planLines, segTol);
              if (hitLine) {
                if (m.shiftKey) {
                  const s = new Set(store.selectedEntityIds);
                  if (s.has(hitLine.planLineId)) {
                    s.delete(hitLine.planLineId);
                  } else {
                    s.add(hitLine.planLineId);
                  }
                  store.setSelectedEntityIds([...s]);
                } else {
                  store.setSelectedEntityIds([hitLine.planLineId]);
                }
              } else {
                const hitPile = pickClosestFoundationPileAtPoint(wClick, layerView.foundationPiles, segTol);
                if (hitPile) {
                  if (m.shiftKey) {
                    const s = new Set(store.selectedEntityIds);
                    if (s.has(hitPile.pileId)) {
                      s.delete(hitPile.pileId);
                    } else {
                      s.add(hitPile.pileId);
                    }
                    store.setSelectedEntityIds([...s]);
                  } else {
                    store.setSelectedEntityIds([hitPile.pileId]);
                  }
                } else {
                  const hitFs = pickClosestFoundationStripAlongPoint(wClick, layerView.foundationStrips, segTol);
                  if (hitFs) {
                    if (m.shiftKey) {
                      const s = new Set(store.selectedEntityIds);
                      if (s.has(hitFs.stripId)) {
                        s.delete(hitFs.stripId);
                      } else {
                        s.add(hitFs.stripId);
                      }
                      store.setSelectedEntityIds([...s]);
                    } else {
                      store.setSelectedEntityIds([hitFs.stripId]);
                    }
                  } else {
                    const hitRoofTap = pickClosestRoofPlaneAtPoint(wClick, layerView.roofPlanes, segTol);
                    if (hitRoofTap) {
                      if (m.shiftKey) {
                        const s = new Set(store.selectedEntityIds);
                        if (s.has(hitRoofTap.roofPlaneId)) {
                          s.delete(hitRoofTap.roofPlaneId);
                        } else {
                          s.add(hitRoofTap.roofPlaneId);
                        }
                        store.setSelectedEntityIds([...s]);
                      } else {
                        store.setSelectedEntityIds([hitRoofTap.roofPlaneId]);
                      }
                    } else {
                    const hitBeam = pickFloorBeamAtPlanPoint(currentProject, layerView.floorBeams, wClick, segTol);
                    if (hitBeam) {
                      if (m.shiftKey) {
                        const s = new Set(store.selectedEntityIds);
                        if (s.has(hitBeam.id)) {
                          s.delete(hitBeam.id);
                        } else {
                          s.add(hitBeam.id);
                        }
                        store.setSelectedEntityIds([...s]);
                      } else {
                        store.setSelectedEntityIds([hitBeam.id]);
                      }
                    } else {
                      const hitWall = pickClosestWallAlongPoint(wClick, layerView.walls, segTol);
                      if (hitWall) {
                        if (m.shiftKey) {
                          const s = new Set(store.selectedEntityIds);
                          if (s.has(hitWall.wallId)) {
                            s.delete(hitWall.wallId);
                          } else {
                            s.add(hitWall.wallId);
                          }
                          store.setSelectedEntityIds([...s]);
                        } else {
                          store.setSelectedEntityIds([hitWall.wallId]);
                        }
                      } else {
                        store.clearSelection();
                      }
                    }
                    }
                  }
                }
              }
            }
          }
          return;
        }

        const w0 = screenToWorld(m.sx, m.sy, t);
        const w1 = screenToWorld(m.cx, m.cy, t);
        const layerView = narrowProjectToActiveLayer(currentProject);
        const ids = computeMarqueeSelection(layerView, w0.x, w0.y, w1.x, w1.y);
        useAppStore.getState().setSelectedEntityIds(ids);
      };

      const onPointerMove = (ev: FederatedPointerEvent) => {
        const w = app.renderer.width;
        const h = app.renderer.height;
        const {
          viewport2d,
          wallPlacementSession,
          floorBeamPlacementSession,
          currentProject,
          wallJointSession,
          wallCoordinateModalOpen,
          floorBeamPlacementCoordinateModalOpen,
          activeTool,
          ruler2dSession,
          line2dSession,
        } = useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const p = screenToWorld(ev.global.x, ev.global.y, t);
        const coordBlock = isSceneCoordinateModalBlocking(useAppStore.getState());
        if (!coordBlock) {
          cursorCbRef.current({ x: p.x, y: p.y });
          const rectPtr = canvas.getBoundingClientRect();
          const scaleXp = rectPtr.width / w;
          const scaleYp = rectPtr.height / h;
          lastPointerAnchorCrosshairRef.current = {
            inside: true,
            cssX: ev.global.x * scaleXp,
            cssY: ev.global.y * scaleYp,
            worldX: p.x,
            worldY: p.y,
          };
        }

        const opSess = openingPointerRef.current;
        if (!coordBlock && opSess && ev.pointerId === opSess.pointerId) {
          const distPx = Math.hypot(ev.global.x - opSess.sx, ev.global.y - opSess.sy);
          if (!opSess.dragActive && distPx >= OPENING_DRAG_THRESHOLD_PX && opSess.moveToolSession) {
            opSess.dragActive = true;
            lastOpeningClickRef.current = null;
            if (openingDragHistoryBaselineRef.current == null) {
              openingDragHistoryBaselineRef.current = cloneProjectSnapshot(useAppStore.getState().currentProject);
            }
            const proj0 = useAppStore.getState().currentProject;
            const o0 = proj0.openings.find((x) => x.id === opSess.openingId);
            opSess.startLeftEdgeMm = o0?.offsetFromStartMm ?? null;
          }
          if (opSess.dragActive && opSess.moveToolSession) {
            const proj = useAppStore.getState().currentProject;
            const wall = proj.walls.find((x) => x.id === opSess.wallId);
            const opn = proj.openings.find((x) => x.id === opSess.openingId);
            if (wall && opn && (opSess.kind === "window" || opSess.kind === "door")) {
              const along = projectWorldToAlongMm(wall, p);
              const rawLeft = offsetFromStartForCursorCentered(along, opn.widthMm);
              const placeKind = opSess.kind === "door" ? "door" : "window";
              const left = clampPlacedOpeningLeftEdgeMm(wall, opn.widthMm, rawLeft, proj, placeKind);
              const v = validateWindowPlacementOnWall(wall, left, opn.widthMm, proj, opSess.openingId, {
                openingKind: opSess.kind,
              });
              if (v.ok) {
                useAppStore.getState().applyOpeningRepositionLeftEdge(opSess.openingId, left, { skipHistory: true });
              }
              if (opSess.startLeftEdgeMm != null) {
                const proj2 = useAppStore.getState().currentProject;
                const o2 = proj2.openings.find((x) => x.id === opSess.openingId);
                if (o2?.offsetFromStartMm != null) {
                  const deltaMm = Math.round(o2.offsetFromStartMm - opSess.startLeftEdgeMm);
                  const rectHud = canvas.getBoundingClientRect();
                  setOpeningMoveDragHud({
                    left: rectHud.left + (ev.global.x / w) * rectHud.width + 12,
                    top: rectHud.top + (ev.global.y / h) * rectHud.height + 12,
                    deltaMm,
                  });
                }
              }
            }
          }
        }

        const fpSess = foundationPilePointerRef.current;
        if (!coordBlock && fpSess && ev.pointerId === fpSess.pointerId) {
          const distPxFp = Math.hypot(ev.global.x - fpSess.sx, ev.global.y - fpSess.sy);
          if (!fpSess.dragActive && distPxFp >= OPENING_DRAG_THRESHOLD_PX) {
            fpSess.dragActive = true;
            if (foundationPileDragHistoryBaselineRef.current == null) {
              foundationPileDragHistoryBaselineRef.current = cloneProjectSnapshot(useAppStore.getState().currentProject);
            }
          }
          if (fpSess.dragActive) {
            const dxMm = p.x - fpSess.lastWorldMm.x;
            const dyMm = p.y - fpSess.lastWorldMm.y;
            if (Number.isFinite(dxMm) && Number.isFinite(dyMm) && (Math.abs(dxMm) > 1e-9 || Math.abs(dyMm) > 1e-9)) {
              useAppStore.getState().applyFoundationPilesWorldDeltaMm(fpSess.pileIds, dxMm, dyMm, { skipHistory: true });
              fpSess.lastWorldMm = { x: p.x, y: p.y };
            }
          }
        }

        const slabPtrSess = slabPointerRef.current;
        if (!coordBlock && slabPtrSess && ev.pointerId === slabPtrSess.pointerId) {
          const distPxSl = Math.hypot(ev.global.x - slabPtrSess.sx, ev.global.y - slabPtrSess.sy);
          if (!slabPtrSess.dragActive && distPxSl >= OPENING_DRAG_THRESHOLD_PX) {
            slabPtrSess.dragActive = true;
            lastSlabClickRef.current = null;
            if (slabDragHistoryBaselineRef.current == null) {
              slabDragHistoryBaselineRef.current = cloneProjectSnapshot(useAppStore.getState().currentProject);
            }
          }
          if (slabPtrSess.dragActive) {
            const dxMmSl = p.x - slabPtrSess.lastWorldMm.x;
            const dyMmSl = p.y - slabPtrSess.lastWorldMm.y;
            if (
              Number.isFinite(dxMmSl) &&
              Number.isFinite(dyMmSl) &&
              (Math.abs(dxMmSl) > 1e-9 || Math.abs(dyMmSl) > 1e-9)
            ) {
              useAppStore.getState().applySlabsWorldDeltaMm(slabPtrSess.slabIds, dxMmSl, dyMmSl, { skipHistory: true });
              slabPtrSess.lastWorldMm = { x: p.x, y: p.y };
            }
          }
        }

        const rpEditPtr = roofPlaneEditPointerRef.current;
        if (!coordBlock && rpEditPtr && ev.pointerId === rpEditPtr.pointerId && !rpEditPtr.suspendedForModal) {
          const distPxRp = Math.hypot(ev.global.x - rpEditPtr.sx, ev.global.y - rpEditPtr.sy);
          if (!rpEditPtr.dragActive && distPxRp >= OPENING_DRAG_THRESHOLD_PX) {
            rpEditPtr.dragActive = true;
            if (roofPlaneEditDragHistoryBaselineRef.current == null) {
              roofPlaneEditDragHistoryBaselineRef.current = cloneProjectSnapshot(useAppStore.getState().currentProject);
            }
          }
          if (rpEditPtr.dragActive) {
            const projRp = useAppStore.getState().currentProject;
            const e2Rp = projRp.settings.editor2d;
            const snapRp = resolveSnap2d({
              rawWorldMm: p,
              viewport: t,
              project: projRp,
              snapSettings: {
                snapToVertex: e2Rp.snapToVertex,
                snapToEdge: e2Rp.snapToEdge,
                snapToGrid: e2Rp.snapToGrid,
              },
              gridStepMm: projRp.settings.gridStepMm,
            });
            const applyLive = useAppStore.getState().applyRoofPlaneQuadLive;
            if (rpEditPtr.kind === "edge" && rpEditPtr.edgeIndex != null && rpEditPtr.nOut) {
              const n = rpEditPtr.nOut;
              const ax = p.x - rpEditPtr.anchorWorldMm.x;
              const ay = p.y - rpEditPtr.anchorWorldMm.y;
              const deltaMm = ax * n.x + ay * n.y;
              const d = clampRoofQuadEdgeDeltaMm(rpEditPtr.baseQuad, rpEditPtr.edgeIndex, deltaMm);
              const moved = tryMoveRoofQuadEdgeMm(rpEditPtr.baseQuad, rpEditPtr.edgeIndex, d);
              if (moved.ok) {
                applyLive(rpEditPtr.planeId, moved.quad, { skipHistory: true });
              }
              rpEditPtr.lastWorldMm = { x: p.x, y: p.y };
            } else if (rpEditPtr.kind === "corner" && rpEditPtr.cornerIndex != null) {
              const qNew = clampRoofQuadCornerTargetMm(rpEditPtr.baseQuad, rpEditPtr.cornerIndex, snapRp.point);
              applyLive(rpEditPtr.planeId, qNew, { skipHistory: true });
              rpEditPtr.lastWorldMm = { x: snapRp.point.x, y: snapRp.point.y };
            }
          } else {
            if (rpEditPtr.kind === "edge") {
              rpEditPtr.lastWorldMm = { x: p.x, y: p.y };
            } else {
              const projRp0 = useAppStore.getState().currentProject;
              const e2Rp0 = projRp0.settings.editor2d;
              const snapRp0 = resolveSnap2d({
                rawWorldMm: p,
                viewport: t,
                project: projRp0,
                snapSettings: {
                  snapToVertex: e2Rp0.snapToVertex,
                  snapToEdge: e2Rp0.snapToEdge,
                  snapToGrid: e2Rp0.snapToGrid,
                },
                gridStepMm: projRp0.settings.gridStepMm,
              });
              rpEditPtr.lastWorldMm = { x: snapRp0.point.x, y: snapRp0.point.y };
            }
          }
        }

        if (coordBlock) {
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        } else {
          const stHoverRoof = useAppStore.getState();
          const selOneRoof = stHoverRoof.selectedEntityIds.length === 1 ? stHoverRoof.selectedEntityIds[0]! : null;
          const srMis = roofPlaneEditSelectedRef.current;
          if (srMis && (selOneRoof == null || srMis.planeId !== selOneRoof)) {
            roofPlaneEditSelectedRef.current = null;
          }
          let nextRoofHover: {
            readonly planeId: string;
            readonly kind: "edge" | "corner";
            readonly edgeIndex?: number;
            readonly cornerIndex?: number;
            readonly nOut?: Point2D;
          } | null = null;
          const prevRoofHover = roofPlaneEditHoverRef.current;
          if (
            stHoverRoof.activeTool === "select" &&
            stHoverRoof.currentProject.viewState.editor2dPlanScope === "roof" &&
            !stHoverRoof.roofContourJoinSession &&
            !roofPlaneEditPointerRef.current &&
            stHoverRoof.selectedEntityIds.length === 1
          ) {
            const ridH = stHoverRoof.selectedEntityIds[0]!;
            const lvH = narrowProjectToActiveLayer(stHoverRoof.currentProject);
            const rpH = lvH.roofPlanes.find((r) => r.id === ridH);
            const quadH = rpH ? roofPlaneQuad4OrNull(rpH) : null;
            if (quadH) {
              const stickyHv: RoofPlaneEditScreenSticky =
                prevRoofHover != null && prevRoofHover.planeId === ridH
                  ? {
                      kind: prevRoofHover.kind,
                      edgeIndex: prevRoofHover.edgeIndex,
                      cornerIndex: prevRoofHover.cornerIndex,
                    }
                  : null;
              const hitHv = pickRoofPlaneEditHandleScreen(ev.global.x, ev.global.y, quadH, t, stickyHv);
              if (hitHv) {
                nextRoofHover = {
                  planeId: ridH,
                  kind: hitHv.kind,
                  edgeIndex: hitHv.kind === "edge" ? hitHv.edgeIndex : undefined,
                  cornerIndex: hitHv.kind === "corner" ? hitHv.cornerIndex : undefined,
                  nOut: hitHv.kind === "edge" ? hitHv.nOut : undefined,
                };
              }
            }
          }
          const nOutSame = (() => {
            const pa = prevRoofHover?.nOut;
            const na = nextRoofHover?.nOut;
            if (pa == null && na == null) {
              return true;
            }
            if (pa == null || na == null) {
              return false;
            }
            return pa.x === na.x && pa.y === na.y;
          })();
          const hoverSame =
            (prevRoofHover == null && nextRoofHover == null) ||
            (prevRoofHover != null &&
              nextRoofHover != null &&
              prevRoofHover.planeId === nextRoofHover.planeId &&
              prevRoofHover.kind === nextRoofHover.kind &&
              prevRoofHover.edgeIndex === nextRoofHover.edgeIndex &&
              prevRoofHover.cornerIndex === nextRoofHover.cornerIndex &&
              nOutSame);
          roofPlaneEditHoverRef.current = nextRoofHover;
          if (!hoverSame) {
            paint();
          }

          const rect = canvas.getBoundingClientRect();
          const viewportW = typeof window !== "undefined" ? window.innerWidth : 1280;
          const viewportH = typeof window !== "undefined" ? window.innerHeight : 720;
          if (useAppStore.getState().openingMoveModeActive) {
            const hit = moveDimHitsRef.current.find(
              (h0) =>
                ev.global.x >= h0.x &&
                ev.global.x <= h0.x + h0.w &&
                ev.global.y >= h0.y &&
                ev.global.y <= h0.y + h0.h,
            );
            canvas.style.cursor = hit ? "pointer" : "";
          } else if (!panning.active && activeTool !== "ruler" && activeTool !== "line" && activeTool !== "changeLength") {
            const stCur = useAppStore.getState();
            let curRoof = "";
            if (
              activeTool === "select" &&
              stCur.currentProject.viewState.editor2dPlanScope === "roof" &&
              !stCur.roofContourJoinSession &&
              !roofPlaneEditPointerRef.current &&
              nextRoofHover
            ) {
              if (nextRoofHover.kind === "corner") {
                curRoof = "nwse-resize";
              } else if (nextRoofHover.nOut) {
                const nx = nextRoofHover.nOut.x;
                const ny = nextRoofHover.nOut.y;
                curRoof = Math.abs(nx) >= Math.abs(ny) ? "ew-resize" : "ns-resize";
              } else {
                curRoof = "ns-resize";
              }
            }
            canvas.style.cursor = curRoof;
          }
          const pendWinMv = useAppStore.getState().pendingWindowPlacement;
          const pendDoorMv = useAppStore.getState().pendingDoorPlacement;
          if (pendWinMv || pendDoorMv) {
            windowPlacementHoverRef.current = null;
            const layerView = narrowProjectToActiveLayer(currentProject);
            const walls = layerView.walls;
            const tol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
            const openingId = pendWinMv?.openingId ?? pendDoorMv!.openingId;
            const op = currentProject.openings.find((o) => o.id === openingId);
            const layWin = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            if (
              pendDoorMv?.phase === "chooseSwing" &&
              pendDoorMv.wallId != null &&
              pendDoorMv.leftAlongMm != null
            ) {
              useAppStore.getState().updatePendingDoorSwingAtWorld(p);
              setWallHintRef.current({
                left: layWin.instruction.left,
                top: layWin.instruction.top,
                lines: hintLines("Установка двери", [
                  { text: "Направление открывания — положение курсора относительно стены" },
                  { text: "ЛКМ — зафиксировать · Esc / ПКМ — отмена", variant: "muted" },
                ]),
              });
            } else if (op) {
              const hit = pickClosestWallAlongPoint(p, walls, tol);
              if (hit) {
                const wall = currentProject.walls.find((w) => w.id === hit.wallId);
                if (wall) {
                  const rawLeft = offsetFromStartForCursorCentered(hit.alongMm, op.widthMm);
                  const left = clampPlacedOpeningLeftEdgeMm(
                    wall,
                    op.widthMm,
                    rawLeft,
                    currentProject,
                    op.kind === "door" ? "door" : "window",
                  );
                  const v = validateWindowPlacementOnWall(wall, left, op.widthMm, currentProject, op.id, {
                    openingKind: op.kind === "door" ? "door" : "window",
                  });
                  windowPlacementHoverRef.current = {
                    wallId: wall.id,
                    leftAlongMm: left,
                    openingWidthMm: op.widthMm,
                    valid: v.ok,
                  };
                  const hintExtra =
                    v.ok
                      ? op.kind === "door"
                        ? "ЛКМ — точка на стене, затем направление вторым кликом · Esc / ПКМ — отмена"
                        : "ЛКМ — установить · Esc / ПКМ — отмена"
                      : v.reason;
                  setWallHintRef.current({
                    left: layWin.instruction.left,
                    top: layWin.instruction.top,
                    lines: hintLines(op.kind === "door" ? "Установка двери" : "Установка окна", [
                      { text: hintExtra, variant: v.ok ? "secondary" : "secondary" },
                    ]),
                  });
                }
              } else {
                setWallHintRef.current({
                  left: layWin.instruction.left,
                  top: layWin.instruction.top,
                  lines: hintLines("Установка проёма", [
                    { text: "Наведите курсор на стену активного слоя" },
                  ]),
                });
              }
            }
            setCoordHudRef.current(null);
            paint();
          } else if (useAppStore.getState().foundationPileMoveCopySession) {
            const fpM0 = useAppStore.getState().foundationPileMoveCopySession;
            const titleP = fpM0?.mode === "copy" ? "Копирование сваи" : "Перенос сваи";
            if (fpM0?.phase === "pickTarget") {
              useAppStore.getState().foundationPileMoveCopyPreviewMove(p, t);
              const fpM2 = useAppStore.getState().foundationPileMoveCopySession;
              let snapP: string | null = null;
              if (fpM2?.lastSnapKind && fpM2.lastSnapKind !== "none") {
                snapP =
                  fpM2.lastSnapKind === "vertex"
                    ? "Привязка: угол / узел"
                    : fpM2.lastSnapKind === "edge"
                      ? "Привязка: кромка"
                      : "Привязка: сетка";
              }
              const layPileMv = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                showCoordHud: true,
              });
              setWallHintRef.current({
                left: layPileMv.instruction.left,
                top: layPileMv.instruction.top,
                snapLabel: snapP,
                lines: hintLines(titleP, [
                  { text: "Укажите новое положение" },
                  { text: "ЛКМ — зафиксировать · ПКМ / Esc — отмена", variant: "muted" },
                ]),
              });
              const pileRef = currentProject.foundationPiles.find((p0) => p0.id === fpM2?.workingPileId);
              if (fpM2?.previewCenterMm && pileRef && layPileMv.liveHud) {
                const dx = fpM2.previewCenterMm.x - pileRef.centerX;
                const dy = fpM2.previewCenterMm.y - pileRef.centerY;
                const d = Math.hypot(dx, dy);
                setCoordHudRef.current({
                  left: layPileMv.liveHud.left,
                  top: layPileMv.liveHud.top,
                  dx,
                  dy,
                  d,
                  angleDeg: undefined,
                  angleSnapLockedDeg: null,
                  secondLine: null,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else {
              const layPb = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: layPb.instruction.left,
                top: layPb.instruction.top,
                lines: hintLines(titleP, [
                  { text: "Выберите базовую точку сваи (центр или угол) · ЛКМ" },
                  { text: "ПКМ / Esc — отмена", variant: "muted" },
                ]),
              });
              setCoordHudRef.current(null);
            }
            paint();
          } else if (useAppStore.getState().floorBeamMoveCopySession) {
            const altKeyFbMv = Boolean((ev as { altKey?: boolean }).altKey);
            const fbM0 = useAppStore.getState().floorBeamMoveCopySession;
            const moveFbCoordOpen = useAppStore.getState().floorBeamMoveCopyCoordinateModalOpen;
            const titleFb = "Перенос балки";
            const modeLabelFbMv = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
            if (fbM0?.phase === "pickTarget" || fbM0?.phase === "pickBase") {
              if (!coordHudInlineActiveRef.current || fbM0?.phase === "pickBase") {
                useAppStore.getState().floorBeamMoveCopyPreviewMove(p, t, { altKey: altKeyFbMv });
              }
            }
            const fbM2 = useAppStore.getState().floorBeamMoveCopySession;
            if (fbM2?.phase === "pickTarget" && fbM2.baseAnchorWorldMm) {
              let snapFb: string | null = null;
              if (fbM2?.lastSnapKind && fbM2.lastSnapKind !== "none") {
                snapFb =
                  fbM2.lastSnapKind === "vertex"
                    ? "Привязка: угол / узел"
                    : fbM2.lastSnapKind === "edge"
                      ? "Привязка: кромка / ребро"
                      : "Привязка: сетка";
              }
              const layFbMv = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                floorBeamMoveCopyCoordinateModalOpen: moveFbCoordOpen,
                showCoordHud: !moveFbCoordOpen,
              });
              const shiftFbMv =
                fbM2?.shiftDirectionLockUnit != null
                  ? fbM2.shiftLockReferenceMm
                    ? "Угол по Shift · длина по опорной точке"
                    : "Угол зафиксирован (Shift)"
                  : "Shift — зафиксировать направление";
              setWallHintRef.current({
                left: layFbMv.instruction.left,
                top: layFbMv.instruction.top,
                snapLabel: snapFb,
                lines: hintLines(titleFb, [
                  { text: "Укажите новое положение · Пробел — координаты · X / Y — ввод по оси" },
                  { text: modeLabelFbMv },
                  { text: "Alt — без угловой привязки", variant: "muted" },
                  { text: shiftFbMv, variant: "muted" },
                  { text: "ЛКМ — зафиксировать · ПКМ / Esc — отмена", variant: "muted" },
                ]),
              });
              const beamRef = currentProject.floorBeams.find((b) => b.id === fbM2?.workingBeamId);
              if (fbM2?.baseAnchorWorldMm && fbM2.dragDeltaMm != null && beamRef && layFbMv.liveHud) {
                const dx = fbM2.dragDeltaMm.x;
                const dy = fbM2.dragDeltaMm.y;
                const d = Math.hypot(dx, dy);
                const relFbMv = computeAnchorRelativeHud(
                  fbM2.baseAnchorWorldMm.x,
                  fbM2.baseAnchorWorldMm.y,
                  fbM2.baseAnchorWorldMm.x + dx,
                  fbM2.baseAnchorWorldMm.y + dy,
                );
                const lockedFbMv = fbM2.angleSnapLockedDeg ?? null;
                const sUFbMv = fbM2.shiftDirectionLockUnit;
                const angFbMv =
                  sUFbMv != null
                    ? normalizeAngleDeg360((Math.atan2(sUFbMv.y, sUFbMv.x) * 180) / Math.PI)
                    : null;
                setCoordHudRef.current({
                  left: layFbMv.liveHud.left,
                  top: layFbMv.liveHud.top,
                  dx,
                  dy,
                  d,
                  angleDeg: angFbMv != null ? angFbMv : lockedFbMv != null ? lockedFbMv : relFbMv.angleDeg,
                  angleSnapLockedDeg: lockedFbMv,
                  secondLine: relFbMv.axisHint,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else {
              const layFbb = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                showCoordHud: false,
              });
              let snapFbBase: string | null = null;
              if (fbM2?.pickBaseHoverSnapKind && fbM2.pickBaseHoverSnapKind !== "none") {
                snapFbBase =
                  fbM2.pickBaseHoverSnapKind === "vertex"
                    ? "Привязка: угол / узел"
                    : fbM2.pickBaseHoverSnapKind === "edge"
                      ? "Привязка: середина ребра"
                      : "Привязка: сетка";
              }
              setWallHintRef.current({
                left: layFbb.instruction.left,
                top: layFbb.instruction.top,
                snapLabel: snapFbBase,
                lines: hintLines(titleFb, [
                  { text: "Выберите опорную точку (угол, центр, ось, кромка) · ЛКМ" },
                  { text: modeLabelFbMv },
                  { text: "ПКМ / Esc — отмена", variant: "muted" },
                ]),
              });
              setCoordHudRef.current(null);
            }
            paint();
          } else if (useAppStore.getState().wallMoveCopySession) {
            const stMc = useAppStore.getState();
            const wm = stMc.wallMoveCopySession;
            const moveCopyCoordOpen = stMc.wallMoveCopyCoordinateModalOpen;
            const modeLabel = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
            const title = wm?.mode === "copy" ? "Копирование стены" : "Перенос стены";
            if (wm?.phase === "pickTarget" && wm.anchorWorldMm) {
              const altKey = Boolean((ev as { altKey?: boolean }).altKey);
              if (!coordHudInlineActiveRef.current) {
                useAppStore.getState().wallMoveCopyPreviewMove(p, t, { altKey });
              }
              const ws = useAppStore.getState().wallMoveCopySession;
              let snapLine: string | null = null;
              if (ws?.lastSnapKind && ws.lastSnapKind !== "none") {
                snapLine =
                  ws.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : ws.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const coordModalAny = wallCoordinateModalOpen || moveCopyCoordOpen;
              const layMc = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen,
                wallMoveCopyCoordinateModalOpen: moveCopyCoordOpen,
                showCoordHud: !coordModalAny,
              });
              const shiftMc =
                ws?.shiftDirectionLockUnit != null
                  ? ws.shiftLockReferenceMm
                    ? "Угол по Shift · длина по опорной точке"
                    : "Угол зафиксирован (Shift)"
                  : "Shift — зафиксировать направление";
              setWallHintRef.current({
                left: layMc.instruction.left,
                top: layMc.instruction.top,
                snapLabel: snapLine,
                lines: hintLines(title, [
                  { text: "Укажите новое положение (ЛКМ) · Пробел — координаты · X / Y — ввод по оси" },
                  { text: modeLabel },
                  { text: "Alt — без угловой привязки", variant: "muted" },
                  { text: shiftMc, variant: "muted" },
                ]),
              });
              if (ws?.anchorWorldMm && ws.previewTargetMm && layMc.liveHud) {
                const dx = ws.previewTargetMm.x - ws.anchorWorldMm.x;
                const dy = ws.previewTargetMm.y - ws.anchorWorldMm.y;
                const d = Math.hypot(dx, dy);
                const rel2 = computeAnchorRelativeHud(
                  ws.anchorWorldMm.x,
                  ws.anchorWorldMm.y,
                  ws.previewTargetMm.x,
                  ws.previewTargetMm.y,
                );
                const locked = ws.angleSnapLockedDeg ?? null;
                const sU = ws.shiftDirectionLockUnit;
                const angS =
                  sU != null
                    ? normalizeAngleDeg360((Math.atan2(sU.y, sU.x) * 180) / Math.PI)
                    : null;
                setCoordHudRef.current({
                  left: layMc.liveHud.left,
                  top: layMc.liveHud.top,
                  dx,
                  dy,
                  d,
                  angleDeg: angS != null ? angS : locked != null ? locked : rel2.angleDeg,
                  angleSnapLockedDeg: locked,
                  secondLine: rel2.axisHint,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else {
              const layMcB = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen,
                wallMoveCopyCoordinateModalOpen: moveCopyCoordOpen,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: layMcB.instruction.left,
                top: layMcB.instruction.top,
                lines: hintLines(title, [
                  { text: "Выберите точку привязки на стене (ЛКМ)" },
                  { text: modeLabel },
                ]),
              });
              setCoordHudRef.current(null);
            }
            paint();
          } else if (useAppStore.getState().entityCopySession) {
            const stEcMv = useAppStore.getState();
            const ec0 = stEcMv.entityCopySession;
            const ecCoordOpenMv = stEcMv.entityCopyCoordinateModalOpen;
            const modeLabelEc = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
            const titleEc = "Копирование";
            const altKeyEc = Boolean((ev as { altKey?: boolean }).altKey);
            if (ec0 && (!coordHudInlineActiveRef.current || ec0.phase !== "pickTarget")) {
              useAppStore.getState().entityCopyPreviewMove(p, t, { altKey: altKeyEc });
            }
            const ec2 = useAppStore.getState().entityCopySession;
            if (ec2?.phase === "pickTarget" && ec2.worldAnchorStart) {
              let snapEc: string | null = null;
              if (ec2?.lastSnapKind && ec2.lastSnapKind !== "none") {
                snapEc =
                  ec2.lastSnapKind === "vertex"
                    ? "Привязка: угол / узел"
                    : ec2.lastSnapKind === "edge"
                      ? "Привязка: середина ребра"
                      : "Привязка: сетка";
              }
              const layEc = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                entityCopyCoordinateModalOpen: ecCoordOpenMv,
                showCoordHud: !ecCoordOpenMv,
              });
              const shiftEc =
                ec2?.shiftDirectionLockUnit != null
                  ? ec2.shiftLockReferenceMm
                    ? "Угол по Shift · длина по опорной точке"
                    : "Угол зафиксирован (Shift)"
                  : "Shift — зафиксировать направление";
              setWallHintRef.current({
                left: layEc.instruction.left,
                top: layEc.instruction.top,
                snapLabel: snapEc,
                lines: hintLines(titleEc, [
                  { text: "Укажите точку вставки · Пробел — координаты · X / Y — по оси · D — окно координат" },
                  { text: "ЛКМ — вставить (затем параметры копий)" },
                  { text: modeLabelEc },
                  { text: "Alt — без привязки", variant: "muted" },
                  { text: shiftEc, variant: "muted" },
                  { text: "Esc / ПКМ — отмена", variant: "muted" },
                ]),
              });
              if (ec2?.worldAnchorStart && ec2.previewTargetWorldMm && layEc.liveHud) {
                const dxEc = ec2.previewTargetWorldMm.x - ec2.worldAnchorStart.x;
                const dyEc = ec2.previewTargetWorldMm.y - ec2.worldAnchorStart.y;
                const dEc = Math.hypot(dxEc, dyEc);
                const relEc = computeAnchorRelativeHud(
                  ec2.worldAnchorStart.x,
                  ec2.worldAnchorStart.y,
                  ec2.previewTargetWorldMm.x,
                  ec2.previewTargetWorldMm.y,
                );
                const lockedEc = ec2.angleSnapLockedDeg ?? null;
                const sUEc = ec2.shiftDirectionLockUnit;
                const angEc =
                  sUEc != null
                    ? normalizeAngleDeg360((Math.atan2(sUEc.y, sUEc.x) * 180) / Math.PI)
                    : null;
                setCoordHudRef.current({
                  left: layEc.liveHud.left,
                  top: layEc.liveHud.top,
                  dx: dxEc,
                  dy: dyEc,
                  d: dEc,
                  angleDeg: angEc != null ? angEc : lockedEc != null ? lockedEc : relEc.angleDeg,
                  angleSnapLockedDeg: lockedEc,
                  secondLine: relEc.axisHint,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else {
              const layEcB = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                entityCopyCoordinateModalOpen: ecCoordOpenMv,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: layEcB.instruction.left,
                top: layEcB.instruction.top,
                lines: hintLines(titleEc, [
                  { text: "Выберите точку привязки на объекте" },
                  { text: "ЛКМ — выбрать" },
                  { text: modeLabelEc },
                  { text: "Alt — без привязки", variant: "muted" },
                  { text: "Esc / ПКМ — отмена", variant: "muted" },
                ]),
              });
              setCoordHudRef.current(null);
            }
            paint();
          } else if (activeTool === "changeLength") {
            const storeLc = useAppStore.getState();
            const lenSess = storeLc.lengthChange2dSession;
            const lenModal = storeLc.lengthChangeCoordinateModalOpen;
            const layerLc = narrowProjectToActiveLayer(currentProject);
            const endTol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
            if (lenSess && !lenModal) {
              const altLen = Boolean((ev as { altKey?: boolean }).altKey);
              useAppStore.getState().lengthChange2dPreviewMove(p, t, { altKey: altLen });
              const s2 = useAppStore.getState().lengthChange2dSession!;
              const dx = s2.previewMovingMm.x - s2.fixedEndMm.x;
              const dy = s2.previewMovingMm.y - s2.fixedEndMm.y;
              const Lnow = dx * s2.axisUx + dy * s2.axisUy;
              const dMm = Math.round(Lnow - s2.initialLengthMm);
              const Lround = Math.round(Lnow);
              let snapLine: string | null = null;
              if (s2.lastSnapKind && s2.lastSnapKind !== "none") {
                snapLine =
                  s2.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : s2.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const errText = useAppStore.getState().lastError;
              const shiftLines: { text: string; variant: "muted" }[] = [];
              if (s2.shiftDirectionLockUnit) {
                shiftLines.push({
                  text: s2.shiftLockReferenceMm
                    ? "Shift: длина по опорной точке (проекция на ось)"
                    : "Направление зафиксировано (Shift)",
                  variant: "muted",
                });
                shiftLines.push({ text: "Alt — временно без усиленной привязки", variant: "muted" });
              } else {
                shiftLines.push({ text: "Shift — зафиксировать ось и дотянуть по привязке", variant: "muted" });
              }
              const layLc = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                lengthChangeCoordinateModalOpen: lenModal,
                showCoordHud: true,
              });
              setWallHintRef.current({
                left: layLc.instruction.left,
                top: layLc.instruction.top,
                snapLabel: snapLine,
                lines: hintLines("Изменение длины", [
                  { text: "ЛКМ — применить · Esc — отмена · Пробел — Δ (мм)" },
                  ...(errText ? [{ text: errText, variant: "muted" as const }] : []),
                  ...shiftLines,
                ]),
              });
              if (layLc.liveHud) {
                setCoordHudRef.current({
                  left: layLc.liveHud.left,
                  top: layLc.liveHud.top,
                  dx,
                  dy,
                  d: Math.round(Math.hypot(dx, dy)),
                  secondLine: `Δ ${dMm >= 0 ? "+" : ""}${dMm} мм · L ${Lround} мм`,
                });
              } else {
                setCoordHudRef.current(null);
              }
              lengthChangeHoverRef.current = null;
            } else if (!lenModal) {
              const layLcPick = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                lengthChangeCoordinateModalOpen: lenModal,
                showCoordHud: false,
              });
              const hitEnd = pickNearestLinearProfileLengthEnd(
                p,
                currentProject,
                layerLc.walls,
                layerLc.floorBeams,
                endTol,
              );
              lengthChangeHoverRef.current = hitEnd
                ? {
                    target:
                      hitEnd.kind === "wall"
                        ? { kind: "wall", wallId: hitEnd.id }
                        : { kind: "floorBeam", beamId: hitEnd.id },
                    end: hitEnd.end,
                    hoverPointMm: hitEnd.pointMm,
                  }
                : null;
              setWallHintRef.current({
                left: layLcPick.instruction.left,
                top: layLcPick.instruction.top,
                lines: hintLines("Выберите сторону", []),
              });
              setCoordHudRef.current(null);
            } else {
              setWallHintRef.current(null);
              setCoordHudRef.current(null);
            }
            paint();
          } else if (activeTool === "ruler" && ruler2dSession) {
            const rs = ruler2dSession;
            const layRm = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: rs.phase === "stretching" && rs.firstMm != null,
            });
            if (rs.phase === "stretching" && rs.firstMm) {
              const altKey = Boolean((ev as { altKey?: boolean }).altKey);
              useAppStore.getState().ruler2dPreviewMove(p, t, { altKey });
              const rs2 = useAppStore.getState().ruler2dSession;
              const end = rs2?.previewEndMm;
              const first = rs2?.firstMm;
              if (end && first) {
                const dx = end.x - first.x;
                const dy = end.y - first.y;
                const d = Math.hypot(dx, dy);
                const relR = computeAnchorRelativeHud(first.x, first.y, end.x, end.y);
                const lockedR = rs2?.angleSnapLockedDeg ?? null;
                const shiftUR = rs2?.shiftDirectionLockUnit;
                const angleShiftDegR =
                  shiftUR != null
                    ? normalizeAngleDeg360((Math.atan2(shiftUR.y, shiftUR.x) * 180) / Math.PI)
                    : null;
                const sh =
                  rs2?.shiftDirectionLockUnit != null
                    ? rs2.shiftLockReferenceMm
                      ? "Угол по Shift · длина по опорной точке"
                      : "Угол зафиксирован (Shift)"
                    : "Shift — зафиксировать направление";
                setWallHintRef.current({
                  left: layRm.instruction.left,
                  top: layRm.instruction.top,
                  lines: hintLines("Линейка", [
                    { text: sh, variant: "muted" },
                    { text: "Alt — без угловой привязки", variant: "muted" },
                  ]),
                });
                if (layRm.liveHud) {
                  setCoordHudRef.current({
                    left: layRm.liveHud.left,
                    top: layRm.liveHud.top,
                    dx,
                    dy,
                    d,
                    angleDeg: angleShiftDegR != null ? angleShiftDegR : lockedR != null ? lockedR : relR.angleDeg,
                    angleSnapLockedDeg: lockedR,
                    secondLine: relR.axisHint,
                  });
                } else {
                  setCoordHudRef.current(null);
                }
              }
            } else if (rs.phase === "pickFirst") {
              setWallHintRef.current({
                left: layRm.instruction.left,
                top: layRm.instruction.top,
                lines: hintLines("Линейка", [{ text: "Выберите первую точку" }]),
              });
              setCoordHudRef.current(null);
            } else if (rs.phase === "done" && rs.firstMm && rs.secondMm) {
              const dx = Math.round(rs.secondMm.x - rs.firstMm.x);
              const dy = Math.round(rs.secondMm.y - rs.firstMm.y);
              const d = Math.round(Math.hypot(dx, dy));
              setWallHintRef.current({
                left: layRm.instruction.left,
                top: layRm.instruction.top,
                lines: hintLines("Линейка", [
                  { text: `X = ${dx} · Y = ${dy} · D = ${d}` },
                  { text: "ЛКМ — новый замер · Esc — сброс", variant: "muted" },
                ]),
              });
              setCoordHudRef.current(null);
            }
            paint();
          } else if (activeTool === "line" && line2dSession) {
            const ls = line2dSession;
            const layLn = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: ls.phase === "stretching" && ls.firstMm != null,
            });
            if (ls.phase === "stretching" && ls.firstMm) {
              const altKeyLn = Boolean((ev as { altKey?: boolean }).altKey);
              useAppStore.getState().line2dPreviewMove(p, t, { altKey: altKeyLn });
              const ls2 = useAppStore.getState().line2dSession;
              const endLn = ls2?.previewEndMm;
              const firstLn = ls2?.firstMm;
              if (endLn && firstLn) {
                const dx = endLn.x - firstLn.x;
                const dy = endLn.y - firstLn.y;
                const d = Math.hypot(dx, dy);
                let snapLineLn: string | null = null;
                if (ls2?.lastSnapKind && ls2.lastSnapKind !== "none") {
                  snapLineLn =
                    ls2.lastSnapKind === "vertex"
                      ? "Привязка: угол"
                      : ls2.lastSnapKind === "edge"
                        ? "Привязка: линия"
                        : "Привязка: сетка";
                }
                const shLn =
                  ls2?.shiftDirectionLockUnit != null
                    ? ls2.shiftLockReferenceMm
                      ? "Shift: проекция на зафиксированное направление"
                      : "Направление зафиксировано (Shift)"
                    : "Shift — зафиксировать направление";
                const errLn = useAppStore.getState().lastError;
                const relLn = computeAnchorRelativeHud(firstLn.x, firstLn.y, endLn.x, endLn.y);
                const lockedLn = ls2?.angleSnapLockedDeg ?? null;
                const shiftULn = ls2?.shiftDirectionLockUnit;
                const angleShiftDegLn =
                  shiftULn != null
                    ? normalizeAngleDeg360((Math.atan2(shiftULn.y, shiftULn.x) * 180) / Math.PI)
                    : null;
                setWallHintRef.current({
                  left: layLn.instruction.left,
                  top: layLn.instruction.top,
                  snapLabel: snapLineLn,
                  lines: hintLines("Линия", [
                    { text: "ЛКМ — зафиксировать конец · Esc — отмена" },
                    ...(errLn ? [{ text: errLn, variant: "muted" as const }] : []),
                    { text: "Alt — без угловой привязки", variant: "muted" },
                    { text: shLn, variant: "muted" },
                  ]),
                });
                if (layLn.liveHud) {
                  setCoordHudRef.current({
                    left: layLn.liveHud.left,
                    top: layLn.liveHud.top,
                    dx,
                    dy,
                    d,
                    angleDeg: angleShiftDegLn != null ? angleShiftDegLn : lockedLn != null ? lockedLn : relLn.angleDeg,
                    angleSnapLockedDeg: lockedLn,
                    secondLine: relLn.axisHint,
                  });
                } else {
                  setCoordHudRef.current(null);
                }
              }
            } else if (ls.phase === "pickFirst") {
              setWallHintRef.current({
                left: layLn.instruction.left,
                top: layLn.instruction.top,
                lines: hintLines("Линия", [{ text: "Первая точка — ЛКМ" }]),
              });
              setCoordHudRef.current(null);
            }
            paint();
          } else if (wallPlacementSession) {
            const stWall = useAppStore.getState();
            const wallAnchorCoordOpen = stWall.wallAnchorCoordinateModalOpen;
            const coordModalAny = wallCoordinateModalOpen || wallAnchorCoordOpen;
            const modeLabel = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
            const anchorOn = stWall.wallAnchorPlacementModeActive;
            const anchorMm = stWall.wallPlacementAnchorMm;
            const firstPh =
              wallPlacementSession.phase === "waitingFirstWallPoint" ||
              wallPlacementSession.phase === "waitingOriginAndFirst";
  
            if (wallPlacementSession.phase === "waitingSecondPoint") {
              const altKey = Boolean((ev as { altKey?: boolean }).altKey);
              useAppStore.getState().wallPlacementPreviewMove(p, t, { altKey });
              const ws = useAppStore.getState().wallPlacementSession;
              let snapLine: string | null = null;
              if (ws?.lastSnapKind && ws.lastSnapKind !== "none") {
                snapLine =
                  ws.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : ws.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const layWall = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen,
                wallAnchorCoordinateModalOpen: wallAnchorCoordOpen,
                showCoordHud: !coordModalAny,
              });
              const shiftHint = ws?.shiftDirectionLockUnit
                ? ws.shiftLockReferenceMm
                  ? "Угол по Shift · длина по опорной точке (проекция)"
                  : "Угол зафиксирован (Shift) — отпустите для свободного режима"
                : "Shift — зафиксировать направление";
              setWallHintRef.current({
                left: layWall.instruction.left,
                top: layWall.instruction.top,
                snapLabel: snapLine,
                lines: hintLines(wallPlacementHintMessage(wallPlacementSession.phase), [
                  { text: modeLabel },
                  { text: "Alt — без угловой привязки", variant: "muted" },
                  { text: shiftHint, variant: "muted" },
                ]),
              });
              if (ws?.firstPointMm && ws.previewEndMm && layWall.liveHud) {
                const dx = ws.previewEndMm.x - ws.firstPointMm.x;
                const dy = ws.previewEndMm.y - ws.firstPointMm.y;
                const d = Math.hypot(dx, dy);
                const rel2 = computeAnchorRelativeHud(
                  ws.firstPointMm.x,
                  ws.firstPointMm.y,
                  ws.previewEndMm.x,
                  ws.previewEndMm.y,
                );
                const locked = ws.angleSnapLockedDeg ?? null;
                const shiftU = ws.shiftDirectionLockUnit;
                const angleShiftDeg =
                  shiftU != null
                    ? normalizeAngleDeg360((Math.atan2(shiftU.y, shiftU.x) * 180) / Math.PI)
                    : null;
                setCoordHudRef.current({
                  left: layWall.liveHud.left,
                  top: layWall.liveHud.top,
                  dx,
                  dy,
                  d,
                  angleDeg: angleShiftDeg != null ? angleShiftDeg : locked != null ? locked : rel2.angleDeg,
                  angleSnapLockedDeg: locked,
                  secondLine: rel2.axisHint,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else if (anchorOn && firstPh) {
              if (anchorMm && !wallAnchorCoordOpen) {
                useAppStore.getState().wallPlacementAnchorPreviewMove(p, t, {
                  altKey: Boolean((ev as { altKey?: boolean }).altKey),
                });
              } else if (!anchorMm && !wallAnchorCoordOpen) {
                useAppStore.getState().wallPlacementFirstPointHoverMove(p, t);
              }
              const stA = useAppStore.getState();
              const am = stA.wallPlacementAnchorMm;
              const ap = stA.wallPlacementAnchorPreviewEndMm;
              const layA = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen,
                wallAnchorCoordinateModalOpen: wallAnchorCoordOpen,
                showCoordHud: !coordModalAny && Boolean(am && ap),
              });
              const snapA =
                stA.wallPlacementAnchorLastSnapKind && stA.wallPlacementAnchorLastSnapKind !== "none"
                  ? stA.wallPlacementAnchorLastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : stA.wallPlacementAnchorLastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка"
                  : "";
              const snapPickAnchor =
                !am &&
                stA.wallPlacementSession?.lastSnapKind &&
                stA.wallPlacementSession.lastSnapKind !== "none"
                  ? stA.wallPlacementSession.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : stA.wallPlacementSession.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка"
                  : "";
              const hintTitle = am
                ? "Укажите начало стены (ЛКМ) или Пробел — координаты"
                : "Выберите первую точку";
              const snapLineAnchor = snapA || snapPickAnchor;
              setWallHintRef.current({
                left: layA.instruction.left,
                top: layA.instruction.top,
                snapLabel: snapLineAnchor || null,
                lines: hintLines("Точка привязки", [
                  { text: hintTitle },
                  { text: modeLabel },
                  ...(am ? [{ text: "Alt — без угловой привязки", variant: "muted" as const }] : []),
                ]),
              });
              if (am && ap && layA.liveHud) {
                const rel = computeAnchorRelativeHud(am.x, am.y, ap.x, ap.y);
                const lockedA = stA.wallPlacementAnchorAngleSnapLockedDeg ?? null;
                setCoordHudRef.current({
                  left: layA.liveHud.left,
                  top: layA.liveHud.top,
                  dx: rel.dx,
                  dy: rel.dy,
                  d: rel.d,
                  angleDeg: lockedA != null ? lockedA : rel.angleDeg,
                  angleSnapLockedDeg: lockedA,
                  secondLine: rel.axisHint,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else {
              if (firstPh && !wallAnchorCoordOpen) {
                useAppStore.getState().wallPlacementFirstPointHoverMove(p, t);
              }
              const wsHover = useAppStore.getState().wallPlacementSession;
              let snapLineFirst = "";
              if (wsHover?.lastSnapKind && wsHover.lastSnapKind !== "none") {
                snapLineFirst =
                  wsHover.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : wsHover.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const layWall0 = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen,
                wallAnchorCoordinateModalOpen: wallAnchorCoordOpen,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: layWall0.instruction.left,
                top: layWall0.instruction.top,
                snapLabel: snapLineFirst || null,
                lines: hintLines(wallPlacementHintMessage(wallPlacementSession.phase), [{ text: modeLabel }]),
              });
              setCoordHudRef.current(null);
            }
          } else if (floorBeamPlacementSession) {
            const modeLabelFb = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
            if (floorBeamPlacementSession.phase === "waitingSecondPoint") {
              const altKeyFb = Boolean((ev as { altKey?: boolean }).altKey);
              if (!coordHudInlineActiveRef.current) {
                useAppStore.getState().floorBeamPlacementPreviewMove(p, t, { altKey: altKeyFb });
              }
              const fbsM = useAppStore.getState().floorBeamPlacementSession;
              let snapLineFb: string | null = null;
              if (fbsM?.lastSnapKind && fbsM.lastSnapKind !== "none") {
                snapLineFb =
                  fbsM.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : fbsM.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const layFb = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                floorBeamPlacementCoordinateModalOpen,
                showCoordHud: true,
              });
              const shiftHintFb = fbsM?.shiftDirectionLockUnit
                ? fbsM.shiftLockReferenceMm
                  ? "Угол по Shift · длина по опорной точке (проекция)"
                  : "Угол зафиксирован (Shift) — отпустите для свободного режима"
                : "Shift — зафиксировать направление";
              setWallHintRef.current({
                left: layFb.instruction.left,
                top: layFb.instruction.top,
                snapLabel: snapLineFb,
                lines: hintLines(`Балка перекрытия · ${floorBeamPlacementHintMessage(floorBeamPlacementSession.phase)}`, [
                  { text: modeLabelFb },
                  { text: "Alt — без угловой привязки", variant: "muted" },
                  { text: shiftHintFb, variant: "muted" },
                ]),
              });
              if (fbsM?.firstPointMm && fbsM.previewEndMm && layFb.liveHud) {
                const dxFb = fbsM.previewEndMm.x - fbsM.firstPointMm.x;
                const dyFb = fbsM.previewEndMm.y - fbsM.firstPointMm.y;
                const dFb = Math.hypot(dxFb, dyFb);
                const relFb = computeAnchorRelativeHud(
                  fbsM.firstPointMm.x,
                  fbsM.firstPointMm.y,
                  fbsM.previewEndMm.x,
                  fbsM.previewEndMm.y,
                );
                const lockedFb = fbsM.angleSnapLockedDeg ?? null;
                const shiftUFb = fbsM.shiftDirectionLockUnit;
                const angleShiftDegFb =
                  shiftUFb != null
                    ? normalizeAngleDeg360((Math.atan2(shiftUFb.y, shiftUFb.x) * 180) / Math.PI)
                    : null;
                setCoordHudRef.current({
                  left: layFb.liveHud.left,
                  top: layFb.liveHud.top,
                  dx: dxFb,
                  dy: dyFb,
                  d: dFb,
                  angleDeg:
                    angleShiftDegFb != null ? angleShiftDegFb : lockedFb != null ? lockedFb : relFb.angleDeg,
                  angleSnapLockedDeg: lockedFb,
                  secondLine: relFb.axisHint,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else {
              useAppStore.getState().floorBeamPlacementFirstPointHoverMove(p, t);
              const fbsH = useAppStore.getState().floorBeamPlacementSession;
              let snapLineFirstFb: string | null = null;
              if (fbsH?.lastSnapKind && fbsH.lastSnapKind !== "none") {
                snapLineFirstFb =
                  fbsH.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : fbsH.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const layFb0 = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: layFb0.instruction.left,
                top: layFb0.instruction.top,
                snapLabel: snapLineFirstFb,
                lines: hintLines(`Балка перекрытия · ${floorBeamPlacementHintMessage(floorBeamPlacementSession.phase)}`, [
                  { text: modeLabelFb },
                ]),
              });
              setCoordHudRef.current(null);
            }
          } else if (useAppStore.getState().floorBeamSplitSession) {
            const spl = useAppStore.getState().floorBeamSplitSession!;
            const laySpl = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            const modeRu =
              spl.mode === "maxLength"
                ? "по максимальной длине"
                : spl.mode === "center"
                  ? "по центру"
                  : "по указанному месту";
            setWallHintRef.current({
              left: laySpl.instruction.left,
              top: laySpl.instruction.top,
              lines: hintLines("Разделить перекрытие", [
                { text: `Режим: ${modeRu} · наложение ${spl.overlapMm} мм` },
                {
                  text:
                    spl.mode === "atPoint"
                      ? "ЛКМ по балке в нужной точке (привязки учитываются)"
                      : "ЛКМ по балке или профилю",
                  variant: "muted",
                },
                { text: "ПКМ / Esc — выход", variant: "muted" },
              ]),
            });
            setCoordHudRef.current(null);
            paint();
          } else if (useAppStore.getState().foundationStripPlacementSession) {
            const fsS = useAppStore.getState().foundationStripPlacementSession;
            if (fsS) {
              useAppStore.getState().foundationStripPlacementPreviewMove(p, t);
              const fs2 = useAppStore.getState().foundationStripPlacementSession;
              let snapFs: string | null = null;
              if (fs2?.lastSnapKind && fs2.lastSnapKind !== "none") {
                snapFs =
                  fs2.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : fs2.lastSnapKind === "edge"
                      ? "Привязка: линия стены"
                      : "Привязка: сетка";
              }
              const titleFs =
                fs2?.draft.buildMode === "rectangle"
                  ? "Лента фундамента · прямоугольник"
                  : "Лента фундамента · линейно";
              const phaseFs =
                fs2?.phase === "waitingSecondPoint"
                  ? "Вторая точка — ЛКМ · ПКМ / Esc — шаг назад"
                  : "Первая точка — ЛКМ";
              const layFs = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: layFs.instruction.left,
                top: layFs.instruction.top,
                snapLabel: snapFs,
                lines: hintLines(titleFs, [
                  { text: phaseFs },
                  { text: "ПКМ / Esc — отмена или выход", variant: "muted" },
                ]),
              });
            }
            setCoordHudRef.current(null);
            paint();
          } else if (useAppStore.getState().foundationPilePlacementSession) {
            const fpS = useAppStore.getState().foundationPilePlacementSession;
            if (fpS) {
              useAppStore.getState().foundationPilePlacementPreviewMove(p, t);
              const fp2 = useAppStore.getState().foundationPilePlacementSession;
              let snapPile: string | null = null;
              if (fp2?.lastSnapKind && fp2.lastSnapKind !== "none") {
                snapPile =
                  fp2.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : fp2.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const layPilePl = computeEditorOverlayLayout({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                viewportWidth: viewportW,
                viewportHeight: viewportH,
                wallCoordinateModalOpen: false,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: layPilePl.instruction.left,
                top: layPilePl.instruction.top,
                snapLabel: snapPile,
                lines: hintLines("Установка сваи", [
                  { text: "Выберите место · ЛКМ — поставить" },
                  { text: "ПКМ / Esc — выход", variant: "muted" },
                ]),
              });
            }
            setCoordHudRef.current(null);
            paint();
          } else if (useAppStore.getState().roofSystemPlacementSession) {
            const rsS = useAppStore.getState().roofSystemPlacementSession;
            if (rsS && !isSceneCoordinateModalBlocking(useAppStore.getState())) {
              useAppStore.getState().roofSystemPlacementPreviewMove(p, t);
            }
            const rs2 = useAppStore.getState().roofSystemPlacementSession;
            let snapRs: string | null = null;
            if (rs2?.lastSnapKind && rs2.lastSnapKind !== "none") {
              snapRs =
                rs2.lastSnapKind === "vertex"
                  ? "Привязка: угол"
                  : rs2.lastSnapKind === "edge"
                    ? "Привязка: линия"
                    : "Привязка: сетка";
            }
            const phaseRs =
              rs2?.phase === "waitingFirstCorner"
                ? "Первый угол контура крыши — ЛКМ"
                : "Второй угол прямоугольника — ЛКМ";
            const layRs = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: layRs.instruction.left,
              top: layRs.instruction.top,
              snapLabel: snapRs,
              lines: hintLines("Крыша (генератор)", [
                { text: phaseRs },
                { text: "ПКМ / Esc — шаг назад или выход", variant: "muted" },
              ]),
            });
            setCoordHudRef.current(null);
            paint();
          } else if (useAppStore.getState().roofPlanePlacementSession) {
            const rpS = useAppStore.getState().roofPlanePlacementSession;
            if (rpS && !isSceneCoordinateModalBlocking(useAppStore.getState())) {
              const altRp = Boolean((ev as { altKey?: boolean }).altKey);
              if (rpS.phase === "waitingFirstPoint") {
                useAppStore.getState().roofPlanePlacementFirstPointHoverMove(p, t);
              } else if (rpS.phase === "waitingSecondPoint") {
                useAppStore.getState().roofPlanePlacementSecondPointPreviewMove(p, t, { altKey: altRp });
              } else if (rpS.phase === "waitingDepth") {
                useAppStore.getState().roofPlanePlacementDepthPreviewMove(p, t, { altKey: altRp });
              }
            }
            const rp2 = useAppStore.getState().roofPlanePlacementSession;
            let snapRp: string | null = null;
            if (rp2?.lastSnapKind && rp2.lastSnapKind !== "none") {
              snapRp =
                rp2.lastSnapKind === "vertex"
                  ? "Привязка: угол"
                  : rp2.lastSnapKind === "edge"
                    ? "Привязка: линия"
                    : "Привязка: сетка";
            }
            const phaseRp =
              rp2?.phase === "waitingFirstPoint"
                ? "Первая точка базы (карниз) — ЛКМ"
                : rp2?.phase === "waitingSecondPoint"
                  ? "Вторая точка базы — ЛКМ · Shift — направление · Alt — без угловой привязки"
                  : "Задайте глубину плоскости перпендикулярно базе — ЛКМ · Shift — фиксировать сторону · Alt — без привязки";
            const layRp = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: layRp.instruction.left,
              top: layRp.instruction.top,
              snapLabel: snapRp,
              lines: hintLines("Плоскость крыши", [
                { text: phaseRp },
                { text: "ПКМ / Esc — шаг назад или выход", variant: "muted" },
              ]),
            });
            setCoordHudRef.current(null);
            paint();
          } else if (useAppStore.getState().roofContourJoinSession) {
            const rj = useAppStore.getState().roofContourJoinSession;
            if (rj && !isSceneCoordinateModalBlocking(useAppStore.getState())) {
              useAppStore.getState().roofContourJoinPointerMove(p, t);
            }
            const rj2 = useAppStore.getState().roofContourJoinSession;
            const titleRj = "Соединить контур";
            const layRj = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: layRj.instruction.left,
              top: layRj.instruction.top,
              lines: hintLines(titleRj, [
                { text: rj2?.hint ?? "" },
                { text: "ЛКМ — подтвердить · ПКМ / Esc — шаг назад или выход", variant: "muted" },
              ]),
            });
            setCoordHudRef.current(null);
            paint();
          } else if (useAppStore.getState().slabPlacementSession) {
            const slabS = useAppStore.getState().slabPlacementSession;
            if (slabS && !isSceneCoordinateModalBlocking(useAppStore.getState())) {
              useAppStore.getState().slabPlacementPreviewMove(p, t);
            }
            const slab2 = useAppStore.getState().slabPlacementSession;
            let snapSlab: string | null = null;
            if (slab2?.lastSnapKind && slab2.lastSnapKind !== "none") {
              snapSlab =
                slab2.lastSnapKind === "vertex"
                  ? "Привязка: угол"
                  : slab2.lastSnapKind === "edge"
                    ? "Привязка: линия"
                    : "Привязка: сетка";
            }
            const titleSlab =
              slab2?.buildMode === "rectangle" ? "Плита · прямоугольник" : "Плита · полилиния";
            const polyLen = slab2?.polylineVerticesMm?.length ?? 0;
            const phaseSlab =
              slab2?.phase === "waitingFirstPoint"
                ? "Первая точка — ЛКМ · Пробел — координаты"
                : slab2?.buildMode === "rectangle"
                  ? "Вторая точка — ЛКМ · Пробел — координаты · ПКМ / Esc — шаг назад"
                  : polyLen >= 3
                    ? "ЛКМ — вершина · клик по первой точке / двойной клик / Enter — замкнуть · Пробел — координаты"
                    : "ЛКМ — следующая вершина · Пробел — координаты · ПКМ / Esc — шаг назад";
            const laySlab = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: laySlab.instruction.left,
              top: laySlab.instruction.top,
              snapLabel: snapSlab,
              lines: hintLines(titleSlab, [
                { text: phaseSlab },
                { text: "ПКМ / Esc — отмена или выход", variant: "muted" },
              ]),
            });
            setCoordHudRef.current(null);
            paint();
          } else if (wallJointSession) {
            const layerView = narrowProjectToActiveLayer(currentProject);
            const walls = layerView.walls;
            const tol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
            const first = wallJointSession.first;
            let nextHover: JointHoverState = null;
            if (wallJointSession.phase === "pickFirst") {
              const hit = pickNearestWallEnd(p, walls, tol);
              nextHover = hit ? { kind: "end", wallId: hit.wallId, end: hit.end } : null;
            } else if (wallJointSession.kind === "T_ABUTMENT" && first) {
              const seg = pickWallSegmentInterior(
                p,
                walls.filter((w) => w.id !== first.wallId),
                tol,
                350,
              );
              nextHover = seg ? { kind: "segment", wallId: seg.wallId, pointMm: seg.pointMm } : null;
            } else {
              const hit = pickNearestWallEnd(p, walls, tol);
              nextHover = hit ? { kind: "end", wallId: hit.wallId, end: hit.end } : null;
            }
            jointHoverRef.current = nextHover;
            const layJoint = computeEditorOverlayLayout({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: viewportW,
              viewportHeight: viewportH,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: layJoint.instruction.left,
              top: layJoint.instruction.top,
              lines: hintLines(wallJointHintRu(wallJointSession.kind, wallJointSession.phase), []),
            });
            setCoordHudRef.current(null);
            paint();
          } else {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
        }

        if (marquee) {
          if (!coordBlock) {
            marquee.cx = ev.global.x;
            marquee.cy = ev.global.y;
            paint();
          }
          return;
        }

        if (panning.active && !coordBlock) {
          const dxPx = ev.global.x - panning.sx;
          const dyPx = ev.global.y - panning.sy;
          useAppStore.getState().setViewport2d({
            ...viewport2d,
            panXMm: panning.panXMm - dxPx / panning.zoom,
            panYMm: panning.panYMm + dyPx / panning.zoom,
          });
        }

        syncAnchorCrosshairOverlay(canvas);
      };

      const onPointerDown = (ev: FederatedPointerEvent) => {
        const w = app.renderer.width;
        const h = app.renderer.height;
        const { viewport2d, wallPlacementSession, wallJointSession, activeTool } = useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const worldMm = screenToWorld(ev.global.x, ev.global.y, t);

        const pendingWin = useAppStore.getState().pendingWindowPlacement;
        const pendingDoor = useAppStore.getState().pendingDoorPlacement;
        if (pendingWin && ev.button === 0) {
          useAppStore.getState().tryCommitPendingWindowPlacementAtWorld(worldMm);
          windowPlacementHoverRef.current = null;
          paint();
          return;
        }
        if (pendingDoor && ev.button === 0) {
          useAppStore.getState().tryCommitPendingDoorPlacementAtWorld(worldMm);
          windowPlacementHoverRef.current = null;
          paint();
          return;
        }
        if ((pendingWin || pendingDoor) && ev.button === 2) {
          ev.preventDefault();
          if (pendingWin) {
            useAppStore.getState().abortPendingWindowPlacement();
          } else {
            useAppStore.getState().abortPendingDoorPlacement();
          }
          windowPlacementHoverRef.current = null;
          setWallHintRef.current(null);
          paint();
          return;
        }

        if (isSceneCoordinateModalBlocking(useAppStore.getState())) {
          return;
        }

        if (useAppStore.getState().projectOriginMoveToolActive && ev.button === 0) {
          const stOr = useAppStore.getState();
          const projOr = stOr.currentProject;
          const e2Or = projOr.settings.editor2d;
          const snapOr = resolveSnap2d({
            rawWorldMm: worldMm,
            viewport: t,
            project: projOr,
            snapSettings: {
              snapToVertex: e2Or.snapToVertex,
              snapToEdge: e2Or.snapToEdge,
              snapToGrid: e2Or.snapToGrid,
            },
            gridStepMm: projOr.settings.gridStepMm,
          });
          stOr.applyProjectOriginAtWorldMm(snapOr.point);
          setWallHintRef.current(null);
          paint();
          return;
        }

        const foundationStripSession = useAppStore.getState().foundationStripPlacementSession;
        if (foundationStripSession && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().foundationStripPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (foundationStripSession && ev.button === 0) {
          useAppStore.getState().foundationStripPlacementPrimaryClick(worldMm, t);
          paint();
          if (!useAppStore.getState().foundationStripPlacementSession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        const foundationPileSession = useAppStore.getState().foundationPilePlacementSession;
        if (foundationPileSession && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().cancelFoundationPilePlacement();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (foundationPileSession && ev.button === 0) {
          useAppStore.getState().foundationPilePlacementPrimaryClick(worldMm, t);
          paint();
          return;
        }

        const slabPlacementSessionPtr = useAppStore.getState().slabPlacementSession;
        if (slabPlacementSessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().slabPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (slabPlacementSessionPtr && ev.button === 0) {
          useAppStore.getState().slabPlacementPrimaryClick(worldMm, t, { clickDetail: ev.detail });
          paint();
          if (!useAppStore.getState().slabPlacementSession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        const roofContourJoinPtr = useAppStore.getState().roofContourJoinSession;
        if (roofContourJoinPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().roofContourJoinBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (roofContourJoinPtr && ev.button === 0) {
          useAppStore.getState().roofContourJoinPrimaryClick(worldMm, t);
          const stillJoin = useAppStore.getState().roofContourJoinSession;
          paint();
          if (!stillJoin) {
            const layOk = computeEditorOverlayLayout({
              canvasRect: canvas.getBoundingClientRect(),
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              viewportWidth: w,
              viewportHeight: h,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: layOk.instruction.left,
              top: layOk.instruction.top,
              lines: hintLines("Соединить контур", [{ text: "Контуры соединены" }]),
            });
            window.setTimeout(() => {
              if (!useAppStore.getState().roofContourJoinSession) {
                setWallHintRef.current(null);
                paintWorkspaceRef.current?.();
              }
            }, 2200);
          }
          return;
        }

        const roofSystemPlacementSessionPtr = useAppStore.getState().roofSystemPlacementSession;
        if (roofSystemPlacementSessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().roofSystemPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (roofSystemPlacementSessionPtr && ev.button === 0) {
          useAppStore.getState().roofSystemPlacementPrimaryClick(worldMm, t, { clickDetail: ev.detail });
          paint();
          if (!useAppStore.getState().roofSystemPlacementSession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        const roofPlanePlacementSessionPtr = useAppStore.getState().roofPlanePlacementSession;
        if (roofPlanePlacementSessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().roofPlanePlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (roofPlanePlacementSessionPtr && ev.button === 0) {
          useAppStore.getState().roofPlanePlacementPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          if (!useAppStore.getState().roofPlanePlacementSession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        if (wallJointSession && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().wallJointBackOrExit();
          jointHoverRef.current = null;
          setWallHintRef.current(null);
          paint();
          return;
        }

        if (wallJointSession && ev.button === 0) {
          const tol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
          useAppStore.getState().wallJointPrimaryClick(worldMm, tol);
          paint();
          return;
        }

        const floorBeamPlacementSessionPtr = useAppStore.getState().floorBeamPlacementSession;
        if (floorBeamPlacementSessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().floorBeamPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (floorBeamPlacementSessionPtr && ev.button === 0) {
          useAppStore.getState().floorBeamPlacementPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          if (!useAppStore.getState().floorBeamPlacementSession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        if (wallPlacementSession && ev.button === 2) {
          if (useAppStore.getState().wallAnchorCoordinateModalOpen) {
            ev.preventDefault();
            return;
          }
          ev.preventDefault();
          const stR = useAppStore.getState();
          const ph = wallPlacementSession.phase;
          if (
            stR.wallAnchorPlacementModeActive &&
            stR.wallPlacementAnchorMm &&
            (ph === "waitingFirstWallPoint" || ph === "waitingOriginAndFirst")
          ) {
            stR.clearWallPlacementAnchor();
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
            paint();
            return;
          }
          useAppStore.getState().wallPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (wallPlacementSession && ev.button === 0) {
          if (useAppStore.getState().wallAnchorCoordinateModalOpen) {
            return;
          }
          useAppStore.getState().wallPlacementPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          if (!useAppStore.getState().wallPlacementSession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        const entityCopySessionPtr = useAppStore.getState().entityCopySession;
        if (entityCopySessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().cancelEntityCopyFlow();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (entityCopySessionPtr && ev.button === 0) {
          if (useAppStore.getState().entityCopyCoordinateModalOpen) {
            return;
          }
          useAppStore.getState().entityCopyPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          if (!useAppStore.getState().entityCopySession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        const foundationPileMoveCopySessionPtr = useAppStore.getState().foundationPileMoveCopySession;
        if (foundationPileMoveCopySessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().cancelFoundationPileMoveCopy();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (foundationPileMoveCopySessionPtr && ev.button === 0) {
          useAppStore.getState().foundationPileMoveCopyPrimaryClick(worldMm, t);
          paint();
          if (!useAppStore.getState().foundationPileMoveCopySession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        const floorBeamMoveCopySessionPtr = useAppStore.getState().floorBeamMoveCopySession;
        if (floorBeamMoveCopySessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().cancelFloorBeamMoveCopy();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (floorBeamMoveCopySessionPtr && ev.button === 0) {
          if (useAppStore.getState().floorBeamMoveCopyCoordinateModalOpen) {
            return;
          }
          useAppStore.getState().floorBeamMoveCopyPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          if (!useAppStore.getState().floorBeamMoveCopySession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        const floorBeamSplitSessionPtr = useAppStore.getState().floorBeamSplitSession;
        if (floorBeamSplitSessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().cancelFloorBeamSplitTool();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }
        if (floorBeamSplitSessionPtr && ev.button === 0) {
          const cpSpl = useAppStore.getState().currentProject;
          if (cpSpl.viewState.editor2dPlanScope !== "floorStructure") {
            useAppStore.getState().cancelFloorBeamSplitTool();
            paint();
            return;
          }
          const layerSpl = narrowProjectToActiveLayer(cpSpl);
          const segTolSpl = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
          const hitSpl = pickFloorBeamAtPlanPoint(cpSpl, layerSpl.floorBeams, worldMm, segTolSpl);
          if (!hitSpl) {
            useAppStore.setState({ lastError: "Укажите балку или профиль перекрытия на плане." });
            paint();
            return;
          }
          useAppStore.getState().floorBeamSplitCommitOnBeamClick({
            beamId: hitSpl.id,
            rawWorldMm: worldMm,
            viewport: t,
          });
          paint();
          return;
        }

        const wallMoveCopySessionPtr = useAppStore.getState().wallMoveCopySession;
        if (wallMoveCopySessionPtr && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().cancelWallMoveCopy();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (wallMoveCopySessionPtr && ev.button === 0) {
          if (useAppStore.getState().wallMoveCopyCoordinateModalOpen) {
            return;
          }
          useAppStore.getState().wallMoveCopyPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          if (!useAppStore.getState().wallMoveCopySession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
          return;
        }

        if (activeTool === "changeLength" && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().lengthChange2dEsc();
          lengthChangeHoverRef.current = null;
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (activeTool === "changeLength" && ev.button === 0) {
          if (useAppStore.getState().lengthChangeCoordinateModalOpen) {
            return;
          }
          const layerLc = narrowProjectToActiveLayer(useAppStore.getState().currentProject);
          const lc = useAppStore.getState().lengthChange2dSession;
          if (lc) {
            useAppStore.getState().lengthChange2dCommit();
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
            paint();
            return;
          }
          const endTol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
          const hitEnd = pickNearestLinearProfileLengthEnd(
            worldMm,
            useAppStore.getState().currentProject,
            layerLc.walls,
            layerLc.floorBeams,
            endTol,
          );
          if (hitEnd) {
            const target: LengthChange2dTarget =
              hitEnd.kind === "wall"
                ? { kind: "wall", wallId: hitEnd.id }
                : { kind: "floorBeam", beamId: hitEnd.id };
            useAppStore.getState().startLengthChange2dSession(target, hitEnd.end, worldMm, t);
            paint();
            return;
          }
          return;
        }

        if (activeTool === "ruler" && ev.button === 0) {
          useAppStore.getState().ruler2dPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          return;
        }

        if (activeTool === "line" && ev.button === 0) {
          useAppStore.getState().line2dPrimaryClick(worldMm, t, { altKey: Boolean(ev.altKey) });
          paint();
          return;
        }

        if (ev.button === 1) {
          const { viewport2d: v2 } = useAppStore.getState();
          panning.active = true;
          panning.sx = ev.global.x;
          panning.sy = ev.global.y;
          panning.panXMm = v2.panXMm;
          panning.panYMm = v2.panYMm;
          panning.zoom = v2.zoomPixelsPerMm;
          return;
        }
        if (ev.button === 0 && activeTool === "pan") {
          const { viewport2d: v2 } = useAppStore.getState();
          panning.active = true;
          panning.sx = ev.global.x;
          panning.sy = ev.global.y;
          panning.panXMm = v2.panXMm;
          panning.panYMm = v2.panYMm;
          panning.zoom = v2.zoomPixelsPerMm;
          return;
        }
        if (
          ev.button === 2 &&
          (activeTool === "select" || activeTool === "ruler" || activeTool === "line") &&
          !wallJointSession &&
          !wallPlacementSession &&
          !useAppStore.getState().floorBeamPlacementSession &&
          !useAppStore.getState().floorBeamSplitSession &&
          !useAppStore.getState().foundationStripPlacementSession &&
          !useAppStore.getState().foundationPilePlacementSession &&
          !useAppStore.getState().slabPlacementSession &&
          !useAppStore.getState().roofSystemPlacementSession &&
          !useAppStore.getState().roofPlanePlacementSession &&
          !useAppStore.getState().roofContourJoinSession &&
          !useAppStore.getState().pendingWindowPlacement &&
          !useAppStore.getState().pendingDoorPlacement &&
          !useAppStore.getState().wallMoveCopySession &&
          !useAppStore.getState().foundationPileMoveCopySession &&
          !useAppStore.getState().floorBeamMoveCopySession &&
          !useAppStore.getState().entityCopySession &&
          !useAppStore.getState().entityCopyParamsModal
        ) {
          ev.preventDefault();
          const cpRm = useAppStore.getState().currentProject;
          const layerRm = narrowProjectToActiveLayer(cpRm);
          const wallTolRm = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
          const segTolRm = wallTolRm;

          if (activeTool === "select") {
            const tolOpRm = openingPickTolerancesMm(viewport2d.zoomPixelsPerMm);
            const hitOpRm = pickPlacedOpeningOnLayerSlice(layerRm, worldMm, tolOpRm.along, tolOpRm.perp);
            if (hitOpRm && hitOpRm.wallId != null && (hitOpRm.kind === "window" || hitOpRm.kind === "door")) {
              const canvasOp = app.canvas as HTMLCanvasElement;
              const rectOp = canvasOp.getBoundingClientRect();
              const sxOp = rectOp.left + (ev.global.x / w) * rectOp.width;
              const syOp = rectOp.top + (ev.global.y / h) * rectOp.height;
              useAppStore.getState().openEditor2dSecondaryContextMenu({
                scope: "opening",
                id: hitOpRm.id,
                clientX: sxOp,
                clientY: syOp,
              });
              paint();
              return;
            }
          }

          const lineHitRm = pickClosestPlanLineAlongPoint(worldMm, layerRm.planLines, segTolRm);
          if (activeTool === "select" && lineHitRm) {
            const canvasLn = app.canvas as HTMLCanvasElement;
            const rectLn = canvasLn.getBoundingClientRect();
            const sxLn = rectLn.left + (ev.global.x / w) * rectLn.width;
            const syLn = rectLn.top + (ev.global.y / h) * rectLn.height;
            useAppStore.getState().openEditor2dSecondaryContextMenu({
              scope: "planLine",
              id: lineHitRm.planLineId,
              clientX: sxLn,
              clientY: syLn,
            });
            paint();
            return;
          }

          const pileHitRm = pickClosestFoundationPileAtPoint(worldMm, layerRm.foundationPiles, segTolRm);
          if (activeTool === "select" && pileHitRm) {
            const canvasRmP = app.canvas as HTMLCanvasElement;
            const rectRmP = canvasRmP.getBoundingClientRect();
            const sxP = rectRmP.left + (ev.global.x / w) * rectRmP.width;
            const syP = rectRmP.top + (ev.global.y / h) * rectRmP.height;
            useAppStore.getState().openFoundationPileContextMenu({
              pileId: pileHitRm.pileId,
              clientX: sxP,
              clientY: syP,
            });
            paint();
            return;
          }

          const slabHitRm = pickClosestSlabAtPoint(worldMm, layerRm.slabs, segTolRm);
          if (activeTool === "select" && slabHitRm) {
            const canvasSl = app.canvas as HTMLCanvasElement;
            const rectSl = canvasSl.getBoundingClientRect();
            const sxSl = rectSl.left + (ev.global.x / w) * rectSl.width;
            const sySl = rectSl.top + (ev.global.y / h) * rectSl.height;
            useAppStore.getState().openEditor2dSecondaryContextMenu({
              scope: "slab",
              id: slabHitRm.slabId,
              clientX: sxSl,
              clientY: sySl,
            });
            paint();
            return;
          }

          const fsHitRm = pickClosestFoundationStripAlongPoint(worldMm, layerRm.foundationStrips, segTolRm);
          if (activeTool === "select" && fsHitRm) {
            const canvasFs = app.canvas as HTMLCanvasElement;
            const rectFs = canvasFs.getBoundingClientRect();
            const sxFs = rectFs.left + (ev.global.x / w) * rectFs.width;
            const syFs = rectFs.top + (ev.global.y / h) * rectFs.height;
            useAppStore.getState().openEditor2dSecondaryContextMenu({
              scope: "foundationStrip",
              id: fsHitRm.stripId,
              clientX: sxFs,
              clientY: syFs,
            });
            paint();
            return;
          }

          const beamHitRm = pickFloorBeamAtPlanPoint(cpRm, layerRm.floorBeams, worldMm, segTolRm);
          if (activeTool === "select" && beamHitRm) {
            const canvasBm = app.canvas as HTMLCanvasElement;
            const rectBm = canvasBm.getBoundingClientRect();
            const sxBm = rectBm.left + (ev.global.x / w) * rectBm.width;
            const syBm = rectBm.top + (ev.global.y / h) * rectBm.height;
            useAppStore.getState().openFloorBeamContextMenu({
              beamId: beamHitRm.id,
              clientX: sxBm,
              clientY: syBm,
            });
            paint();
            return;
          }

          const wallHitRm = pickClosestWallAlongPoint(worldMm, layerRm.walls, wallTolRm);
          if (activeTool === "select" && wallHitRm) {
            const canvasRm = app.canvas as HTMLCanvasElement;
            const rectRm = canvasRm.getBoundingClientRect();
            const sx = rectRm.left + (ev.global.x / w) * rectRm.width;
            const sy = rectRm.top + (ev.global.y / h) * rectRm.height;
            useAppStore.getState().openWallContextMenu({
              wallId: wallHitRm.wallId,
              clientX: sx,
              clientY: sy,
            });
            paint();
            return;
          }
          const { viewport2d: v2 } = useAppStore.getState();
          panning.active = true;
          panning.sx = ev.global.x;
          panning.sy = ev.global.y;
          panning.panXMm = v2.panXMm;
          panning.panYMm = v2.panYMm;
          panning.zoom = v2.zoomPixelsPerMm;
          panPointerId = ev.pointerId;
          canvas.style.cursor = "grabbing";
          try {
            canvas.setPointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          return;
        }
        if (
          ev.button === 0 &&
          activeTool === "select" &&
          !wallJointSession &&
          !wallPlacementSession &&
          !useAppStore.getState().floorBeamPlacementSession &&
          !useAppStore.getState().floorBeamSplitSession &&
          !useAppStore.getState().foundationStripPlacementSession &&
          !useAppStore.getState().foundationPilePlacementSession &&
          !useAppStore.getState().slabPlacementSession &&
          !useAppStore.getState().roofSystemPlacementSession &&
          !useAppStore.getState().roofPlanePlacementSession &&
          !useAppStore.getState().roofContourJoinSession &&
          !useAppStore.getState().pendingWindowPlacement &&
          !useAppStore.getState().pendingDoorPlacement &&
          !useAppStore.getState().wallMoveCopySession &&
          !useAppStore.getState().foundationPileMoveCopySession &&
          !useAppStore.getState().floorBeamMoveCopySession &&
          !useAppStore.getState().entityCopySession &&
          !useAppStore.getState().entityCopyParamsModal
        ) {
          const moveMode = useAppStore.getState().openingMoveModeActive;
          if (moveMode) {
            const hit = moveDimHitsRef.current.find(
              (h0) =>
                ev.global.x >= h0.x &&
                ev.global.x <= h0.x + h0.w &&
                ev.global.y >= h0.y &&
                ev.global.y <= h0.y + h0.h,
            );
            if (hit) {
              const sel = useAppStore.getState().selectedEntityIds;
              if (sel.length === 1) {
                setMoveEdit({
                  side: hit.anchor,
                  face: hit.face,
                  openingId: sel[0]!,
                  valueStr: String(Math.round(hit.valueMm)),
                  initialValueStr: String(Math.round(hit.valueMm)),
                  left: ev.global.x + 8,
                  top: ev.global.y + 8,
                  error: null,
                });
                return;
              }
            }
          }
          const cp = useAppStore.getState().currentProject;
          const layerView = narrowProjectToActiveLayer(cp);
          const stRfDown = useAppStore.getState();
          if (
            stRfDown.activeTool === "select" &&
            stRfDown.currentProject.viewState.editor2dPlanScope === "roof" &&
            !stRfDown.roofContourJoinSession &&
            stRfDown.selectedEntityIds.length === 1
          ) {
            const onlyRf = stRfDown.selectedEntityIds[0]!;
            const rpRf = layerView.roofPlanes.find((r) => r.id === onlyRf);
            const quadRf = rpRf ? roofPlaneQuad4OrNull(rpRf) : null;
            if (quadRf) {
              const hoverRf = roofPlaneEditHoverRef.current;
              const stickyRf: RoofPlaneEditScreenSticky =
                hoverRf != null && hoverRf.planeId === onlyRf
                  ? {
                      kind: hoverRf.kind,
                      edgeIndex: hoverRf.edgeIndex,
                      cornerIndex: hoverRf.cornerIndex,
                    }
                  : null;
              const hitRf = pickRoofPlaneEditHandleScreen(ev.global.x, ev.global.y, quadRf, t, stickyRf);
              if (hitRf) {
                const projRf = stRfDown.currentProject;
                const e2Rf = projRf.settings.editor2d;
                const snapRf = resolveSnap2d({
                  rawWorldMm: worldMm,
                  viewport: t,
                  project: projRf,
                  snapSettings: {
                    snapToVertex: e2Rf.snapToVertex,
                    snapToEdge: e2Rf.snapToEdge,
                    snapToGrid: e2Rf.snapToGrid,
                  },
                  gridStepMm: projRf.settings.gridStepMm,
                });
                roofPlaneEditPointerRef.current = {
                  pointerId: ev.pointerId,
                  sx: ev.global.x,
                  sy: ev.global.y,
                  planeId: onlyRf,
                  kind: hitRf.kind,
                  edgeIndex: hitRf.kind === "edge" ? hitRf.edgeIndex : undefined,
                  cornerIndex: hitRf.kind === "corner" ? hitRf.cornerIndex : undefined,
                  baseQuad: quadRf,
                  anchorSnapMm: { x: snapRf.point.x, y: snapRf.point.y },
                  anchorWorldMm: { x: worldMm.x, y: worldMm.y },
                  nOut: hitRf.kind === "edge" ? hitRf.nOut : undefined,
                  lastWorldMm:
                    hitRf.kind === "edge"
                      ? { x: worldMm.x, y: worldMm.y }
                      : { x: snapRf.point.x, y: snapRf.point.y },
                  dragActive: false,
                  suspendedForModal: false,
                  pointerReleasedWhileModalOpen: false,
                };
                try {
                  canvas.setPointerCapture(ev.pointerId);
                } catch {
                  /* ignore */
                }
                paint();
                return;
              }
            }
          }
          const tol = openingPickTolerancesMm(viewport2d.zoomPixelsPerMm);
          const hitOp = pickPlacedOpeningOnLayerSlice(layerView, worldMm, tol.along, tol.perp);
          if (hitOp && hitOp.wallId != null) {
            openingDragHistoryBaselineRef.current = null;
            const moveToolSession =
              useAppStore.getState().openingMoveModeActive && (hitOp.kind === "window" || hitOp.kind === "door");
            openingPointerRef.current = {
              openingId: hitOp.id,
              wallId: hitOp.wallId,
              kind: hitOp.kind,
              sx: ev.global.x,
              sy: ev.global.y,
              pointerId: ev.pointerId,
              dragActive: false,
              moveToolSession,
              startLeftEdgeMm: null,
              suspendedForModal: false,
              pointerReleasedWhileModalOpen: false,
            };
            try {
              canvas.setPointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            const store = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(store.selectedEntityIds);
              if (s.has(hitOp.id)) {
                s.delete(hitOp.id);
              } else {
                s.add(hitOp.id);
              }
              store.setSelectedEntityIds([...s]);
            } else {
              store.setSelectedEntityIds([hitOp.id]);
            }
            paint();
            return;
          }
          const segTolSel = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
          const lineHit = pickClosestPlanLineAlongPoint(worldMm, layerView.planLines, segTolSel);
          if (lineHit) {
            const storeLn = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(storeLn.selectedEntityIds);
              if (s.has(lineHit.planLineId)) {
                s.delete(lineHit.planLineId);
              } else {
                s.add(lineHit.planLineId);
              }
              storeLn.setSelectedEntityIds([...s]);
            } else {
              storeLn.setSelectedEntityIds([lineHit.planLineId]);
            }
            lastWallClickRef.current = null;
            lastFoundationStripClickRef.current = null;
            paint();
            return;
          }
          const pileHit = pickClosestFoundationPileAtPoint(worldMm, layerView.foundationPiles, segTolSel);
          if (pileHit) {
            const storePl = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(storePl.selectedEntityIds);
              if (s.has(pileHit.pileId)) {
                s.delete(pileHit.pileId);
              } else {
                s.add(pileHit.pileId);
              }
              storePl.setSelectedEntityIds([...s]);
            } else {
              storePl.setSelectedEntityIds([pileHit.pileId]);
            }
            const stAfter = useAppStore.getState();
            const pileIdSet = new Set(stAfter.currentProject.foundationPiles.map((p) => p.id));
            const pileIds = stAfter.selectedEntityIds.filter((id) => pileIdSet.has(id));
            if (!stAfter.foundationPileMoveCopySession && !stAfter.floorBeamMoveCopySession) {
              foundationPilePointerRef.current = {
                pointerId: ev.pointerId,
                sx: ev.global.x,
                sy: ev.global.y,
                lastWorldMm: { x: worldMm.x, y: worldMm.y },
                dragActive: false,
                pileIds,
              };
              try {
                canvas.setPointerCapture(ev.pointerId);
              } catch {
                /* ignore */
              }
            }
            lastWallClickRef.current = null;
            lastFoundationStripClickRef.current = null;
            lastSlabClickRef.current = null;
            paint();
            return;
          }
          const slabHit = pickClosestSlabAtPoint(worldMm, layerView.slabs, segTolSel);
          if (slabHit) {
            const storeSlab = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(storeSlab.selectedEntityIds);
              if (s.has(slabHit.slabId)) {
                s.delete(slabHit.slabId);
              } else {
                s.add(slabHit.slabId);
              }
              storeSlab.setSelectedEntityIds([...s]);
            } else {
              storeSlab.setSelectedEntityIds([slabHit.slabId]);
            }
            const stAfterSl = useAppStore.getState();
            const slabIdSet = new Set(stAfterSl.currentProject.slabs.map((s0) => s0.id));
            const slabIds = stAfterSl.selectedEntityIds.filter((id) => slabIdSet.has(id));
            slabPointerRef.current = {
              pointerId: ev.pointerId,
              sx: ev.global.x,
              sy: ev.global.y,
              lastWorldMm: { x: worldMm.x, y: worldMm.y },
              dragActive: false,
              slabIds,
            };
            try {
              canvas.setPointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            lastWallClickRef.current = null;
            lastFoundationStripClickRef.current = null;
            paint();
            return;
          }
          const roofHitSel = pickClosestRoofPlaneAtPoint(worldMm, layerView.roofPlanes, segTolSel);
          if (roofHitSel) {
            roofPlaneEditSelectedRef.current = null;
            const storeRp = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(storeRp.selectedEntityIds);
              if (s.has(roofHitSel.roofPlaneId)) {
                s.delete(roofHitSel.roofPlaneId);
              } else {
                s.add(roofHitSel.roofPlaneId);
              }
              storeRp.setSelectedEntityIds([...s]);
            } else {
              storeRp.setSelectedEntityIds([roofHitSel.roofPlaneId]);
            }
            lastWallClickRef.current = null;
            lastFoundationStripClickRef.current = null;
            lastSlabClickRef.current = null;
            paint();
            return;
          }
          const cpSel = useAppStore.getState().currentProject;
          const beamHit = pickFloorBeamAtPlanPoint(cpSel, layerView.floorBeams, worldMm, segTolSel);
          if (beamHit) {
            const storeBm = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(storeBm.selectedEntityIds);
              if (s.has(beamHit.id)) {
                s.delete(beamHit.id);
              } else {
                s.add(beamHit.id);
              }
              storeBm.setSelectedEntityIds([...s]);
            } else {
              storeBm.setSelectedEntityIds([beamHit.id]);
            }
            lastWallClickRef.current = null;
            lastFoundationStripClickRef.current = null;
            lastSlabClickRef.current = null;
            paint();
            return;
          }
          const fsHit = pickClosestFoundationStripAlongPoint(worldMm, layerView.foundationStrips, segTolSel);
          if (fsHit) {
            const storeFs = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(storeFs.selectedEntityIds);
              if (s.has(fsHit.stripId)) {
                s.delete(fsHit.stripId);
              } else {
                s.add(fsHit.stripId);
              }
              storeFs.setSelectedEntityIds([...s]);
            } else {
              storeFs.setSelectedEntityIds([fsHit.stripId]);
            }
            const nowStrip = Date.now();
            const prevStrip = lastFoundationStripClickRef.current;
            if (prevStrip && prevStrip.id === fsHit.stripId && nowStrip - prevStrip.t < 480) {
              storeFs.openFoundationStripAutoPilesModal(fsHit.stripId);
              lastFoundationStripClickRef.current = null;
            } else {
              lastFoundationStripClickRef.current = { id: fsHit.stripId, t: nowStrip };
            }
            lastWallClickRef.current = null;
            paint();
            return;
          }
          const wallHit = pickClosestWallAlongPoint(worldMm, layerView.walls, segTolSel);
          if (wallHit) {
            const store = useAppStore.getState();
            if (ev.shiftKey) {
              const s = new Set(store.selectedEntityIds);
              if (s.has(wallHit.wallId)) s.delete(wallHit.wallId);
              else s.add(wallHit.wallId);
              store.setSelectedEntityIds([...s]);
            } else {
              store.setSelectedEntityIds([wallHit.wallId]);
            }
            const now = Date.now();
            const prev = lastWallClickRef.current;
            if (prev && prev.id === wallHit.wallId && now - prev.t < 480) {
              openWallObjectEditorFromHit(wallHit.wallId);
              lastWallClickRef.current = null;
            } else {
              lastWallClickRef.current = { id: wallHit.wallId, t: now };
            }
            lastFoundationStripClickRef.current = null;
            paint();
            return;
          }
          marquee = { sx: ev.global.x, sy: ev.global.y, cx: ev.global.x, cy: ev.global.y, shiftKey: ev.shiftKey };
          marqueePointerId = ev.pointerId;
          try {
            canvas.setPointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          paint();
        }
      };

      const onPointerUp = (ev: FederatedPointerEvent) => {
        const opPtr = openingPointerRef.current;
        if (opPtr && ev.pointerId === opPtr.pointerId) {
          if (useAppStore.getState().openingAlongMoveNumericModalOpen) {
            opPtr.pointerReleasedWhileModalOpen = true;
            try {
              canvas.releasePointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            paint();
            return;
          }
          openingPointerRef.current = null;
          try {
            canvas.releasePointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          setOpeningMoveDragHud(null);
          if (!opPtr.dragActive) {
            const now = Date.now();
            const last = lastOpeningClickRef.current;
            if (last && last.id === opPtr.openingId && now - last.t < 480) {
              openPlacedOpeningObjectEditorFromHit(opPtr.openingId);
              lastOpeningClickRef.current = null;
            } else {
              lastOpeningClickRef.current = { id: opPtr.openingId, t: now };
            }
          } else {
            lastOpeningClickRef.current = null;
            const dragBase = openingDragHistoryBaselineRef.current;
            openingDragHistoryBaselineRef.current = null;
            if (dragBase) {
              useAppStore.getState().recordUndoIfModelChangedSince(dragBase);
            }
          }
          paint();
        }
        const fpPtr = foundationPilePointerRef.current;
        if (fpPtr && ev.pointerId === fpPtr.pointerId) {
          foundationPilePointerRef.current = null;
          try {
            canvas.releasePointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          if (fpPtr.dragActive) {
            const dragBaseFp = foundationPileDragHistoryBaselineRef.current;
            foundationPileDragHistoryBaselineRef.current = null;
            if (dragBaseFp) {
              useAppStore.getState().recordUndoIfModelChangedSince(dragBaseFp);
            }
          }
          paint();
        }
        const slabPtrUp = slabPointerRef.current;
        if (slabPtrUp && ev.pointerId === slabPtrUp.pointerId) {
          slabPointerRef.current = null;
          try {
            canvas.releasePointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          if (slabPtrUp.dragActive) {
            const dragBaseSlab = slabDragHistoryBaselineRef.current;
            slabDragHistoryBaselineRef.current = null;
            if (dragBaseSlab) {
              useAppStore.getState().recordUndoIfModelChangedSince(dragBaseSlab);
            }
          } else {
            const nowSl = Date.now();
            const lastSl = lastSlabClickRef.current;
            const primarySlabId = slabPtrUp.slabIds.length === 1 ? slabPtrUp.slabIds[0]! : null;
            if (primarySlabId && lastSl && lastSl.id === primarySlabId && nowSl - lastSl.t < 480) {
              useAppStore.getState().openSlabEditModal(primarySlabId);
              lastSlabClickRef.current = null;
            } else if (primarySlabId) {
              lastSlabClickRef.current = { id: primarySlabId, t: nowSl };
            }
          }
          paint();
        }
        const rpPtrUp = roofPlaneEditPointerRef.current;
        if (rpPtrUp && ev.pointerId === rpPtrUp.pointerId) {
          if (useAppStore.getState().roofPlaneEdgeOffsetModal != null) {
            rpPtrUp.pointerReleasedWhileModalOpen = true;
            try {
              canvas.releasePointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            paint();
          } else {
            roofPlaneEditPointerRef.current = null;
            try {
              canvas.releasePointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            const stRpUp = useAppStore.getState();
            if (stRpUp.selectedEntityIds.length === 1 && stRpUp.selectedEntityIds[0] === rpPtrUp.planeId) {
              roofPlaneEditSelectedRef.current = {
                planeId: rpPtrUp.planeId,
                kind: rpPtrUp.kind,
                edgeIndex: rpPtrUp.edgeIndex,
                cornerIndex: rpPtrUp.cornerIndex,
              };
            }
            if (rpPtrUp.dragActive) {
              const dragBaseRp = roofPlaneEditDragHistoryBaselineRef.current;
              roofPlaneEditDragHistoryBaselineRef.current = null;
              if (dragBaseRp) {
                useAppStore.getState().recordUndoIfModelChangedSince(dragBaseRp);
              }
            }
            paint();
          }
        }
        if (marquee) {
          finalizeMarquee();
          paint();
        }
        endPan();
      };

      const onPointerLeave = () => {
        const prev = lastPointerAnchorCrosshairRef.current;
        lastPointerAnchorCrosshairRef.current = { ...prev, inside: false };
        syncAnchorCrosshairOverlay(canvas);
        const opPtr = openingPointerRef.current;
        if (opPtr) {
          if (useAppStore.getState().openingAlongMoveNumericModalOpen) {
            opPtr.pointerReleasedWhileModalOpen = true;
            try {
              canvas.releasePointerCapture(opPtr.pointerId);
            } catch {
              /* ignore */
            }
            setOpeningMoveDragHud(null);
            paint();
          } else {
            openingPointerRef.current = null;
            try {
              canvas.releasePointerCapture(opPtr.pointerId);
            } catch {
              /* ignore */
            }
            lastOpeningClickRef.current = null;
            setOpeningMoveDragHud(null);
            if (opPtr.dragActive) {
              const dragBaseLeave = openingDragHistoryBaselineRef.current;
              openingDragHistoryBaselineRef.current = null;
              if (dragBaseLeave) {
                useAppStore.getState().recordUndoIfModelChangedSince(dragBaseLeave);
              }
            }
            paint();
          }
        }
        const fpPtrLeave = foundationPilePointerRef.current;
        if (fpPtrLeave) {
          foundationPilePointerRef.current = null;
          try {
            canvas.releasePointerCapture(fpPtrLeave.pointerId);
          } catch {
            /* ignore */
          }
          if (fpPtrLeave.dragActive) {
            const dragBaseFpLeave = foundationPileDragHistoryBaselineRef.current;
            foundationPileDragHistoryBaselineRef.current = null;
            if (dragBaseFpLeave) {
              useAppStore.getState().recordUndoIfModelChangedSince(dragBaseFpLeave);
            }
          }
          paint();
        }
        const slabPtrLeave = slabPointerRef.current;
        if (slabPtrLeave) {
          slabPointerRef.current = null;
          try {
            canvas.releasePointerCapture(slabPtrLeave.pointerId);
          } catch {
            /* ignore */
          }
          if (slabPtrLeave.dragActive) {
            const dragBaseSlabLeave = slabDragHistoryBaselineRef.current;
            slabDragHistoryBaselineRef.current = null;
            if (dragBaseSlabLeave) {
              useAppStore.getState().recordUndoIfModelChangedSince(dragBaseSlabLeave);
            }
          }
          lastSlabClickRef.current = null;
          paint();
        }
        const rpPtrLeave = roofPlaneEditPointerRef.current;
        if (rpPtrLeave) {
          roofPlaneEditPointerRef.current = null;
          try {
            canvas.releasePointerCapture(rpPtrLeave.pointerId);
          } catch {
            /* ignore */
          }
          const stRpLeave = useAppStore.getState();
          if (stRpLeave.selectedEntityIds.length === 1 && stRpLeave.selectedEntityIds[0] === rpPtrLeave.planeId) {
            roofPlaneEditSelectedRef.current = {
              planeId: rpPtrLeave.planeId,
              kind: rpPtrLeave.kind,
              edgeIndex: rpPtrLeave.edgeIndex,
              cornerIndex: rpPtrLeave.cornerIndex,
            };
          }
          if (rpPtrLeave.dragActive) {
            const dragBaseRpLeave = roofPlaneEditDragHistoryBaselineRef.current;
            roofPlaneEditDragHistoryBaselineRef.current = null;
            if (dragBaseRpLeave) {
              useAppStore.getState().recordUndoIfModelChangedSince(dragBaseRpLeave);
            }
          }
          paint();
        }
        roofPlaneEditHoverRef.current = null;
        endPan();
        cursorCbRef.current(null);
        jointHoverRef.current = null;
        lengthChangeHoverRef.current = null;
        const st = useAppStore.getState();
        windowPlacementHoverRef.current = null;
        if (st.activeTool === "ruler" || st.activeTool === "line" || st.activeTool === "changeLength") {
          setWallHintRef.current(null);
        }
        if (
          !st.wallPlacementSession &&
          !st.wallJointSession &&
          !st.pendingWindowPlacement &&
          !st.pendingDoorPlacement &&
          !st.wallMoveCopySession &&
          !st.foundationPileMoveCopySession &&
          !st.floorBeamMoveCopySession &&
          !st.floorBeamSplitSession &&
          !st.entityCopySession &&
          !st.foundationStripPlacementSession &&
          !st.foundationPilePlacementSession &&
          !st.roofContourJoinSession &&
          st.activeTool !== "ruler" &&
          st.activeTool !== "line" &&
          st.activeTool !== "changeLength"
        ) {
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        }
        if (
          st.wallJointSession ||
          st.pendingWindowPlacement ||
          st.pendingDoorPlacement ||
          st.wallMoveCopySession ||
          st.foundationPileMoveCopySession ||
          st.floorBeamMoveCopySession ||
          st.floorBeamSplitSession ||
          st.entityCopySession ||
          st.foundationStripPlacementSession ||
          st.foundationPilePlacementSession ||
          st.roofContourJoinSession ||
          st.activeTool === "ruler" ||
          st.activeTool === "line" ||
          st.activeTool === "changeLength"
        ) {
          paint();
        }
      };

      worldRoot.on("pointermove", onPointerMove);
      worldRoot.on("pointerdown", onPointerDown);
      worldRoot.on("pointerup", onPointerUp);
      worldRoot.on("pointerupoutside", onPointerUp);
      worldRoot.on("pointerleave", onPointerLeave);

      unsubStore = useAppStore.subscribe(paint);
      unsubTheme = useUiThemeStore.subscribe(paint);
      ro = new ResizeObserver(() => {
        /* Pixi resizeTo слушает только window.resize, не изменение flex/grid — принудительно подгоняем renderer. */
        app.resize();
        useAppStore.getState().setViewportCanvas2dPx(app.renderer.width, app.renderer.height);
        paint();
      });
      ro.observe(host);
      paint();

      detachListeners = () => {
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("contextmenu", onCanvasContextMenu);
        worldRoot.off("pointermove", onPointerMove);
        worldRoot.off("pointerdown", onPointerDown);
        worldRoot.off("pointerup", onPointerUp);
        worldRoot.off("pointerupoutside", onPointerUp);
        worldRoot.off("pointerleave", onPointerLeave);
      };
    })();

    return () => {
      disposed = true;
      canvasForOpeningDragRef.current = null;
      paintWorkspaceRef.current = null;
      setWallHintRef.current(null);
      setCoordHudRef.current(null);
      detachListeners?.();
      unsubStore?.();
      unsubTheme?.();
      ro?.disconnect();
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  const closeOpeningAlongMoveModal = () => {
    const st = useAppStore.getState();
    st.setOpeningAlongMoveNumericModalOpen(false);
    setOpeningAlongMoveModal(null);
    const sess = openingPointerRef.current;
    if (sess) {
      sess.suspendedForModal = false;
      if (sess.pointerReleasedWhileModalOpen) {
        openingPointerRef.current = null;
        const dragBase = openingDragHistoryBaselineRef.current;
        openingDragHistoryBaselineRef.current = null;
        if (dragBase) {
          st.recordUndoIfModelChangedSince(dragBase);
        }
      }
    }
    setOpeningMoveDragHud(null);
    paintWorkspaceRef.current?.();
  };

  const applyOpeningAlongMoveModal = () => {
    const modal = openingAlongMoveModal;
    if (!modal) {
      return;
    }
    const sess = openingPointerRef.current;
    if (!sess?.moveToolSession || sess.startLeftEdgeMm == null) {
      closeOpeningAlongMoveModal();
      return;
    }
    const raw = modal.valueStr.trim().replace(/,/g, ".");
    if (raw === "" || raw === "-" || raw === "+") {
      setOpeningAlongMoveModal({ ...modal, error: "Введите число в миллиметрах" });
      return;
    }
    const delta = Number(raw);
    if (!Number.isFinite(delta)) {
      setOpeningAlongMoveModal({ ...modal, error: "Некорректное число" });
      return;
    }
    const st = useAppStore.getState();
    const p = st.currentProject;
    const wall = p.walls.find((w) => w.id === sess.wallId);
    const opn = p.openings.find((o) => o.id === sess.openingId);
    if (!wall || !opn || (opn.kind !== "window" && opn.kind !== "door")) {
      closeOpeningAlongMoveModal();
      return;
    }
    const targetLeftRaw = sess.startLeftEdgeMm + delta;
    const placeKind = opn.kind === "door" ? "door" : "window";
    const left = clampPlacedOpeningLeftEdgeMm(wall, opn.widthMm, targetLeftRaw, p, placeKind);
    const v = validateWindowPlacementOnWall(wall, left, opn.widthMm, p, sess.openingId, {
      openingKind: opn.kind,
    });
    if (!v.ok) {
      setOpeningAlongMoveModal({ ...modal, error: v.reason });
      return;
    }
    st.applyOpeningRepositionLeftEdge(sess.openingId, left, { skipHistory: true });
    closeOpeningAlongMoveModal();
  };

  return (
    <div
      className="ed2d-workspace-root"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        flex: 1,
      }}
    >
      <div ref={hostRef} style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0 }} />
      <div
        className="ed2d-anchor-crosshair-layer"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 3,
          overflow: "hidden",
        }}
      >
        <div
          ref={anchorCrosshairInnerRef}
          className="ed2d-anchor-crosshair"
          data-snap-active="0"
          style={{ visibility: "hidden" }}
        >
          <svg className="ed2d-anchor-crosshair__svg" viewBox="0 0 15 15" width="15" height="15" aria-hidden>
            <line className="ed2d-anchor-crosshair__v" x1="7.5" y1="0.5" x2="7.5" y2="5.5" />
            <line className="ed2d-anchor-crosshair__v" x1="7.5" y1="9.5" x2="7.5" y2="14.5" />
            <line className="ed2d-anchor-crosshair__h" x1="0.5" y1="7.5" x2="5.5" y2="7.5" />
            <line className="ed2d-anchor-crosshair__h" x1="9.5" y1="7.5" x2="14.5" y2="7.5" />
          </svg>
        </div>
      </div>
      {wallContextMenu ? (
        <div
          className="ed2d-wall-ctx"
          style={{ position: "fixed", left: wallContextMenu.clientX, top: wallContextMenu.clientY, zIndex: 50 }}
          role="menu"
          aria-label="Действия со стеной"
        >
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().startWallCopyFromContextMenu(wallContextMenu.wallId)}
          >
            Копировать
          </button>
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().startWallMoveFromContextMenu(wallContextMenu.wallId)}
          >
            Переместить
          </button>
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().deleteWallFromContextMenu(wallContextMenu.wallId)}
          >
            Удалить
          </button>
        </div>
      ) : null}
      {foundationPileContextMenu ? (
        <div
          className="ed2d-fpile-ctx"
          style={{ position: "fixed", left: foundationPileContextMenu.clientX, top: foundationPileContextMenu.clientY, zIndex: 50 }}
          role="menu"
          aria-label="Действия со сваей"
        >
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().startFoundationPileMoveFromContextMenu(foundationPileContextMenu.pileId)}
          >
            Переместить
          </button>
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().startFoundationPileCopyFromContextMenu(foundationPileContextMenu.pileId)}
          >
            Копировать
          </button>
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().deleteFoundationPileFromContextMenu(foundationPileContextMenu.pileId)}
          >
            Удалить
          </button>
        </div>
      ) : null}
      {floorBeamContextMenu ? (
        <div
          className="ed2d-fbeam-ctx ed2d-wall-ctx"
          style={{
            position: "fixed",
            left: floorBeamContextMenu.clientX,
            top: floorBeamContextMenu.clientY,
            zIndex: 50,
          }}
          role="menu"
          aria-label="Действия с балкой перекрытия"
        >
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().startFloorBeamMoveFromContextMenu(floorBeamContextMenu.beamId)}
          >
            Переместить
          </button>
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().startFloorBeamCopyFromContextMenu(floorBeamContextMenu.beamId)}
          >
            Копировать
          </button>
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => useAppStore.getState().deleteFloorBeamFromContextMenu(floorBeamContextMenu.beamId)}
          >
            Удалить
          </button>
        </div>
      ) : null}
      {editor2dSecondaryContextMenu ? (
        <div
          className="ed2d-wall-ctx ed2d-secondary-ctx"
          style={{
            position: "fixed",
            left: editor2dSecondaryContextMenu.clientX,
            top: editor2dSecondaryContextMenu.clientY,
            zIndex: 50,
          }}
          role="menu"
          aria-label="Действия с объектом плана"
        >
          <button
            type="button"
            className="ed2d-wall-ctx__item"
            role="menuitem"
            onClick={() => {
              const st = useAppStore.getState();
              const m = st.editor2dSecondaryContextMenu;
              if (!m) {
                return;
              }
              if (m.scope === "planLine") {
                st.startEntityCopyMode({ kind: "planLine", id: m.id });
              } else if (m.scope === "foundationStrip") {
                st.startEntityCopyMode({ kind: "foundationStrip", id: m.id });
              } else if (m.scope === "slab") {
                st.startEntityCopyMode({ kind: "slab", id: m.id });
              } else {
                st.startEntityCopyMode({ kind: "opening", id: m.id });
              }
              st.closeEditor2dSecondaryContextMenu();
            }}
          >
            Копировать
          </button>
        </div>
      ) : null}
      {wallHint ? (
        <InstructionOverlay
          left={wallHint.left}
          top={wallHint.top}
          lines={wallHint.lines}
          snapLabel={wallHint.snapLabel ?? undefined}
        />
      ) : null}
      {coordHud ? (
        <LiveHudBadge
          left={coordHud.left}
          top={coordHud.top}
          dx={coordHud.dx}
          dy={coordHud.dy}
          d={coordHud.d}
          angleDeg={coordHud.angleDeg}
          angleSnapLockedDeg={coordHud.angleSnapLockedDeg}
          secondLine={coordHud.secondLine}
          inlineEdit={
            coordHudInline
              ? ({
                  field: coordHudInline.field,
                  value: coordHudInline.draft,
                  onChange: (next) =>
                    setCoordHudInline((prev) => (prev ? { ...prev, draft: next } : null)),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const { draft, field, kind } = coordHudInline;
                      const n = parseSignedHudDraftMm(draft);
                      if (n === null) {
                        return;
                      }
                      const st = useAppStore.getState();
                      if (kind === "floorBeamPlacement") {
                        const ok = st.floorBeamPlacementCommitNumericField({ field, valueMm: n });
                        if (!ok) {
                          paintWorkspaceRef.current?.();
                          return;
                        }
                      } else if (kind === "wallMoveCopy") {
                        st.wallMoveCopyApplyNumericPreviewField({ field, valueMm: n });
                      } else if (kind === "floorBeamMoveCopy") {
                        st.floorBeamMoveCopyApplyNumericPreviewField({ field, valueMm: n });
                      } else {
                        st.entityCopyApplyNumericPreviewField({ field, valueMm: n });
                      }
                      setCoordHudInline(null);
                      paintWorkspaceRef.current?.();
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setCoordHudInline(null);
                      return;
                    }
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const mTab = readCoordHudLinearMetricsForInline(coordHudInline.kind);
                      if (!mTab) {
                        return;
                      }
                      const order = ["x", "y", "d"] as const;
                      const i = order.indexOf(coordHudInline.field);
                      const ni = (i + (e.shiftKey ? -1 : 1) + 3) % 3;
                      const nf = order[ni]!;
                      const draftN = nf === "x" ? String(mTab.dx) : nf === "y" ? String(mTab.dy) : String(mTab.d);
                      setCoordHudInline({ ...coordHudInline, field: nf, draft: draftN });
                    }
                  },
                  inputRef: coordHudInlineInputRef,
                } satisfies LiveHudInlineEdit)
              : null
          }
        />
      ) : null}
      {openingMoveDragHud ? (
        <div
          className="ed2d-mini-hud-badge"
          style={{ left: openingMoveDragHud.left, top: openingMoveDragHud.top }}
        >
          Смещение: {openingMoveDragHud.deltaMm >= 0 ? "+" : ""}
          {openingMoveDragHud.deltaMm} мм
        </div>
      ) : null}
      {moveEdit ? (
        <div
          style={{
            position: "absolute",
            left: moveEdit.left,
            top: moveEdit.top,
            zIndex: 20,
            background: "var(--color-surface-raised)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: 6,
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            ref={moveEditInputRef}
            autoFocus
            value={moveEdit.valueStr}
            inputMode="numeric"
            pattern="[0-9]*"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              setMoveEdit({ ...moveEdit, valueStr: e.target.value.replace(/[^\d]/g, ""), error: null })
            }
            onBlur={() => {}}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setMoveEdit(null);
                return;
              }
              if (e.key !== "Enter") return;
              const v = Number(moveEdit.valueStr.replace(",", "."));
              if (!Number.isFinite(v) || v < 0) {
                setMoveEdit({ ...moveEdit, error: "Введите неотрицательное число" });
                return;
              }
              const st = useAppStore.getState();
              const p = st.currentProject;
              const m = openingMoveMetrics(p, moveEdit.openingId);
              if (!m) {
                setMoveEdit({ ...moveEdit, error: "Проём не найден" });
                return;
              }
              const wall = p.walls.find((w0) => w0.id === m.wallId);
              if (!wall) {
                setMoveEdit({ ...moveEdit, error: "Стена не найдена" });
                return;
              }
              const refL = moveEdit.face === "inner" ? m.primaryLeftRefAlongMm : m.outerLeftRefAlongMm;
              const refR = moveEdit.face === "inner" ? m.primaryRightRefAlongMm : m.outerRightRefAlongMm;
              const nextLeft = moveEdit.side === "left" ? v + refL : refR - v - m.widthMm;
              if (nextLeft < m.allowedStartMm - 1e-3 || nextLeft + m.widthMm > m.allowedEndMm + 1e-3) {
                setMoveEdit({ ...moveEdit, error: "Выход за пределы стены" });
                return;
              }
              const ok = st.applyOpeningRepositionLeftEdge(moveEdit.openingId, nextLeft);
              if (!ok) {
                setMoveEdit({ ...moveEdit, error: "Некорректное смещение" });
                return;
              }
              setMoveEdit(null);
            }}
            style={{
              width: 90,
              height: 28,
              padding: "0 6px",
              borderRadius: 4,
              border: "1px solid var(--color-border-subtle)",
              background: "var(--color-surface-default)",
              color: "var(--color-text-primary)",
            }}
          />
          <span style={{ fontSize: 12, opacity: 0.8 }}>мм</span>
          {moveEdit.error ? <span style={{ color: "#ef4444", fontSize: 12 }}>{moveEdit.error}</span> : null}
        </div>
      ) : null}
      {openingAlongMoveModal ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal
            aria-label="Смещение вдоль стены"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: 8,
              padding: "14px 16px",
              minWidth: 300,
              boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Смещение от начала перемещения</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input
                ref={openingAlongMoveInputRef}
                value={openingAlongMoveModal.valueStr}
                inputMode="decimal"
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const t = e.target.value.replace(/,/g, ".");
                  if (t === "" || t === "-" || t === "+") {
                    setOpeningAlongMoveModal({ valueStr: t, error: null });
                    return;
                  }
                  if (/^-?\d*\.?\d*$/.test(t)) {
                    setOpeningAlongMoveModal({ valueStr: t, error: null });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeOpeningAlongMoveModal();
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    applyOpeningAlongMoveModal();
                  }
                }}
                style={{
                  flex: 1,
                  height: 32,
                  padding: "0 8px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border-subtle)",
                  background: "var(--color-surface-default)",
                  color: "var(--color-text-primary)",
                }}
              />
              <span style={{ fontSize: 12, opacity: 0.75 }}>мм</span>
            </div>
            {openingAlongMoveModal.error ? (
              <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 10 }}>{openingAlongMoveModal.error}</div>
            ) : (
              <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 10 }}>
                Отрицательное значение — в сторону начала стены; без привязки к сетке.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="e2dpt-btn" onClick={() => closeOpeningAlongMoveModal()}>
                Отмена
              </button>
              <button type="button" className="e2dpt-btn" onClick={() => applyOpeningAlongMoveModal()}>
                Применить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
