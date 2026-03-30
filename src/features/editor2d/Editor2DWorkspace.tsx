import { Application, Container, FederatedPointerEvent, Graphics } from "pixi.js";
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
import { useAppStore } from "@/store/useAppStore";
import { useUiThemeStore } from "@/store/useUiThemeStore";

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
import { buildViewportTransform, screenToWorld, worldToScreen } from "./viewportTransforms";
import {
  clampOpeningLeftEdgeMm,
  offsetFromStartForCursorCentered,
  pickClosestWallAlongPoint,
  pickPlacedWindowOnLayerSlice,
  projectWorldToAlongMm,
  snapOpeningLeftEdgeMm,
  validateWindowPlacementOnWall,
} from "@/core/domain/openingWindowGeometry";

import "./wall-placement-hint.css";

import type { Project } from "@/core/domain/project";

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
  readonly sx: number;
  readonly sy: number;
  readonly pointerId: number;
  dragActive: boolean;
}

export function Editor2DWorkspace({ onWorldCursorMm }: Editor2DWorkspaceProps) {
  const wallPlacementSession = useAppStore((s) => s.wallPlacementSession);
  const jointHoverRef = useRef<JointHoverState>(null);
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
  const hostRef = useRef<HTMLDivElement>(null);
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
  } | null>(null);
  const setCoordHudRef = useRef(setCoordHud);
  setCoordHudRef.current = setCoordHud;

  useEffect(() => {
    if (!wallPlacementSession || wallPlacementSession.phase !== "waitingSecondPoint") {
      setCoordHud(null);
    }
  }, [wallPlacementSession]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (useAppStore.getState().wallCoordinateModalOpen) {
          e.preventDefault();
          useAppStore.getState().closeWallCoordinateModal();
          return;
        }
        if (useAppStore.getState().wallJointSession) {
          e.preventDefault();
          useAppStore.getState().wallJointBackOrExit();
          setWallHintRef.current(null);
          return;
        }
        if (useAppStore.getState().pendingWindowPlacement) {
          e.preventDefault();
          useAppStore.getState().clearPendingWindowPlacement();
          windowPlacementHoverRef.current = null;
          setWallHintRef.current(null);
          return;
        }
        if (useAppStore.getState().wallPlacementSession) {
          e.preventDefault();
          useAppStore.getState().wallPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        }
        return;
      }
      if (e.key === " " || e.code === "Space") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
          return;
        }
        const st = useAppStore.getState();
        if (!st.wallPlacementSession || st.wallPlacementSession.phase !== "waitingSecondPoint") {
          return;
        }
        if (st.wallCoordinateModalOpen) {
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
  useEffect(() => {
    const el = hostRef.current;
    if (!el) {
      return;
    }
    el.style.cursor = pendingWindowPlacement ? "crosshair" : "";
  }, [pendingWindowPlacement]);

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
    dimensionsLabelC.eventMode = "none";
    const jointPickG = new Graphics();
    jointPickG.eventMode = "none";
    const windowPlacementG = new Graphics();
    windowPlacementG.eventMode = "none";
    const previewG = new Graphics();
    const snapMarkerG = new Graphics();
    const marqueeG = new Graphics();
    const worldRoot = new Container();
    worldRoot.eventMode = "static";

    const panning = { active: false, sx: 0, sy: 0, panXMm: 0, panYMm: 0, zoom: 1 };
    let marquee: MarqueeDrag | null = null;

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

      const visibleWallIds = collectVisibleWallIds2d(currentProject);
      drawWallCalculationOverlay2d(wallCalcG, currentProject, visibleWallIds, t);
      drawOpeningFramingPlan2d(wallCalcG, currentProject, visibleWallIds, t);
      appendWallLumberLabels2d(wallCalcLabelC, currentProject, visibleWallIds, t);

      drawDimensions2d(dimensionsG, dimensionsLabelC, currentProject, t);

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
      const pend = useAppStore.getState().pendingWindowPlacement;
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
      worldRoot.addChild(jointPickG);
      worldRoot.addChild(windowPlacementG);
      worldRoot.addChild(previewG);
      worldRoot.addChild(snapMarkerG);
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
        canvas.style.cursor = "";
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
            const hitOp = pickPlacedWindowOnLayerSlice(layerView, wClick, tol.along, tol.perp);
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
        const { viewport2d, wallPlacementSession, currentProject, wallJointSession, wallCoordinateModalOpen } =
          useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const p = screenToWorld(ev.global.x, ev.global.y, t);
        cursorCbRef.current({ x: p.x, y: p.y });

        const opSess = openingPointerRef.current;
        if (opSess && ev.pointerId === opSess.pointerId) {
          const distPx = Math.hypot(ev.global.x - opSess.sx, ev.global.y - opSess.sy);
          if (!opSess.dragActive && distPx >= OPENING_DRAG_THRESHOLD_PX) {
            opSess.dragActive = true;
            lastOpeningClickRef.current = null;
          }
          if (opSess.dragActive) {
            const proj = useAppStore.getState().currentProject;
            const wall = proj.walls.find((x) => x.id === opSess.wallId);
            const opn = proj.openings.find((x) => x.id === opSess.openingId);
            if (wall && opn) {
              const along = projectWorldToAlongMm(wall, p);
              const rawLeft = offsetFromStartForCursorCentered(along, opn.widthMm);
              const left = clampOpeningLeftEdgeMm(wall, opn.widthMm, rawLeft);
              const v = validateWindowPlacementOnWall(wall, left, opn.widthMm, proj, opSess.openingId);
              if (v.ok) {
                useAppStore.getState().applyOpeningRepositionLeftEdge(opSess.openingId, left);
              }
            }
          }
        }

        const rect = canvas.getBoundingClientRect();
        const pend = useAppStore.getState().pendingWindowPlacement;
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
                const left = clampOpeningLeftEdgeMm(wall, op.widthMm, rawLeft);
                const v = validateWindowPlacementOnWall(wall, left, op.widthMm, currentProject, op.id);
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
                  text: `Установка окна\n${hintExtra}`,
                });
              }
            } else {
              setWallHintRef.current({
                left: hudWin.hintLeft,
                top: hudWin.hintTop,
                text: "Установка окна\nНаведите курсор на стену активного слоя",
              });
            }
          }
          setCoordHudRef.current(null);
          paint();
        } else if (wallPlacementSession) {
          const modeLabel = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
          if (wallPlacementSession.phase === "waitingSecondPoint") {
            useAppStore.getState().wallPlacementPreviewMove(p, t);
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
              showCoordHud: !wallCoordinateModalOpen,
            });
            setWallHintRef.current({
              left: hud.hintLeft,
              top: hud.hintTop,
              text: `${wallPlacementHintMessage(wallPlacementSession.phase)}\n${modeLabel}${snapLine ? `\n${snapLine}` : ""}`,
            });
            if (ws?.firstPointMm && ws.previewEndMm && hud.coordHudLeft != null && hud.coordHudTop != null) {
              const dx = ws.previewEndMm.x - ws.firstPointMm.x;
              const dy = ws.previewEndMm.y - ws.firstPointMm.y;
              const d = Math.hypot(dx, dy);
              setCoordHudRef.current({ left: hud.coordHudLeft, top: hud.coordHudTop, dx, dy, d });
            } else {
              setCoordHudRef.current(null);
            }
          } else {
            const hud = computePlacementHudScreenPosition({
              canvasRect: rect,
              cursorCanvasX: ev.global.x,
              cursorCanvasY: ev.global.y,
              wallCoordinateModalOpen: false,
              showCoordHud: false,
            });
            setWallHintRef.current({
              left: hud.hintLeft,
              top: hud.hintTop,
              text: `${wallPlacementHintMessage(wallPlacementSession.phase)}\n${modeLabel}`,
            });
            setCoordHudRef.current(null);
          }
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

        if (marquee) {
          marquee.cx = ev.global.x;
          marquee.cy = ev.global.y;
          paint();
          return;
        }

        if (panning.active) {
          const dxPx = ev.global.x - panning.sx;
          const dyPx = ev.global.y - panning.sy;
          useAppStore.getState().setViewport2d({
            ...viewport2d,
            panXMm: panning.panXMm - dxPx / panning.zoom,
            panYMm: panning.panYMm + dyPx / panning.zoom,
          });
        }
      };

      const onPointerDown = (ev: FederatedPointerEvent) => {
        const w = app.renderer.width;
        const h = app.renderer.height;
        const { viewport2d, wallPlacementSession, wallJointSession, activeTool } = useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const worldMm = screenToWorld(ev.global.x, ev.global.y, t);

        const pendingWin = useAppStore.getState().pendingWindowPlacement;
        if (pendingWin && ev.button === 0) {
          useAppStore.getState().tryCommitPendingWindowPlacementAtWorld(worldMm);
          windowPlacementHoverRef.current = null;
          paint();
          return;
        }
        if (pendingWin && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().clearPendingWindowPlacement();
          windowPlacementHoverRef.current = null;
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
          ev.preventDefault();
          useAppStore.getState().wallPlacementBackOrExit();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (wallPlacementSession && ev.button === 0) {
          useAppStore.getState().wallPlacementPrimaryClick(worldMm, t);
          paint();
          if (!useAppStore.getState().wallPlacementSession) {
            setWallHintRef.current(null);
            setCoordHudRef.current(null);
          }
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
          activeTool === "select" &&
          !wallJointSession &&
          !wallPlacementSession &&
          !useAppStore.getState().pendingWindowPlacement
        ) {
          ev.preventDefault();
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
          !useAppStore.getState().pendingWindowPlacement
        ) {
          const cp = useAppStore.getState().currentProject;
          const layerView = narrowProjectToActiveLayer(cp);
          const tol = openingPickTolerancesMm(viewport2d.zoomPixelsPerMm);
          const hitOp = pickPlacedWindowOnLayerSlice(layerView, worldMm, tol.along, tol.perp);
          if (hitOp && hitOp.wallId != null) {
            openingPointerRef.current = {
              openingId: hitOp.id,
              wallId: hitOp.wallId,
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
              useAppStore.getState().openWindowEditModal(opPtr.openingId, "form");
              lastOpeningClickRef.current = null;
            } else {
              lastOpeningClickRef.current = { id: opPtr.openingId, t: now };
            }
          } else {
            lastOpeningClickRef.current = null;
            const proj = useAppStore.getState().currentProject;
            const o = proj.openings.find((x) => x.id === opPtr.openingId);
            const wall = proj.walls.find((w) => w.id === opPtr.wallId);
            if (o && wall && o.offsetFromStartMm != null) {
              const snapped = snapOpeningLeftEdgeMm(
                wall,
                o.widthMm,
                o.offsetFromStartMm,
                proj.settings.gridStepMm,
                proj.settings.editor2d.snapToGrid,
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
            if (o && wall && o.offsetFromStartMm != null) {
              const snapped = snapOpeningLeftEdgeMm(
                wall,
                o.widthMm,
                o.offsetFromStartMm,
                proj.settings.gridStepMm,
                proj.settings.editor2d.snapToGrid,
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
        const st = useAppStore.getState();
        windowPlacementHoverRef.current = null;
        if (!st.wallPlacementSession && !st.wallJointSession && !st.pendingWindowPlacement) {
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        }
        if (st.wallJointSession || st.pendingWindowPlacement) {
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
      {wallHint ? (
        <div className="ed2d-wall-hint" style={{ left: wallHint.left, top: wallHint.top }}>
          {wallHint.text}
        </div>
      ) : null}
      {coordHud ? (
        <div className="ed2d-wall-coord-hud" style={{ left: coordHud.left, top: coordHud.top }}>
          X={Math.round(coordHud.dx)} · Y={Math.round(coordHud.dy)} · D={Math.round(coordHud.d)}
        </div>
      ) : null}
    </div>
  );
}
