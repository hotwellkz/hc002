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
import { useUiThemeStore } from "@/store/useUiThemeStore";

import { computeAnchorRelativeHud } from "@/core/geometry/anchorPlacementHud";
import { resolveSnap2d } from "@/core/geometry/snap2d";
import { getResolvedShortcutCodes } from "@/shared/editorToolShortcuts/resolveEditorShortcutCodes";
import { shouldIgnoreWorkspaceEscape } from "@/shared/editorToolShortcuts/shouldIgnoreEditorToolHotkeys";
import { isSceneCoordinateModalBlocking } from "@/shared/sceneCoordinateModalLock";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";
import { computePlacementHudScreenPosition } from "./placementHudPosition";
import { computeMarqueeSelection } from "./computeMarqueeSelection";
import { drawRectangleWallPlacementPreview, drawWallPlacementPreview } from "./drawWallPreview2d";
import { buildScreenGridLines } from "./gridGeometry";
import { appendWallMarkLabels2d, clearWallMarkLabelContainer } from "./wallMarks2dPixi";
import { drawWallJointPickOverlay, type JointHoverState } from "./wallJointMarkers2dPixi";
import { drawDimensions2d } from "./dimensions2dPixi";
import { drawOpeningFramingPlan2d } from "./openingFramingPlan2dPixi";
import { drawWallCalculationOverlay2d } from "./wallCalculation2dPixi";
import { appendWallLumberLabels2d } from "./wallLumberLabels2dPixi";
import { drawWindowPlacementPreview2d } from "./drawWindowPlacementPreview2d";
import { drawWallsAndOpenings2d } from "./walls2dPixi";
import { appendWindowOpeningLabels2d } from "./windowOpeningLabels2dPixi";
import { appendDoorOpeningLabels2d } from "./doorOpeningLabels2dPixi";
import { buildViewportTransform, screenToWorld, worldToScreen } from "./viewportTransforms";
import {
  clampOpeningLeftEdgeMm,
  clampPlacedOpeningLeftEdgeMm,
  offsetFromStartForCursorCentered,
  pickClosestWallAlongPoint,
  pickPlacedOpeningOnLayerSlice,
  projectWorldToAlongMm,
  openingWallEndMarginAlongMm,
  snapOpeningLeftEdgeMm,
  validateWindowPlacementOnWall,
} from "@/core/domain/openingWindowGeometry";
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
  readonly leftGapMm: number;
  readonly rightGapMm: number;
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
  const right = o.offsetFromStartMm + o.widthMm;
  return {
    openingId: o.id,
    wallId: wall.id,
    leftEdgeMm: left,
    widthMm: o.widthMm,
    wallStartMm: 0,
    wallEndMm: L,
    allowedStartMm,
    allowedEndMm,
    leftGapMm: Math.max(0, left),
    rightGapMm: Math.max(0, L - right),
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

  const pendingWindowPlacement = useAppStore((s) => s.pendingWindowPlacement);
  const pendingDoorPlacement = useAppStore((s) => s.pendingDoorPlacement);
  const openingMoveModeActive = useAppStore((s) => s.openingMoveModeActive);
  const selectedIds = useAppStore((s) => s.selectedEntityIds);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) {
      return;
    }
    if (pendingWindowPlacement || pendingDoorPlacement) {
      el.style.cursor = "crosshair";
    } else {
      el.style.cursor = "";
    }
  }, [pendingWindowPlacement, pendingDoorPlacement]);

  useEffect(() => {
    if (!openingMoveModeActive || selectedIds.length !== 1) {
      setMoveEdit(null);
    }
  }, [openingMoveModeActive, selectedIds]);

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
    const marqueeG = new Graphics();
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
      const anchorShow =
        st.wallAnchorPlacementModeActive &&
        Boolean(firstPh) &&
        !st.wallCoordinateModalOpen &&
        !st.wallAnchorCoordinateModalOpen &&
        !st.openingMoveModeActive;
      const rulerShow = st.activeTool === "ruler" && st.ruler2dSession != null && !st.openingMoveModeActive;
      const lengthChangeShow =
        st.activeTool === "changeLength" &&
        !st.openingMoveModeActive &&
        !st.lengthChangeCoordinateModalOpen;
      const show =
        (anchorShow || rulerShow || lengthChangeShow) &&
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
      } else {
        const am = st.wallPlacementAnchorMm;
        const ap = st.wallPlacementAnchorPreviewEndMm;
        if (am && ap) {
          const sc = worldToScreen(ap.x, ap.y, t);
          centerRx = sc.x;
          centerRy = sc.y;
        } else if (!am) {
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
        } else {
          const sc = worldToScreen(last.worldX, last.worldY, t);
          centerRx = sc.x;
          centerRy = sc.y;
        }
      }

      const cssX = centerRx * scaleX;
      const cssY = centerRy * scaleY;

      inner.style.visibility = "visible";
      inner.style.transform = `translate3d(${cssX}px, ${cssY}px, 0) translate(-50%, -50%)`;
      applyAnchorCrosshairCursorTargets(canvas, "none");
      anchorCrosshairShown = true;
    };

    const paint = () => {
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
        const lines = buildScreenGridLines(w, h, t, currentProject.settings.gridStepMm);
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
              const chainShiftMm = 36 / t.zoomPixelsPerMm;
              const outerLeftMm = m.leftGapMm;
              const outerRightMm = m.rightGapMm;
              const innerLeftMm = Math.max(0, outerLeftMm - wall.thicknessMm);
              const innerRightMm = Math.max(0, outerRightMm - wall.thicknessMm);
              const faceGeom = (face: "inner" | "outer") => {
                const faceSign = face === "inner" ? innerSign : -innerSign;
                const baseOff = faceSign * halfT;
                const thickness = Math.max(0, wall.thicknessMm);
                const openStart = m.leftEdgeMm;
                const openEnd = m.leftEdgeMm + m.widthMm;
                const faceStartAlong = face === "inner" ? Math.min(openStart, thickness) : 0;
                const faceEndAlong = face === "inner" ? Math.max(openEnd, L - thickness) : L;
                const pBase = { x: wall.start.x + nx * baseOff, y: wall.start.y + ny * baseOff };
                const pStart = { x: pBase.x + ux * faceStartAlong, y: pBase.y + uy * faceStartAlong };
                const pEnd = { x: pBase.x + ux * faceEndAlong, y: pBase.y + uy * faceEndAlong };
                const pOpenStart = { x: pBase.x + ux * openStart, y: pBase.y + uy * openStart };
                const pOpenEnd = { x: pBase.x + ux * openEnd, y: pBase.y + uy * openEnd };
                const nOut = faceSign * (faceShiftMm + chainShiftMm);
                const shift = (p: { x: number; y: number }) => ({ x: p.x + nx * nOut, y: p.y + ny * nOut });
                return {
                  left0: worldToScreen(shift(pStart).x, shift(pStart).y, t),
                  left1: worldToScreen(shift(pOpenStart).x, shift(pOpenStart).y, t),
                  right0: worldToScreen(shift(pOpenEnd).x, shift(pOpenEnd).y, t),
                  right1: worldToScreen(shift(pEnd).x, shift(pEnd).y, t),
                };
              };
              const inner = faceGeom("inner");
              const outer = faceGeom("outer");
              const drawDim = (
                s0: { x: number; y: number },
                s1: { x: number; y: number },
                anchor: MoveDimSide,
                face: "inner" | "outer",
                valueMm: number,
              ) => {
                openingMoveG.moveTo(s0.x, s0.y);
                openingMoveG.lineTo(s1.x, s1.y);
                openingMoveG.stroke({ width: 1, color: dimLineCol, alpha: 0.95, cap: "butt" });
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
                    openingMoveG.stroke({ width: 1, color: dimLineCol, alpha: 0.95, cap: "butt" });
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
                    fontSize: DIMENSION_FONT_SIZE_PX,
                    fontWeight: "400",
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
                  openingMoveG.stroke({ width: 1, color: dimLineCol, alpha: 0.95, cap: "butt" });
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
              drawDim(inner.left0, inner.left1, "left", "inner", innerLeftMm);
              drawDim(outer.left0, outer.left1, "left", "outer", outerLeftMm);
              drawDim(inner.right0, inner.right1, "right", "inner", innerRightMm);
              drawDim(outer.right0, outer.right1, "right", "outer", outerRightMm);
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
      const pend = useAppStore.getState().pendingWindowPlacement ?? useAppStore.getState().pendingDoorPlacement;
      const hoverWin = windowPlacementHoverRef.current;
      if (pend && hoverWin) {
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
        if (wallPlacementSession.angleSnapLockedDeg != null) {
          const f = wallPlacementSession.firstPointMm;
          const e = wallPlacementSession.previewEndMm;
          const a = worldToScreen(f.x, f.y, t);
          const b = worldToScreen(e.x, e.y, t);
          previewG.moveTo(a.x, a.y);
          previewG.lineTo(b.x, b.y);
          previewG.stroke({ width: 1.75, color: 0x34d399, alpha: 0.55 });
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
          if (wmPaint.angleSnapLockedDeg != null) {
            const f = wmPaint.anchorWorldMm;
            const e = wmPaint.previewTargetMm;
            const a = worldToScreen(f.x, f.y, t);
            const b = worldToScreen(e.x, e.y, t);
            previewG.moveTo(a.x, a.y);
            previewG.lineTo(b.x, b.y);
            previewG.stroke({ width: 1.75, color: 0x34d399, alpha: 0.55 });
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
      if (
        wallPlacementSession?.phase === "waitingSecondPoint" &&
        wallPlacementSession.previewEndMm &&
        wallPlacementSession.lastSnapKind &&
        wallPlacementSession.lastSnapKind !== "none"
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
        const pW = wmPaint.previewTargetMm;
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
        stPaint.lengthChange2dSession.lastSnapKind &&
        stPaint.lengthChange2dSession.lastSnapKind !== "none"
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
      }

      if (
        toolPaint === "ruler" &&
        rSess?.phase === "stretching" &&
        rSess.previewEndMm &&
        rSess.lastSnapKind &&
        rSess.lastSnapKind !== "none"
      ) {
        const skR = rSess.lastSnapKind;
        const pR = rSess.previewEndMm;
        const scR = worldToScreen(pR.x, pR.y, t);
        const colR = skR === "vertex" ? 0x5cff8a : skR === "edge" ? 0x5ab4ff : 0xffc857;
        snapMarkerG.circle(scR.x, scR.y, 7);
        snapMarkerG.stroke({ width: 2, color: colR, alpha: 0.95 });
        snapMarkerG.circle(scR.x, scR.y, 2);
        snapMarkerG.fill({ color: colR, alpha: 0.95 });
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
      worldRoot.addChild(marqueeG);
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
              const wallTol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
              const hitWall = pickClosestWallAlongPoint(wClick, layerView.walls, wallTol);
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
          if (!opSess.dragActive && distPx >= OPENING_DRAG_THRESHOLD_PX) {
            opSess.dragActive = true;
            lastOpeningClickRef.current = null;
          }
          if (opSess.dragActive) {
            const proj = useAppStore.getState().currentProject;
            const wall = proj.walls.find((x) => x.id === opSess.wallId);
            const opn = proj.openings.find((x) => x.id === opSess.openingId);
            if (wall && opn && (opSess.kind === "window" || opSess.kind === "door")) {
              const along = projectWorldToAlongMm(wall, p);
              const rawLeft = offsetFromStartForCursorCentered(along, opn.widthMm);
              const left = clampOpeningLeftEdgeMm(wall, opn.widthMm, rawLeft, proj);
              const v = validateWindowPlacementOnWall(wall, left, opn.widthMm, proj, opSess.openingId, {
                openingKind: opSess.kind,
              });
              if (v.ok) {
                useAppStore.getState().applyOpeningRepositionLeftEdge(opSess.openingId, left);
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
          } else if (!panning.active && activeTool !== "ruler" && activeTool !== "changeLength") {
            canvas.style.cursor = "";
          }
          const pend = useAppStore.getState().pendingWindowPlacement ?? useAppStore.getState().pendingDoorPlacement;
          if (pend) {
            windowPlacementHoverRef.current = null;
            const layerView = narrowProjectToActiveLayer(currentProject);
            const walls = layerView.walls;
            const tol = Math.max(14, 22 / viewport2d.zoomPixelsPerMm);
            const op = currentProject.openings.find((o) => o.id === pend.openingId);
            const hudWin = computePlacementHudScreenPosition({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            if (op) {
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
                  const hintExtra = v.ok ? "ЛКМ — установить · Esc / ПКМ — отмена" : v.reason;
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
              useAppStore.getState().lengthChange2dPreviewMove(p, t);
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
              setWallHintRef.current({
                left: hudLc.hintLeft,
                top: hudLc.hintTop,
                text: `Изменение длины\nΔ = ${dMm >= 0 ? "+" : ""}${dMm} мм\nНовая длина = ${Lround} мм\nЛКМ — применить · Esc — отмена · Пробел — Δ (мм)${snapLine ? `\n${snapLine}` : ""}${errLine}`,
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
                setWallHintRef.current({
                  left: hudRm.hintLeft,
                  top: hudRm.hintTop,
                  text: `Линейка\nX = ${dx}, Y = ${dy}, D = ${d}\nAlt — без угловой привязки`,
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
              setWallHintRef.current({
                left: hud.hintLeft,
                top: hud.hintTop,
                text: `${wallPlacementHintMessage(wallPlacementSession.phase)}\n${modeLabel}${snapLine ? `\n${snapLine}` : ""}\nAlt — без угловой привязки`,
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
                setCoordHudRef.current({
                  left: hud.coordHudLeft,
                  top: hud.coordHudTop,
                  dx,
                  dy,
                  d,
                  angleDeg: locked != null ? locked : rel2.angleDeg,
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
              const hintTitle = am
                ? "Укажите начало стены (ЛКМ) или Пробел — координаты"
                : "Выберите первую точку";
              const altHint = am ? "\nAlt — без угловой привязки" : "";
              setWallHintRef.current({
                left: hudA.hintLeft,
                top: hudA.hintTop,
                text: `Точка привязки\n${hintTitle}\n${modeLabel}${snapA ? `\n${snapA}` : ""}${altHint}`,
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
                text: `${wallPlacementHintMessage(wallPlacementSession.phase)}\n${modeLabel}`,
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
              setWallHintRef.current({
                left: hud.hintLeft,
                top: hud.hintTop,
                text: `${title}\nУкажите новое положение (ЛКМ) или Пробел — координаты\n${modeLabel}${snapLine ? `\n${snapLine}` : ""}\nAlt — без угловой привязки`,
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
                setCoordHudRef.current({
                  left: hud.coordHudLeft,
                  top: hud.coordHudTop,
                  dx,
                  dy,
                  d,
                  angleDeg: locked != null ? locked : rel2.angleDeg,
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
          (activeTool === "select" || activeTool === "ruler") &&
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
            openingPointerRef.current = {
              openingId: hitOp.id,
              wallId: hitOp.wallId,
              kind: hitOp.kind,
              sx: ev.global.x,
              sy: ev.global.y,
              pointerId: ev.pointerId,
              dragActive: false,
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
          const wallHit = pickClosestWallAlongPoint(worldMm, layerView.walls, Math.max(14, 22 / viewport2d.zoomPixelsPerMm));
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
          openingPointerRef.current = null;
          try {
            canvas.releasePointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
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
            const proj = useAppStore.getState().currentProject;
            const o = proj.openings.find((x) => x.id === opPtr.openingId);
            const wall = proj.walls.find((w) => w.id === opPtr.wallId);
            if ((opPtr.kind === "window" || opPtr.kind === "door") && o && wall && o.offsetFromStartMm != null) {
              const snapped = snapOpeningLeftEdgeMm(
                wall,
                o.widthMm,
                o.offsetFromStartMm,
                proj.settings.gridStepMm,
                proj.settings.editor2d.snapToGrid,
                proj,
              );
              if (Math.abs(snapped - o.offsetFromStartMm) > 0.5) {
                useAppStore.getState().applyOpeningRepositionLeftEdge(opPtr.openingId, snapped);
              }
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
          openingPointerRef.current = null;
          try {
            canvas.releasePointerCapture(opPtr.pointerId);
          } catch {
            /* ignore */
          }
          lastOpeningClickRef.current = null;
          if (opPtr.dragActive) {
            const proj = useAppStore.getState().currentProject;
            const o = proj.openings.find((x) => x.id === opPtr.openingId);
            const wall = proj.walls.find((w) => w.id === opPtr.wallId);
            if ((opPtr.kind === "window" || opPtr.kind === "door") && o && wall && o.offsetFromStartMm != null) {
              const snapped = snapOpeningLeftEdgeMm(
                wall,
                o.widthMm,
                o.offsetFromStartMm,
                proj.settings.gridStepMm,
                proj.settings.editor2d.snapToGrid,
                proj,
              );
              if (Math.abs(snapped - o.offsetFromStartMm) > 0.5) {
                useAppStore.getState().applyOpeningRepositionLeftEdge(opPtr.openingId, snapped);
              }
            }
          }
          paint();
        }
        endPan();
        cursorCbRef.current(null);
        jointHoverRef.current = null;
        lengthChangeHoverRef.current = null;
        const st = useAppStore.getState();
        windowPlacementHoverRef.current = null;
        if (st.activeTool === "ruler" || st.activeTool === "changeLength") {
          setWallHintRef.current(null);
        }
        if (
          !st.wallPlacementSession &&
          !st.wallJointSession &&
          !st.pendingWindowPlacement &&
          !st.pendingDoorPlacement &&
          !st.wallMoveCopySession &&
          st.activeTool !== "ruler" &&
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
        <div ref={anchorCrosshairInnerRef} className="ed2d-anchor-crosshair" style={{ visibility: "hidden" }}>
          <svg className="ed2d-anchor-crosshair__svg" viewBox="0 0 17 17" width="17" height="17" aria-hidden>
            <line className="ed2d-anchor-crosshair__v" x1="8" y1="1" x2="8" y2="16" />
            <line className="ed2d-anchor-crosshair__h" x1="1" y1="8" x2="16" y2="8" />
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
              const thickness = Math.max(0, wall.thicknessMm);
              const outerValue = moveEdit.face === "inner" ? v + thickness : v;
              const nextLeft =
                moveEdit.side === "left" ? m.wallStartMm + outerValue : m.wallEndMm - outerValue - m.widthMm;
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
    </div>
  );
}
