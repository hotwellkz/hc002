import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { Layers } from "lucide-react";

import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
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
  const hasRoofAssembly3d = project.roofAssemblyCalculations.length > 0;

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
        <LucideToolIcon icon={Layers} className="ed3-vis-icon" />
        Видимость
      </button>
      {open ? (
        <div id={`${idBase}-panel`} className="ed3-vis-popover" role="region" aria-label="Видимость слоёв 3D">
          <p className="ed3-vis-hint">Показать или скрыть части модели. Настройки камеры и вида сохраняются.</p>
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
          <p className="ed3-vis-hint" style={{ marginTop: 10, marginBottom: 4 }}>
            Фундамент и перекрытие
          </p>
          <div className="ed3-vis-row">
            <label htmlFor={`${idBase}-found`}>Фундамент</label>
            <input
              id={`${idBase}-found`}
              type="checkbox"
              checked={vs.show3dFoundation !== false}
              onChange={(e) => set3dLayerVisibility({ show3dFoundation: e.target.checked })}
            />
          </div>
          <div className="ed3-vis-row">
            <label htmlFor={`${idBase}-pile`}>Сваи</label>
            <input
              id={`${idBase}-pile`}
              type="checkbox"
              checked={vs.show3dPiles !== false}
              onChange={(e) => set3dLayerVisibility({ show3dPiles: e.target.checked })}
            />
          </div>
          <div className="ed3-vis-row">
            <label htmlFor={`${idBase}-overlap`}>Перекрытие</label>
            <input
              id={`${idBase}-overlap`}
              type="checkbox"
              checked={vs.show3dOverlap !== false}
              onChange={(e) => set3dLayerVisibility({ show3dOverlap: e.target.checked })}
            />
          </div>
          <p className="ed3-vis-hint" style={{ marginTop: 10, marginBottom: 4 }}>
            Крыша (после «Рассчитать» в режиме крыши)
          </p>
          <div
            className={`ed3-vis-row${!hasRoofAssembly3d ? " ed3-vis-row--disabled" : ""}`}
            title={!hasRoofAssembly3d ? "Сначала выполните расчёт крыши" : undefined}
          >
            <label htmlFor={`${idBase}-roof-all`}>Крыша целиком</label>
            <input
              id={`${idBase}-roof-all`}
              type="checkbox"
              disabled={!hasRoofAssembly3d}
              checked={vs.show3dRoof !== false}
              onChange={(e) => set3dLayerVisibility({ show3dRoof: e.target.checked })}
            />
          </div>
          <div className={`ed3-vis-row${!hasRoofAssembly3d ? " ed3-vis-row--disabled" : ""}`}>
            <label htmlFor={`${idBase}-roof-cov`}>Покрытие крыши</label>
            <input
              id={`${idBase}-roof-cov`}
              type="checkbox"
              disabled={!hasRoofAssembly3d}
              checked={vs.show3dRoofCovering !== false}
              onChange={(e) => set3dLayerVisibility({ show3dRoofCovering: e.target.checked })}
            />
          </div>
          <div className={`ed3-vis-row${!hasRoofAssembly3d ? " ed3-vis-row--disabled" : ""}`}>
            <label htmlFor={`${idBase}-roof-bat`}>Обрешётка</label>
            <input
              id={`${idBase}-roof-bat`}
              type="checkbox"
              disabled={!hasRoofAssembly3d}
              checked={vs.show3dRoofBattens !== false}
              onChange={(e) => set3dLayerVisibility({ show3dRoofBattens: e.target.checked })}
            />
          </div>
          <div
            className={`ed3-vis-row${!hasRoofAssembly3d ? " ed3-vis-row--disabled" : ""}`}
            title={!hasRoofAssembly3d ? undefined : "Под обрешёткой"}
          >
            <label htmlFor={`${idBase}-roof-mem`}>Мембрана / ветрозащита</label>
            <input
              id={`${idBase}-roof-mem`}
              type="checkbox"
              disabled={!hasRoofAssembly3d}
              checked={vs.show3dRoofMembrane !== false}
              onChange={(e) => set3dLayerVisibility({ show3dRoofMembrane: e.target.checked })}
            />
          </div>
          <div className={`ed3-vis-row ed3-vis-row--disabled`} title="Геометрия будет добавлена позже">
            <label htmlFor={`${idBase}-roof-soff`}>Подшивка свесов</label>
            <input id={`${idBase}-roof-soff`} type="checkbox" disabled checked={false} readOnly />
          </div>
        </div>
      ) : null}
    </div>
  );
}
