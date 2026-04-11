import { Application, Container, FederatedPointerEvent, Graphics, Text } from "pixi.js";
import { useEffect, useRef, useState } from "react";

import { linearPlacementModeLabelRu } from "@/core/geometry/linearPlacementGeometry";
import { wallPlacementHintMessage } from "@/core/domain/wallPlacement";
import {
  narrowProjectToActiveLayer,
  narrowProjectToLayerSet,
  sortedVisibleContextLayerIds,
} from "@/core/domain/projectLayerSlice";
import { wallJointHintRu } from "@/core/domain/wallJointSession";
import { pickNearestWallEnd, pickWallSegmentInterior } from "@/core/domain/wallJointPick";
import { getProfileById } from "@/core/domain/profileOps";
import { cssHexToPixiNumber } from "@/shared/cssColor";
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
import { computePlacementHudScreenPosition } from "./placementHudPosition";
import { computeMarqueeSelection } from "./computeMarqueeSelection";
import { entityIdsForSelectAll2d } from "./editor2dSelectAll";
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
import { wallWithMovedEndAtLength } from "@/core/domain/wallLengthChangeGeometry";
import type { WallEndSide } from "@/core/domain/wallJoint";
import { drawLengthChangeDragOverlay, drawLengthChangeEndHover } from "./lengthChange2dPixi";

import "./wall-placement-hint.css";
import "./wall-context-menu.css";

import type { OpeningKind } from "@/core/domain/opening";
import type { Project } from "@/core/domain/project";
import { openPlacedOpeningObjectEditorFromHit, openWallObjectEditorFromHit } from "@/features/project/objectEditorActions";

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

