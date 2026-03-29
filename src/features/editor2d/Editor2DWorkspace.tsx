import { Application, Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { useEffect, useRef, useState } from "react";

import { linearPlacementModeLabelRu } from "@/core/geometry/linearPlacementGeometry";
import { wallPlacementHintMessage } from "@/core/domain/wallPlacement";
import {
  narrowProjectToActiveLayer,
  narrowProjectToLayerSet,
  sortedVisibleContextLayerIds,
} from "@/core/domain/projectLayerSlice";
import { useAppStore } from "@/store/useAppStore";

import { computeMarqueeSelection } from "./computeMarqueeSelection";
import { drawRectangleWallPlacementPreview, drawWallPlacementPreview } from "./drawWallPreview2d";
import { buildScreenGridLines } from "./gridGeometry";
import { drawWallsAndOpenings2d } from "./walls2dPixi";
import { buildViewportTransform, screenToWorld } from "./viewportTransforms";

import "./wall-placement-hint.css";

/** Согласовано с design tokens: canvasBg, borderSubtle */
const BG = 0x14171b;
const GRID_COLOR = 0x2a2f36;
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
        if (useAppStore.getState().wallPlacementSession) {
          e.preventDefault();
          useAppStore.getState().cancelWallPlacement();
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
    const previewG = new Graphics();
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
      const selected = new Set(selectedEntityIds);
      const contextIds = sortedVisibleContextLayerIds(currentProject);

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
      let firstDraw = true;
      for (const lid of contextIds) {
        const ctxSlice = narrowProjectToLayerSet(currentProject, new Set([lid]));
        drawWallsAndOpenings2d(wallsG, openingsG, ctxSlice, t, selected, {
          appearance: "context",
          clear: firstDraw,
        });
        firstDraw = false;
      }
      const layerView = narrowProjectToActiveLayer(currentProject);
      drawWallsAndOpenings2d(wallsG, openingsG, layerView, t, selected, {
        appearance: "active",
        clear: firstDraw,
      });

      previewG.clear();
      if (
        wallPlacementSession?.phase === "waitingSecondPoint" &&
        wallPlacementSession.firstPointMm &&
        wallPlacementSession.previewEndMm
      ) {
        const placementMode = currentProject.settings.editor2d.linearPlacementMode;
        const shapeMode = currentProject.settings.editor2d.wallShapeMode;
        const thick = wallPlacementSession.draft.thicknessMm;
        if (shapeMode === "rectangle") {
          drawRectangleWallPlacementPreview(
            previewG,
            wallPlacementSession.firstPointMm,
            wallPlacementSession.previewEndMm,
            thick,
            placementMode,
            t,
          );
        } else {
          drawWallPlacementPreview(
            previewG,
            wallPlacementSession.firstPointMm,
            wallPlacementSession.previewEndMm,
            thick,
            placementMode,
            t,
          );
        }
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
    let ro: ResizeObserver | null = null;

    void (async () => {
      const app = new Application();
      await app.init({
        resizeTo: host,
        background: BG,
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
      worldRoot.addChild(previewG);
      worldRoot.addChild(marqueeG);
      app.stage.addChild(worldRoot);

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
        const { viewport2d, wallPlacementSession, currentProject } = useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const p = screenToWorld(ev.global.x, ev.global.y, t);
        cursorCbRef.current({ x: p.x, y: p.y });

        const rect = canvas.getBoundingClientRect();
        const left = rect.left + ev.global.x + 12;
        const top = rect.top + ev.global.y + 12;
        if (wallPlacementSession) {
          const modeLabel = linearPlacementModeLabelRu(currentProject.settings.editor2d.linearPlacementMode);
          setWallHintRef.current({
            left,
            top,
            text: `${wallPlacementHintMessage(wallPlacementSession.phase)}\n${modeLabel}`,
          });
          if (wallPlacementSession.phase === "waitingSecondPoint") {
            useAppStore.getState().wallPlacementPreviewMove(p);
            const ws = useAppStore.getState().wallPlacementSession;
            if (ws?.firstPointMm && ws.previewEndMm) {
              const dx = ws.previewEndMm.x - ws.firstPointMm.x;
              const dy = ws.previewEndMm.y - ws.firstPointMm.y;
              const d = Math.hypot(dx, dy);
              setCoordHudRef.current({ left, top: top + 52, dx, dy, d });
            }
          } else {
            setCoordHudRef.current(null);
          }
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
        const { viewport2d, wallPlacementSession, activeTool } = useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const worldMm = screenToWorld(ev.global.x, ev.global.y, t);

        if (wallPlacementSession && ev.button === 2) {
          ev.preventDefault();
          useAppStore.getState().cancelWallPlacement();
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
          paint();
          return;
        }

        if (wallPlacementSession && ev.button === 0) {
          useAppStore.getState().wallPlacementPrimaryClick(worldMm);
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
        if (ev.button === 0 && activeTool === "select") {
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
        if (!useAppStore.getState().wallPlacementSession) {
          setWallHintRef.current(null);
          setCoordHudRef.current(null);
        }
      };

      worldRoot.on("pointermove", onPointerMove);
      worldRoot.on("pointerdown", onPointerDown);
      worldRoot.on("pointerup", onPointerUp);
      worldRoot.on("pointerupoutside", onPointerUp);
      worldRoot.on("pointerleave", onPointerLeave);

      unsubStore = useAppStore.subscribe(paint);
      ro = new ResizeObserver(() => {
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
      ro?.disconnect();
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, flex: 1 }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%", minHeight: 0 }} />
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
