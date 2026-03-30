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
import { drawWallsAndOpenings2d } from "./walls2dPixi";
import { buildViewportTransform, screenToWorld, worldToScreen } from "./viewportTransforms";

import "./wall-placement-hint.css";

function readCanvasColorsFromTheme(): { readonly bg: number; readonly grid: number } {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const bg = cs.getPropertyValue("--color-canvas-bg").trim() || "#14171b";
  const grid = cs.getPropertyValue("--color-grid-line").trim() || "#2a2f36";
  return { bg: cssHexToPixiNumber(bg), grid: cssHexToPixiNumber(grid) };
}

const MARQUEE_MIN_DRAG_PX = 5;

interface Editor2DWorkspaceProps {
  readonly onWorldCursorMm: (point: { x: number; y: number } | null) => void;
}

interface MarqueeDrag {
  readonly sx: number;
  readonly sy: number;
  cx: number;
  cy: number;
}

export function Editor2DWorkspace({ onWorldCursorMm }: Editor2DWorkspaceProps) {
  const wallPlacementSession = useAppStore((s) => s.wallPlacementSession);
  const jointHoverRef = useRef<JointHoverState>(null);
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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let disposed = false;
    const appRef: { current: Application | null } = { current: null };
    const gridG = new Graphics();
    const wallsG = new Graphics();
    const openingsG = new Graphics();
    const wallLabelsC = new Container();
    wallLabelsC.eventMode = "none";
    const dimensionsG = new Graphics();
    dimensionsG.eventMode = "none";
    const dimensionsLabelC = new Container();
    dimensionsLabelC.eventMode = "none";
    const jointPickG = new Graphics();
    jointPickG.eventMode = "none";
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
      let firstDraw = true;
      for (const lid of contextIds) {
        const ctxSlice = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawWallsAndOpenings2d(wallsG, openingsG, ctxSlice, t, selected, {
          appearance: "context",
          clear: firstDraw,
          show2dProfileLayers: show2dLayers,
        });
        appendWallMarkLabels2d(wallLabelsC, ctxSlice, t, "context");
        firstDraw = false;
      }
      const layerView = narrowProjectToActiveLayer(currentProject);
      drawWallsAndOpenings2d(wallsG, openingsG, layerView, t, selected, {
        appearance: "active",
        clear: firstDraw,
        show2dProfileLayers: show2dLayers,
      });
      appendWallMarkLabels2d(wallLabelsC, layerView, t, "active");

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
      worldRoot.addChild(openingsG);
      worldRoot.addChild(wallLabelsC);
      worldRoot.addChild(dimensionsG);
      worldRoot.addChild(dimensionsLabelC);
      worldRoot.addChild(jointPickG);
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
            useAppStore.getState().clearSelection();
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

        const rect = canvas.getBoundingClientRect();
        if (wallPlacementSession) {
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
        if (ev.button === 0 && activeTool === "select" && !wallJointSession) {
          marquee = { sx: ev.global.x, sy: ev.global.y, cx: ev.global.x, cy: ev.global.y };
          marqueePointerId = ev.pointerId;
          try {
            canvas.setPointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          paint();
        }
      };

      const endPan = () => {
        panning.active = false;
      };

      const onPointerUp = () => {
        if (marquee) {
          finalizeMarquee();
          paint();
        }
        endPan();
      };

      const onPointerLeave = () => {
        panning.active = false;
        cursorCbRef.current(null);
        jointHoverRef.current = null;
        const st = useAppStore.getState();
        if (!st.wallPlacementSession && !st.wallJointSession) {
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        }
        if (st.wallJointSession) {
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
