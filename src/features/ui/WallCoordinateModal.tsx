import { useEffect, useId, useRef, useState } from "react";

import { useAppStore } from "@/store/useAppStore";

import "./wall-coordinate-modal.css";

export function WallCoordinateModal() {
  const wallCoordOpen = useAppStore((s) => s.wallCoordinateModalOpen);
  const moveCopyCoordOpen = useAppStore((s) => s.wallMoveCopyCoordinateModalOpen);
  const floorBeamMoveCopyCoordOpen = useAppStore((s) => s.floorBeamMoveCopyCoordinateModalOpen);
  const entityCopyCoordOpen = useAppStore((s) => s.entityCopyCoordinateModalOpen);
  const lengthChangeCoordOpen = useAppStore((s) => s.lengthChangeCoordinateModalOpen);
  const slabCoordOpen = useAppStore((s) => s.slabCoordinateModalOpen);
  const floorBeamPlacementCoordOpen = useAppStore((s) => s.floorBeamPlacementCoordinateModalOpen);
  const open =
    wallCoordOpen ||
    moveCopyCoordOpen ||
    floorBeamMoveCopyCoordOpen ||
    entityCopyCoordOpen ||
    lengthChangeCoordOpen ||
    slabCoordOpen ||
    floorBeamPlacementCoordOpen;
  const closeWallCoord = useAppStore((s) => s.closeWallCoordinateModal);
  const closeMoveCopyCoord = useAppStore((s) => s.closeWallMoveCopyCoordinateModal);
  const closeFloorBeamMoveCopyCoord = useAppStore((s) => s.closeFloorBeamMoveCopyCoordinateModal);
  const closeEntityCopyCoord = useAppStore((s) => s.closeEntityCopyCoordinateModal);
  const closeLengthChangeCoord = useAppStore((s) => s.closeLengthChangeCoordinateModal);
  const closeSlabCoord = useAppStore((s) => s.closeSlabCoordinateModal);
  const closeFloorBeamPlacementCoord = useAppStore((s) => s.closeFloorBeamPlacementCoordinateModal);
  const applyWallCoord = useAppStore((s) => s.applyWallCoordinateModal);
  const applyMoveCopyCoord = useAppStore((s) => s.applyWallMoveCopyCoordinateModal);
  const applyFloorBeamMoveCopyCoord = useAppStore((s) => s.applyFloorBeamMoveCopyCoordinateModal);
  const applyEntityCopyCoord = useAppStore((s) => s.applyEntityCopyCoordinateModal);
  const applyLengthChangeCoord = useAppStore((s) => s.applyLengthChangeCoordinateModal);
  const applySlabCoord = useAppStore((s) => s.applySlabCoordinateModal);
  const applyFloorBeamPlacementCoord = useAppStore((s) => s.applyFloorBeamPlacementCoordinateModal);
  const setSceneCoordModalDesiredFocus = useAppStore((s) => s.setSceneCoordModalDesiredFocus);
  const lastError = useAppStore((s) => s.lastError);

  const titleId = useId();
  const [xStr, setXStr] = useState("0");
  const [yStr, setYStr] = useState("0");
  const [deltaStr, setDeltaStr] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);
  const xInputRef = useRef<HTMLInputElement | null>(null);
  const yInputRef = useRef<HTMLInputElement | null>(null);

  /** Один снимок значений при открытии модалки; движение мыши по холсту не должно перезаписывать поля. */
  useEffect(() => {
    if (!open) {
      return;
    }
    const st = useAppStore.getState();
    if (st.lengthChangeCoordinateModalOpen && st.lengthChange2dSession) {
      const lc = st.lengthChange2dSession;
      const dx = lc.previewMovingMm.x - lc.fixedEndMm.x;
      const dy = lc.previewMovingMm.y - lc.fixedEndMm.y;
      const L = dx * lc.axisUx + dy * lc.axisUy;
      const d = Math.round(L - lc.initialLengthMm);
      setDeltaStr(String(d));
      setLocalError(null);
      return;
    }
    if (st.entityCopyCoordinateModalOpen) {
      const ec = st.entityCopySession;
      if (ec?.worldAnchorStart && ec.previewTargetWorldMm) {
        const dx = ec.previewTargetWorldMm.x - ec.worldAnchorStart.x;
        const dy = ec.previewTargetWorldMm.y - ec.worldAnchorStart.y;
        setXStr(String(Math.round(dx)));
        setYStr(String(Math.round(dy)));
        setLocalError(null);
      }
      return;
    }
    if (st.floorBeamMoveCopyCoordinateModalOpen) {
      const fb = st.floorBeamMoveCopySession;
      if (fb?.baseAnchorWorldMm && fb.dragDeltaMm != null) {
        setXStr(String(Math.round(fb.dragDeltaMm.x)));
        setYStr(String(Math.round(fb.dragDeltaMm.y)));
        setLocalError(null);
      }
      return;
    }
    if (st.wallMoveCopyCoordinateModalOpen) {
      const wm = st.wallMoveCopySession;
      if (wm?.anchorWorldMm && wm.previewTargetMm) {
        const dx = wm.previewTargetMm.x - wm.anchorWorldMm.x;
        const dy = wm.previewTargetMm.y - wm.anchorWorldMm.y;
        setXStr(String(Math.round(dx)));
        setYStr(String(Math.round(dy)));
        setLocalError(null);
      }
      return;
    }
    if (st.slabCoordinateModalOpen && st.slabPlacementSession) {
      const sp = st.slabPlacementSession;
      let ax = 0;
      let ay = 0;
      let px = 0;
      let py = 0;
      let ok = false;
      if (sp.phase === "waitingSecondPoint" && sp.firstPointMm && sp.previewEndMm) {
        ax = sp.firstPointMm.x;
        ay = sp.firstPointMm.y;
        px = sp.previewEndMm.x;
        py = sp.previewEndMm.y;
        ok = true;
      } else if (sp.phase === "polylineDrawing" && sp.polylineVerticesMm.length > 0 && sp.previewEndMm) {
        const lv = sp.polylineVerticesMm[sp.polylineVerticesMm.length - 1]!;
        ax = lv.x;
        ay = lv.y;
        px = sp.previewEndMm.x;
        py = sp.previewEndMm.y;
        ok = true;
      }
      if (ok) {
        setXStr(String(Math.round(px - ax)));
        setYStr(String(Math.round(py - ay)));
        setLocalError(null);
      }
      return;
    }
    if (st.floorBeamPlacementCoordinateModalOpen && st.floorBeamPlacementSession) {
      const fb = st.floorBeamPlacementSession;
      if (fb.firstPointMm && fb.previewEndMm) {
        const dx = fb.previewEndMm.x - fb.firstPointMm.x;
        const dy = fb.previewEndMm.y - fb.firstPointMm.y;
        setXStr(String(Math.round(dx)));
        setYStr(String(Math.round(dy)));
        setLocalError(null);
      }
      return;
    }
    const ws = st.wallPlacementSession;
    if (ws?.firstPointMm && ws.previewEndMm) {
      const dx = ws.previewEndMm.x - ws.firstPointMm.x;
      const dy = ws.previewEndMm.y - ws.firstPointMm.y;
      setXStr(String(Math.round(dx)));
      setYStr(String(Math.round(dy)));
      setLocalError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const st = useAppStore.getState();
    if (st.lengthChangeCoordinateModalOpen) {
      return;
    }
    const axis = st.sceneCoordModalDesiredFocus ?? "x";
    const id = requestAnimationFrame(() => {
      if (axis === "y") {
        yInputRef.current?.focus();
        yInputRef.current?.select?.();
      } else {
        xInputRef.current?.focus();
        xInputRef.current?.select?.();
      }
      setSceneCoordModalDesiredFocus(null);
    });
    return () => cancelAnimationFrame(id);
  }, [open, setSceneCoordModalDesiredFocus]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const st = useAppStore.getState();
        if (st.lengthChangeCoordinateModalOpen) {
          closeLengthChangeCoord();
        } else if (st.entityCopyCoordinateModalOpen) {
          closeEntityCopyCoord();
        } else if (st.floorBeamMoveCopyCoordinateModalOpen) {
          closeFloorBeamMoveCopyCoord();
        } else if (st.wallMoveCopyCoordinateModalOpen) {
          closeMoveCopyCoord();
        } else if (st.slabCoordinateModalOpen) {
          closeSlabCoord();
        } else if (st.floorBeamPlacementCoordinateModalOpen) {
          closeFloorBeamPlacementCoord();
        } else {
          closeWallCoord();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    closeWallCoord,
    closeMoveCopyCoord,
    closeFloorBeamMoveCopyCoord,
    closeEntityCopyCoord,
    closeLengthChangeCoord,
    closeSlabCoord,
    closeFloorBeamPlacementCoord,
  ]);

  if (!open) {
    return null;
  }

  const dxParsed = Number(xStr.replace(",", "."));
  const dyParsed = Number(yStr.replace(",", "."));
  const dShow =
    Number.isFinite(dxParsed) && Number.isFinite(dyParsed) ? Math.round(Math.hypot(dxParsed, dyParsed)) : "—";

  const submit = () => {
    setLocalError(null);
    if (lengthChangeCoordOpen) {
      const d = Number(deltaStr.replace(",", "."));
      if (!Number.isFinite(d)) {
        setLocalError("Введите числовое значение Δ (мм).");
        return;
      }
      applyLengthChangeCoord({ deltaMm: d });
      return;
    }
    const dx = Number(xStr.replace(",", "."));
    const dy = Number(yStr.replace(",", "."));
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      setLocalError("Введите числовые значения X и Y (мм).");
      return;
    }
    if (entityCopyCoordOpen) {
      applyEntityCopyCoord({ dxMm: dx, dyMm: dy });
    } else if (floorBeamMoveCopyCoordOpen) {
      applyFloorBeamMoveCopyCoord({ dxMm: dx, dyMm: dy });
    } else if (moveCopyCoordOpen) {
      applyMoveCopyCoord({ dxMm: dx, dyMm: dy });
    } else if (slabCoordOpen) {
      applySlabCoord({ dxMm: dx, dyMm: dy });
    } else if (floorBeamPlacementCoordOpen) {
      applyFloorBeamPlacementCoord({ dxMm: dx, dyMm: dy });
    } else {
      applyWallCoord({ dxMm: dx, dyMm: dy });
    }
  };

  const err = localError ?? lastError;

  const closeBackdrop = () => {
    if (lengthChangeCoordOpen) {
      closeLengthChangeCoord();
    } else if (entityCopyCoordOpen) {
      closeEntityCopyCoord();
    } else if (floorBeamMoveCopyCoordOpen) {
      closeFloorBeamMoveCopyCoord();
    } else if (moveCopyCoordOpen) {
      closeMoveCopyCoord();
    } else if (slabCoordOpen) {
      closeSlabCoord();
    } else if (floorBeamPlacementCoordOpen) {
      closeFloorBeamPlacementCoord();
    } else {
      closeWallCoord();
    }
  };

  const hintText = lengthChangeCoordOpen
    ? "Δ длины вдоль оси объекта (стена, балка) в мм. Положительное значение — удлинение, отрицательное — укорочение."
    : floorBeamPlacementCoordOpen
      ? "Смещение второй точки балки относительно первой (мм). «Применить» — создать балку на плане (как второй клик), затем можно указать следующую."
      : slabCoordOpen
      ? "Смещение текущей точки относительно опорной (мм): прямоугольник — от первого угла; полилиния — от последней зафиксированной вершины."
      : entityCopyCoordOpen
        ? "Смещение конечной точки копирования относительно опорной (мм), как у копирования сваи. Знак учитывается."
        : floorBeamMoveCopyCoordOpen
          ? "Смещение балки в мм от выбранной точки привязки (как у переноса стены). Знак учитывается."
          : "Смещение второй точки относительно первой (мм). Знак учитывается.";

  return (
    <div
      className="wcm-backdrop"
      role="presentation"
      onClick={closeBackdrop}
    >
      <div
        className="wcm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            const el = e.target as HTMLElement | null;
            if (el?.tagName === "TEXTAREA") {
              return;
            }
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2 id={titleId} className="wcm-title">
          {lengthChangeCoordOpen ? "Изменение длины" : "Координаты"}
        </h2>
        <p className="wcm-hint">{hintText}</p>
        <div className="wcm-fields">
          {lengthChangeCoordOpen ? (
            <label className="wcm-field">
              <span className="wcm-label">Δ</span>
              <input
                className="wcm-input"
                type="text"
                inputMode="decimal"
                value={deltaStr}
                onChange={(e) => {
                  setDeltaStr(e.target.value);
                  setLocalError(null);
                }}
                autoFocus
              />
            </label>
          ) : (
            <>
              <label className="wcm-field">
                <span className="wcm-label">X</span>
                <input
                  ref={xInputRef}
                  className="wcm-input"
                  type="text"
                  inputMode="decimal"
                  value={xStr}
                  onChange={(e) => {
                    setXStr(e.target.value);
                    setLocalError(null);
                  }}
                />
              </label>
              <label className="wcm-field">
                <span className="wcm-label">Y</span>
                <input
                  ref={yInputRef}
                  className="wcm-input"
                  type="text"
                  inputMode="decimal"
                  value={yStr}
                  onChange={(e) => {
                    setYStr(e.target.value);
                    setLocalError(null);
                  }}
                />
              </label>
              <div className="wcm-field wcm-field--readonly">
                <span className="wcm-label">D</span>
                <span className="wcm-readonly" title="Диагональ (мм)">
                  {dShow}
                </span>
              </div>
            </>
          )}
        </div>
        {err ? (
          <p className="wcm-error" role="alert">
            {err}
          </p>
        ) : null}
        <div className="wcm-actions">
          <button type="button" className="wcm-btn wcm-btn--ghost" onClick={closeBackdrop}>
            Отмена
          </button>
          <button type="button" className="wcm-btn wcm-btn--primary" onClick={submit}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
