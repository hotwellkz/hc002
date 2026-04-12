import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import type { ReportRenderModel } from "@/core/reports/types";

import { ReportSvgCanvas } from "./reportPrimitivesSvg";

import "./reports-workspace.css";

export interface ReportPreviewPanelProps {
  readonly model: ReportRenderModel | null;
  /** Ошибка компиляции отчёта (не пустой экран). */
  readonly compileError?: string | null;
}

export function ReportPreviewPanel({ model, compileError }: ReportPreviewPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const dz = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => clamp(z + dz, 0.35, 6));
  }, []);

  const onPointerDown = useCallback((e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y, active: true };
  }, [pan.x, pan.y]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!drag.current?.active) {
      return;
    }
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  }, []);

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (drag.current) {
      drag.current.active = false;
    }
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const fit = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (compileError) {
    return (
      <div className="reports-preview reports-preview--empty reports-preview--error">
        <h3 className="reports-preview__fallback-title">Отчёт недоступен</h3>
        <p className="reports-preview__fallback-text">При сборке отчёта произошла ошибка. Попробуйте «Пересчитать» или проверьте данные проекта.</p>
        <pre className="reports-preview__fallback-pre">{compileError}</pre>
        {import.meta.env.DEV ? (
          <p className="reports-preview__devhint">Подсказка для разработки: см. консоль и stack при ошибке компиляции.</p>
        ) : null}
      </div>
    );
  }

  if (!model) {
    return (
      <div className="reports-preview reports-preview--empty">
        <p className="reports-preview__fallback-text">
          Выберите отчёт в списке (колонка «Отчёты») или откройте раздел через кнопку «Отчёты» в левой навигации.
        </p>
      </div>
    );
  }

  return (
    <div className="reports-preview">
      <div className="reports-preview__toolbar">
        <button type="button" className="reports-preview__btn" onClick={() => setZoom((z) => clamp(z * 1.15, 0.35, 6))}>
          +
        </button>
        <button type="button" className="reports-preview__btn" onClick={() => setZoom((z) => clamp(z / 1.15, 0.35, 6))}>
          −
        </button>
        <button type="button" className="reports-preview__btn" onClick={fit}>
          Вписать
        </button>
        <span className="reports-preview__zoom-label">{Math.round(zoom * 100)}%</span>
      </div>
      <div
        className="reports-preview__viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="reports-preview__canvas"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          <ReportSvgCanvas model={model} />
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