function readCanvasColorsFromTheme(): { readonly bg: number; readonly grid: number } {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const bg = cs.getPropertyValue("--color-canvas-bg").trim() || "#14171b";
  const grid = cs.getPropertyValue("--color-grid-line").trim() || "#2a2f36";
  return { bg: cssHexToPixiNumber(bg), grid: cssHexToPixiNumber(grid) };
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
  const wallMoveCopySession = useAppStore((s) => s.wallMoveCopySession);
  const wallContextMenu = useAppStore((s) => s.wallContextMenu);
  const jointHoverRef = useRef<JointHoverState>(null);
  const lengthChangeHoverRef = useRef<{ readonly wallId: string; readonly end: WallEndSide } | null>(null);
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
  const lastOpeningClickRef = useRef<{ readonly id: string; readonly t: number } | null>(null);
  const lastWallClickRef = useRef<{ readonly id: string; readonly t: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  /** Координаты курсора в CSS px относительно контейнера 2D (совпадают с областью canvas). */
  const lastPointerAnchorCrosshairRef = useRef({ inside: false, cssX: 0, cssY: 0, worldX: 0, worldY: 0 });
  const anchorCrosshairInnerRef = useRef<HTMLDivElement>(null);
  const cursorCbRef = useRef(onWorldCursorMm);
  cursorCbRef.current = onWorldCursorMm;

  const [wallHint, setWallHint] = useState<{ readonly left: number; readonly top: number; readonly text: string } | null>(
    null,
  );
  const setWallHintRef = useRef(setWallHint);
  setWallHintRef.current = setWallHint;

  const [coordHud, setCoordHud] = useState<{
    readonly left: number;
    readonly top: number;
    readonly dx: number;
    readonly dy: number;
    readonly d: number;
    readonly angleDeg?: number;
    /** Защёлкнутый угол шага 45° — показываем как точное ∠ без дробной части. */
    readonly angleSnapLockedDeg?: number | null;
    readonly axisHint?: string | null;
  } | null>(null);
  const setCoordHudRef = useRef(setCoordHud);
  setCoordHudRef.current = setCoordHud;
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
    if (!wallPlacementSession) {
      setCoordHud(null);
    }
  }, [wallPlacementSession]);

  useEffect(() => {
    if (!wallMoveCopySession) {
      setCoordHud(null);
    }
  }, [wallMoveCopySession]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".ed2d-wall-ctx")) {
        return;
      }
      useAppStore.getState().closeWallContextMenu();
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
              addWindowModalOpen: stA.addWindowModalOpen,
              addDoorModalOpen: stA.addDoorModalOpen,
              windowEditModal: stA.windowEditModal,
              doorEditModal: stA.doorEditModal,
              wallJointParamsModalOpen: stA.wallJointParamsModalOpen,
              wallCalculationModalOpen: stA.wallCalculationModalOpen,
              wallCoordinateModalOpen: stA.wallCoordinateModalOpen,
              wallAnchorCoordinateModalOpen: stA.wallAnchorCoordinateModalOpen,
              wallMoveCopyCoordinateModalOpen: stA.wallMoveCopyCoordinateModalOpen,
              lengthChangeCoordinateModalOpen: stA.lengthChangeCoordinateModalOpen,
              projectOriginCoordinateModalOpen: stA.projectOriginCoordinateModalOpen,
              openingAlongMoveNumericModalOpen: stA.openingAlongMoveNumericModalOpen,
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
            addWindowModalOpen: st0.addWindowModalOpen,
            addDoorModalOpen: st0.addDoorModalOpen,
            windowEditModal: st0.windowEditModal,
            doorEditModal: st0.doorEditModal,
            wallJointParamsModalOpen: st0.wallJointParamsModalOpen,
            wallCalculationModalOpen: st0.wallCalculationModalOpen,
            wallCoordinateModalOpen: st0.wallCoordinateModalOpen,
            wallAnchorCoordinateModalOpen: st0.wallAnchorCoordinateModalOpen,
            wallMoveCopyCoordinateModalOpen: st0.wallMoveCopyCoordinateModalOpen,
            lengthChangeCoordinateModalOpen: st0.lengthChangeCoordinateModalOpen,
            projectOriginCoordinateModalOpen: st0.projectOriginCoordinateModalOpen,
            openingAlongMoveNumericModalOpen: st0.openingAlongMoveNumericModalOpen,
          })
        ) {
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
            useAppStore.getState().clearPendingWindowPlacement();
          } else {
            useAppStore.getState().clearPendingDoorPlacement();
          }
          windowPlacementHoverRef.current = null;
          setWallHintRef.current(null);
          return;
        }
        const stEsc = useAppStore.getState();
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
        if (!st.wallPlacementSession || st.wallPlacementSession.phase !== "waitingSecondPoint") {
          return;
        }
        e.preventDefault();
        st.openWallCoordinateModal();
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
      activeToolCrosshair === "line" ||
      activeToolCrosshair === "ruler"
    ) {
      el.style.cursor = "crosshair";
    } else {
      el.style.cursor = "";
    }
  }, [pendingWindowPlacement, pendingDoorPlacement, projectOriginMoveToolActive, activeToolCrosshair]);

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
      text: "База плана (0,0): клик — новая точка · Пробел — ввод XY (мир) · Esc — выход",
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
    const wallsG = new Graphics();
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
    const windowPlacementG = new Graphics();
    windowPlacementG.eventMode = "none";
    const previewG = new Graphics();
    const lengthChangeG = new Graphics();
    lengthChangeG.eventMode = "none";
    const snapMarkerG = new Graphics();
    const rulerG = new Graphics();
    rulerG.eventMode = "none";
    const lineG = new Graphics();
    lineG.eventMode = "none";
    const marqueeG = new Graphics();
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
      const firstPh =
        ws && (ws.phase === "waitingFirstWallPoint" || ws.phase === "waitingOriginAndFirst");
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
      const show =
        (wallPickCrosshair || rulerShow || lineToolShow || lengthChangeShow) &&
        !panning.active &&
        !marquee &&
        lastPointerAnchorCrosshairRef.current.inside;

      if (!show) {
        inner.style.visibility = "hidden";
        if (anchorCrosshairShown) {
          anchorCrosshairShown = false;
          if (!panning.active && !st.openingMoveModeActive) {
            applyAnchorCrosshairCursorTargets(canvas, "");
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

      if (rulerShow) {
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
      } else {
        const sc = worldToScreen(last.worldX, last.worldY, t);
        centerRx = sc.x;
        centerRy = sc.y;
      }

      const cssX = centerRx * scaleX;
      const cssY = centerRy * scaleY;

      let snapActive = false;
      if (wallPickCrosshair && ws) {
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
      }
      inner.dataset["snapActive"] = snapActive ? "1" : "0";

      inner.style.visibility = "visible";
      inner.style.transform = `translate3d(${cssX}px, ${cssY}px, 0) translate(-50%, -50%)`;
      applyAnchorCrosshairCursorTargets(canvas, "none");
      anchorCrosshairShown = true;
    };

    const paint = () => {
      paintWorkspaceRef.current = paint;
      const app = appRef.current;
      if (!app) {
        return;
      }
      const { currentProject, viewport2d, selectedEntityIds, wallPlacementSession } = useAppStore.getState();
      const w = app.renderer.width;
      const h = app.renderer.height;
      const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
      const { bg: canvasBg, grid: GRID_COLOR } = readCanvasColorsFromTheme();
      if (app.renderer.background) {
        app.renderer.background.color = canvasBg;
      }
      const selected = new Set(selectedEntityIds);
      const contextIds = sortedVisibleContextLayerIds(currentProject);
      const show2dLayers = currentProject.viewState.show2dProfileLayers !== false;

      gridG.clear();
      if (currentProject.settings.showGrid) {
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
          gridG.stroke({ width: 1, color: GRID_COLOR, alpha: 0.65 });
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
      const layerView = narrowProjectToActiveLayer(currentProject);
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
          const wLc = layerLc.walls.find((w0) => w0.id === lcPaint.wallId);
          if (wLc) {
            const dx = lcPaint.previewMovingMm.x - lcPaint.fixedEndMm.x;
            const dy = lcPaint.previewMovingMm.y - lcPaint.fixedEndMm.y;
            const Lcur = dx * lcPaint.axisUx + dy * lcPaint.axisUy;
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
          }
        } else {
          const h = lengthChangeHoverRef.current;
          if (h) {
            const wH = layerLc.walls.find((w0) => w0.id === h.wallId);
            if (wH) {
              drawLengthChangeEndHover(lengthChangeG, wH, h.end, t);
            }
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
          rulerG.stroke({ width: 1.25, color: RULER_STROKE, alpha: 0.92 });
          rulerG.circle(s0.x, s0.y, 3.5);
          rulerG.fill({ color: RULER_STROKE, alpha: 0.88 });
          rulerG.stroke({ width: 1, color: RULER_STROKE, alpha: 0.95 });
          rulerG.circle(s1.x, s1.y, 3.5);
          rulerG.fill({
            color: RULER_STROKE,
            alpha: rSess.phase === "stretching" ? 0.42 : 0.88,
          });
          rulerG.stroke({ width: 1, color: RULER_STROKE, alpha: 0.95 });
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
        snapMarkerG.circle(scR.x, scR.y, 7);
        snapMarkerG.stroke({ width: 2, color: colR, alpha: 0.95 });
        snapMarkerG.circle(scR.x, scR.y, 2);
        snapMarkerG.fill({ color: colR, alpha: 0.95 });
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
      worldRoot.addChild(wallsG);
      worldRoot.addChild(planLinesG);
      worldRoot.addChild(wallCalcG);
      worldRoot.addChild(wallCalcLabelC);
      worldRoot.addChild(openingsG);
      worldRoot.addChild(wallLabelsC);
      worldRoot.addChild(windowOpeningLabelsC);
      worldRoot.addChild(dimensionsG);
      worldRoot.addChild(dimensionsLabelC);
      worldRoot.addChild(openingMoveG);
      worldRoot.addChild(openingMoveLabelC);
      worldRoot.addChild(jointPickG);
      worldRoot.addChild(windowPlacementG);
      worldRoot.addChild(previewG);
      worldRoot.addChild(lengthChangeG);
      worldRoot.addChild(snapMarkerG);
      worldRoot.addChild(rulerG);
      worldRoot.addChild(lineG);
      worldRoot.addChild(marqueeG);
      worldRoot.addChild(originMarkerC);
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
          wallMoveCopySession,
          currentProject,
          wallJointSession,
          wallCoordinateModalOpen,
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

        if (coordBlock) {
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        } else {
          const rect = canvas.getBoundingClientRect();
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
            canvas.style.cursor = "";
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
            const hudWin = computePlacementHudScreenPosition({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
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
                left: hudWin.hintLeft,
                top: hudWin.hintTop,
                text: "Установка двери\nНаправление открывания — положение курсора относительно стены\nЛКМ — зафиксировать · Esc / ПКМ — отмена",
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
                    left: hudWin.hintLeft,
                    top: hudWin.hintTop,
                    text: `${op.kind === "door" ? "Установка двери" : "Установка окна"}\n${hintExtra}`,
                  });
                }
              } else {
                setWallHintRef.current({
                  left: hudWin.hintLeft,
                  top: hudWin.hintTop,
                  text: "Установка проёма\nНаведите курсор на стену активного слоя",
                });
              }
            }
            setCoordHudRef.current(null);
            paint();
          } else if (activeTool === "changeLength") {
            const storeLc = useAppStore.getState();
            const lenSess = storeLc.lengthChange2dSession;
            const lenModal = storeLc.lengthChangeCoordinateModalOpen;
            const hudLc = computePlacementHudScreenPosition({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              wallCoordinateModalOpen: false,
              lengthChangeCoordinateModalOpen: lenModal,
              showCoordHud: false,
            });
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
              let snapLine = "";
              if (s2.lastSnapKind && s2.lastSnapKind !== "none") {
                snapLine =
                  s2.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : s2.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const errLine = useAppStore.getState().lastError ? `\n${useAppStore.getState().lastError}` : "";
              const shiftLen = s2.shiftDirectionLockUnit
                ? `${s2.shiftLockReferenceMm ? "\nShift: длина по опорной точке (проекция на ось)" : "\nНаправление зафиксировано (Shift)"}\nAlt — временно без усиленной привязки`
                : "\nShift — зафиксировать ось и дотянуть по привязке";
              setWallHintRef.current({
                left: hudLc.hintLeft,
                top: hudLc.hintTop,
                text: `Изменение длины\nΔ = ${dMm >= 0 ? "+" : ""}${dMm} мм\nНовая длина = ${Lround} мм\nЛКМ — применить · Esc — отмена · Пробел — Δ (мм)${snapLine ? `\n${snapLine}` : ""}${shiftLen}${errLine}`,
              });
              lengthChangeHoverRef.current = null;
            } else if (!lenModal) {
              const hitEnd = pickNearestWallEnd(p, layerLc.walls, endTol);
              lengthChangeHoverRef.current = hitEnd ? { wallId: hitEnd.wallId, end: hitEnd.end } : null;
              setWallHintRef.current({
                left: hudLc.hintLeft,
                top: hudLc.hintTop,
                text: "Выберите сторону",
              });
            }
            setCoordHudRef.current(null);
            paint();
          } else if (activeTool === "ruler" && ruler2dSession) {
            const rs = ruler2dSession;
            const hudRm = computePlacementHudScreenPosition({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            if (rs.phase === "stretching" && rs.firstMm) {
              const altKey = Boolean((ev as { altKey?: boolean }).altKey);
              useAppStore.getState().ruler2dPreviewMove(p, t, { altKey });
              const rs2 = useAppStore.getState().ruler2dSession;
              const end = rs2?.previewEndMm;
              const first = rs2?.firstMm;
              if (end && first) {
                const dx = Math.round(end.x - first.x);
                const dy = Math.round(end.y - first.y);
                const d = Math.round(Math.hypot(dx, dy));
                const sh = rs2?.shiftDirectionLockUnit
                  ? rs2.shiftLockReferenceMm
                    ? "\nУгол по Shift · длина по опорной точке"
                    : "\nУгол зафиксирован (Shift)"
                  : "\nShift — зафиксировать направление";
                setWallHintRef.current({
                  left: hudRm.hintLeft,
                  top: hudRm.hintTop,
                  text: `Линейка\nX = ${dx}, Y = ${dy}, D = ${d}\nAlt — без угловой привязки${sh}`,
                });
              }
            } else if (rs.phase === "pickFirst") {
              setWallHintRef.current({
                left: hudRm.hintLeft,
                top: hudRm.hintTop,
                text: "Линейка\nВыберите первую точку",
              });
            } else if (rs.phase === "done" && rs.firstMm && rs.secondMm) {
              const dx = Math.round(rs.secondMm.x - rs.firstMm.x);
              const dy = Math.round(rs.secondMm.y - rs.firstMm.y);
              const d = Math.round(Math.hypot(dx, dy));
              setWallHintRef.current({
                left: hudRm.hintLeft,
                top: hudRm.hintTop,
                text: `Линейка\nX = ${dx}, Y = ${dy}, D = ${d}\nЛКМ — новый замер · Esc — сброс`,
              });
            }
            setCoordHudRef.current(null);
            paint();
          } else if (activeTool === "line" && line2dSession) {
            const ls = line2dSession;
            const hudLn = computePlacementHudScreenPosition({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            if (ls.phase === "stretching" && ls.firstMm) {
              const altKeyLn = Boolean((ev as { altKey?: boolean }).altKey);
              useAppStore.getState().line2dPreviewMove(p, t, { altKey: altKeyLn });
              const ls2 = useAppStore.getState().line2dSession;
              const endLn = ls2?.previewEndMm;
              const firstLn = ls2?.firstMm;
              if (endLn && firstLn) {
                const dx = Math.round(endLn.x - firstLn.x);
                const dy = Math.round(endLn.y - firstLn.y);
                const d = Math.round(Math.hypot(dx, dy));
                let snapLineLn = "";
                if (ls2?.lastSnapKind && ls2.lastSnapKind !== "none") {
                  snapLineLn =
                    ls2.lastSnapKind === "vertex"
                      ? "\nПривязка: угол"
                      : ls2.lastSnapKind === "edge"
                        ? "\nПривязка: линия"
                        : "\nПривязка: сетка";
                }
                const shLn = ls2?.shiftDirectionLockUnit
                  ? ls2.shiftLockReferenceMm
                    ? "\nShift: проекция на зафиксированное направление"
                    : "\nНаправление зафиксировано (Shift)"
                  : "\nShift — зафиксировать направление";
                const errLn = useAppStore.getState().lastError ? `\n${useAppStore.getState().lastError}` : "";
                setWallHintRef.current({
                  left: hudLn.hintLeft,
                  top: hudLn.hintTop,
                  text: `Линия\nX = ${dx}, Y = ${dy}, D = ${d} мм\nЛКМ — зафиксировать конец · Esc — отмена${snapLineLn}\nAlt — без угловой привязки${shLn}${errLn}`,
                });
              }
            } else if (ls.phase === "pickFirst") {
              setWallHintRef.current({
                left: hudLn.hintLeft,
                top: hudLn.hintTop,
                text: "Линия\nПервая точка — ЛКМ",
              });
            }
            setCoordHudRef.current(null);
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
              let snapLine = "";
              if (ws?.lastSnapKind && ws.lastSnapKind !== "none") {
                snapLine =
                  ws.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : ws.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const hud = computePlacementHudScreenPosition({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                wallCoordinateModalOpen,
                wallAnchorCoordinateModalOpen: wallAnchorCoordOpen,
                showCoordHud: !coordModalAny,
              });
              const shiftHint = ws?.shiftDirectionLockUnit
                ? ws.shiftLockReferenceMm
                  ? "\nУгол по Shift · длина по опорной точке (проекция)"
                  : "\nУгол зафиксирован (Shift) — отпустите для свободного режима"
                : "\nShift — зафиксировать направление";
              setWallHintRef.current({
                left: hud.hintLeft,
                top: hud.hintTop,
                text: `${wallPlacementHintMessage(wallPlacementSession.phase)}\n${modeLabel}${snapLine ? `\n${snapLine}` : ""}\nAlt — без угловой привязки${shiftHint}`,
              });
              if (ws?.firstPointMm && ws.previewEndMm && hud.coordHudLeft != null && hud.coordHudTop != null) {
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
                  left: hud.coordHudLeft,
                  top: hud.coordHudTop,
                  dx,
                  dy,
                  d,
                  angleDeg: angleShiftDeg != null ? angleShiftDeg : locked != null ? locked : rel2.angleDeg,
                  angleSnapLockedDeg: locked,
                  axisHint: rel2.axisHint,
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
              const hudA = computePlacementHudScreenPosition({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
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
              const altHint = am ? "\nAlt — без угловой привязки" : "";
              const snapLineAnchor = snapA || snapPickAnchor;
              setWallHintRef.current({
                left: hudA.hintLeft,
                top: hudA.hintTop,
                text: `Точка привязки\n${hintTitle}\n${modeLabel}${snapLineAnchor ? `\n${snapLineAnchor}` : ""}${altHint}`,
              });
              if (am && ap && hudA.coordHudLeft != null && hudA.coordHudTop != null) {
                const rel = computeAnchorRelativeHud(am.x, am.y, ap.x, ap.y);
                const lockedA = stA.wallPlacementAnchorAngleSnapLockedDeg ?? null;
                setCoordHudRef.current({
                  left: hudA.coordHudLeft,
                  top: hudA.coordHudTop,
                  dx: rel.dx,
                  dy: rel.dy,
                  d: rel.d,
                  angleDeg: lockedA != null ? lockedA : rel.angleDeg,
                  angleSnapLockedDeg: lockedA,
                  axisHint: rel.axisHint,
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
              const hud = computePlacementHudScreenPosition({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                wallCoordinateModalOpen,
                wallAnchorCoordinateModalOpen: wallAnchorCoordOpen,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: hud.hintLeft,
                top: hud.hintTop,
                text: `${wallPlacementHintMessage(wallPlacementSession.phase)}\n${modeLabel}${snapLineFirst ? `\n${snapLineFirst}` : ""}`,
              });
              setCoordHudRef.current(null);
            }
          } else if (wallMoveCopySession) {
            const stMc = useAppStore.getState();
            const wm = stMc.wallMoveCopySession;
            const moveCopyCoordOpen = stMc.wallMoveCopyCoordinateModalOpen;
            const modeLabel = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
            const title = wm?.mode === "copy" ? "Копирование стены" : "Перенос стены";
            if (wm?.phase === "pickTarget" && wm.anchorWorldMm) {
              const altKey = Boolean((ev as { altKey?: boolean }).altKey);
              useAppStore.getState().wallMoveCopyPreviewMove(p, t, { altKey });
              const ws = useAppStore.getState().wallMoveCopySession;
              let snapLine = "";
              if (ws?.lastSnapKind && ws.lastSnapKind !== "none") {
                snapLine =
                  ws.lastSnapKind === "vertex"
                    ? "Привязка: угол"
                    : ws.lastSnapKind === "edge"
                      ? "Привязка: линия"
                      : "Привязка: сетка";
              }
              const coordModalAny = wallCoordinateModalOpen || moveCopyCoordOpen;
              const hud = computePlacementHudScreenPosition({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                wallCoordinateModalOpen,
                wallMoveCopyCoordinateModalOpen: moveCopyCoordOpen,
                showCoordHud: !coordModalAny,
              });
              const shiftMc =
                ws?.shiftDirectionLockUnit != null
                  ? ws.shiftLockReferenceMm
                    ? "\nУгол по Shift · длина по опорной точке"
                    : "\nУгол зафиксирован (Shift)"
                  : "\nShift — зафиксировать направление";
              setWallHintRef.current({
                left: hud.hintLeft,
                top: hud.hintTop,
                text: `${title}\nУкажите новое положение (ЛКМ) или Пробел — координаты\n${modeLabel}${snapLine ? `\n${snapLine}` : ""}\nAlt — без угловой привязки${shiftMc}`,
              });
              if (ws?.anchorWorldMm && ws.previewTargetMm && hud.coordHudLeft != null && hud.coordHudTop != null) {
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
                  left: hud.coordHudLeft,
                  top: hud.coordHudTop,
                  dx,
                  dy,
                  d,
                  angleDeg: angS != null ? angS : locked != null ? locked : rel2.angleDeg,
                  angleSnapLockedDeg: locked,
                  axisHint: rel2.axisHint,
                });
              } else {
                setCoordHudRef.current(null);
              }
            } else {
              const hud = computePlacementHudScreenPosition({
                canvasRect: rect,
                cursorCanvasX: ev.global.x,
                cursorCanvasY: ev.global.y,
                wallCoordinateModalOpen,
                wallMoveCopyCoordinateModalOpen: moveCopyCoordOpen,
                showCoordHud: false,
              });
              setWallHintRef.current({
                left: hud.hintLeft,
                top: hud.hintTop,
                text: `${title}\nВыберите точку привязки на стене (ЛКМ)\n${modeLabel}`,
              });
              setCoordHudRef.current(null);
            }
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
            const hudJoint = computePlacementHudScreenPosition({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: hudJoint.hintLeft,
              top: hudJoint.hintTop,
              text: wallJointHintRu(wallJointSession.kind, wallJointSession.phase),
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
            useAppStore.getState().clearPendingWindowPlacement();
          } else {
            useAppStore.getState().clearPendingDoorPlacement();
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
          const hitEnd = pickNearestWallEnd(worldMm, layerLc.walls, endTol);
          if (hitEnd) {
            useAppStore.getState().startLengthChange2dSession(hitEnd.wallId, hitEnd.end, worldMm, t);
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
          !useAppStore.getState().pendingWindowPlacement &&
          !useAppStore.getState().pendingDoorPlacement &&
          !useAppStore.getState().wallMoveCopySession
        ) {
          ev.preventDefault();
          const cpRm = useAppStore.getState().currentProject;
          const layerRm = narrowProjectToActiveLayer(cpRm);
          const wallTolRm = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
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
          !useAppStore.getState().pendingWindowPlacement &&
          !useAppStore.getState().pendingDoorPlacement &&
          !useAppStore.getState().wallMoveCopySession
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
          style={{ left: wallContextMenu.clientX, top: wallContextMenu.clientY }}
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
      {wallHint ? (
        <div className="ed2d-wall-hint" style={{ left: wallHint.left, top: wallHint.top }}>
          {wallHint.text}
        </div>
      ) : null}
      {coordHud ? (
        <div
          className={
            coordHud.angleSnapLockedDeg != null
              ? "ed2d-wall-coord-hud ed2d-wall-coord-hud--angle-snap"
              : "ed2d-wall-coord-hud"
          }
          style={{ left: coordHud.left, top: coordHud.top }}
        >
          X={Math.round(coordHud.dx)} · Y={Math.round(coordHud.dy)} · D={Math.round(coordHud.d)}
          {coordHud.angleDeg != null ? ` · ∠${Math.round(coordHud.angleDeg)}°` : null}
          {coordHud.axisHint ? ` · ${coordHud.axisHint}` : null}
        </div>
      ) : null}
      {openingMoveDragHud ? (
        <div
          className="ed2d-wall-hint"
          style={{
            position: "fixed",
            left: openingMoveDragHud.left,
            top: openingMoveDragHud.top,
            zIndex: 24,
            pointerEvents: "none",
          }}
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
