import { Application, Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { useEffect, useRef } from "react";

import {
  narrowProjectToActiveLayer,
  narrowProjectToLayerSet,
  sortedVisibleContextLayerIds,
} from "@/core/domain/projectLayerSlice";
import { useAppStore } from "@/store/useAppStore";

import { computeMarqueeSelection } from "./computeMarqueeSelection";
import { buildScreenGridLines } from "./gridGeometry";
import { drawWallsAndOpenings2d } from "./walls2dPixi";
import { buildViewportTransform, screenToWorld } from "./viewportTransforms";

const BG = 0x12141a;
const GRID_COLOR = 0x2a3140;
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
  const hostRef = useRef<HTMLDivElement>(null);
  const cursorCbRef = useRef(onWorldCursorMm);
  cursorCbRef.current = onWorldCursorMm;

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
    const marqueeG = new Graphics();
    const world = new Container();
    world.eventMode = "static";

    const panning = { active: false, sx: 0, sy: 0, panXMm: 0, panYMm: 0, zoom: 1 };
    let marquee: MarqueeDrag | null = null;

    const paint = () => {
      const app = appRef.current;
      if (!app) {
        return;
      }
      const { currentProject, viewport2d, selectedEntityIds } = useAppStore.getState();
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

      marqueeG.clear();
      if (marquee) {
        const x = Math.min(marquee.sx, marquee.cx);
        const y = Math.min(marquee.sy, marquee.cy);
        const rw = Math.abs(marquee.cx - marquee.sx);
        const rh = Math.abs(marquee.cy - marquee.sy);
        marqueeG.rect(x, y, rw, rh);
        marqueeG.fill({ color: 0x5c7cfa, alpha: 0.14 });
        marqueeG.stroke({ width: 1, color: 0x5c7cfa, alpha: 0.9 });
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

      world.hitArea = app.screen;
      world.addChild(gridG);
      world.addChild(wallsG);
      world.addChild(openingsG);
      world.addChild(marqueeG);
      app.stage.addChild(world);

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
        const { viewport2d } = useAppStore.getState();
        const t = buildViewportTransform(w, h, viewport2d.panXMm, viewport2d.panYMm, viewport2d.zoomPixelsPerMm);
        const p = screenToWorld(ev.global.x, ev.global.y, t);
        cursorCbRef.current({ x: p.x, y: p.y });

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
        const tool = useAppStore.getState().activeTool;
        if (ev.button === 1) {
          const { viewport2d } = useAppStore.getState();
          panning.active = true;
          panning.sx = ev.global.x;
          panning.sy = ev.global.y;
          panning.panXMm = viewport2d.panXMm;
          panning.panYMm = viewport2d.panYMm;
          panning.zoom = viewport2d.zoomPixelsPerMm;
          return;
        }
        if (ev.button === 0 && tool === "pan") {
          const { viewport2d } = useAppStore.getState();
          panning.active = true;
          panning.sx = ev.global.x;
          panning.sy = ev.global.y;
          panning.panXMm = viewport2d.panXMm;
          panning.panYMm = viewport2d.panYMm;
          panning.zoom = viewport2d.zoomPixelsPerMm;
          return;
        }
        if (ev.button === 0 && tool === "select") {
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
      };

      world.on("pointermove", onPointerMove);
      world.on("pointerdown", onPointerDown);
      world.on("pointerup", onPointerUp);
      world.on("pointerupoutside", onPointerUp);
      world.on("pointerleave", onPointerLeave);

      unsubStore = useAppStore.subscribe(paint);
      ro = new ResizeObserver(() => {
        paint();
      });
      ro.observe(host);
      paint();

      detachListeners = () => {
        canvas.removeEventListener("wheel", onWheel);
        world.off("pointermove", onPointerMove);
        world.off("pointerdown", onPointerDown);
        world.off("pointerup", onPointerUp);
        world.off("pointerupoutside", onPointerUp);
        world.off("pointerleave", onPointerLeave);
      };
    })();

    return () => {
      disposed = true;
      detachListeners?.();
      unsubStore?.();
      ro?.disconnect();
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  return <div ref={hostRef} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
}
