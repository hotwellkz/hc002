import { type CSSProperties, useEffect, useId, useRef, useState } from "react";

import { useAppStore } from "@/store/useAppStore";

import { hasDoorGeometry3d, hasWindowGeometry3d } from "./view3dVisibility";
import { useEditor3dThemeColors } from "./useEditor3dThemeColors";

import "./editor3d-visibility.css";

/** Компактный popover: видимость категорий 3D (OSB, EPS, каркас, окна; двери — заготовка). */
export function Editor3dVisibilityPanel() {
  const idBase = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const theme3d = useEditor3dThemeColors();
  const project = useAppStore((s) => s.currentProject);
  const vs = project.viewState;
  const set3dLayerVisibility = useAppStore((s) => s.set3dLayerVisibility);

  const windowsReady = hasWindowGeometry3d(project);
  const doorsReady = hasDoorGeometry3d(project);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="ed3-vis-wrap"
      style={
        {
          "--ed3-overlay-bg": theme3d.overlayBg,
          "--ed3-overlay-text": theme3d.overlayText,
        } as CSSProperties
      }
    >
      <button
        type="button"
        className="ed3-vis-trigger"
        aria-expanded={open}
        aria-controls={`${idBase}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="ed3-vis-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 5h18M3 12h18M3 19h18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="8" cy="5" r="1.5" fill="currentColor" />
          <circle cx="16" cy="12" r="1.5" fill="currentColor" />
          <circle cx="10" cy="19" r="1.5" fill="currentColor" />
        </svg>
        Видимость
      </button>
      {open ? (
        <div id={`${idBase}-panel`} className="ed3-vis-popover" role="region" aria-label="Видимость слоёв 3D">
          <p className="ed3-vis-hint">Показать или скрыть части модели. Камера и сетка не сбрасываются.</p>
          <div className="ed3-vis-row">
            <label htmlFor={`${idBase}-osb`}>OSB</label>
            <input
              id={`${idBase}-osb`}
              type="checkbox"
              checked={vs.show3dLayerOsb !== false}
              onChange={(e) => set3dLayerVisibility({ show3dLayerOsb: e.target.checked })}
            />
          </div>
          <div className="ed3-vis-row">
            <label htmlFor={`${idBase}-eps`}>Пенополистирол</label>
            <input
              id={`${idBase}-eps`}
              type="checkbox"
              checked={vs.show3dLayerEps !== false}
              onChange={(e) => set3dLayerVisibility({ show3dLayerEps: e.target.checked })}
            />
          </div>
          <div className="ed3-vis-row">
            <label htmlFor={`${idBase}-frame`}>Каркас</label>
            <input
              id={`${idBase}-frame`}
              type="checkbox"
              checked={vs.show3dLayerFrame !== false}
              onChange={(e) => set3dLayerVisibility({ show3dLayerFrame: e.target.checked })}
            />
          </div>
          <div className="ed3-vis-row">
            <label htmlFor={`${idBase}-gyp`}>Гипсокартон</label>
            <input
              id={`${idBase}-gyp`}
              type="checkbox"
              checked={vs.show3dLayerGypsum !== false}
              onChange={(e) => set3dLayerVisibility({ show3dLayerGypsum: e.target.checked })}
            />
          </div>
          <div
            className={`ed3-vis-row${!windowsReady ? " ed3-vis-row--disabled" : ""}`}
            title={!windowsReady ? "Скоро" : undefined}
          >
            <label htmlFor={`${idBase}-win`}>Окна</label>
            <input
              id={`${idBase}-win`}
              type="checkbox"
              disabled={!windowsReady}
              checked={vs.show3dLayerWindows !== false}
              onChange={(e) => set3dLayerVisibility({ show3dLayerWindows: e.target.checked })}
            />
          </div>
          <div
            className={`ed3-vis-row${!doorsReady ? " ed3-vis-row--disabled" : ""}`}
            title={!doorsReady ? "Скоро" : undefined}
          >
            <label htmlFor={`${idBase}-door`}>Двери</label>
            <input
              id={`${idBase}-door`}
              type="checkbox"
              disabled={!doorsReady}
              checked={vs.show3dLayerDoors !== false}
              onChange={(e) => set3dLayerVisibility({ show3dLayerDoors: e.target.checked })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
