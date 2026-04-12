import { type CSSProperties, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Layers, X } from "lucide-react";

import { sortLayersByOrder } from "@/core/domain/layerOps";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import { Editor3dVisibilityTree } from "./Editor3dVisibilityTree";
import {
  buildEditor3dVisibilityTree,
  collectAllGroupIds,
  resolveEditor3dVisibilityCollapsedKeySet,
} from "./editor3dVisibilityTreeModel";
import { hasDoorGeometry3d, hasWindowGeometry3d } from "./view3dVisibility";
import { useEditor3dThemeColors } from "./useEditor3dThemeColors";

import "./editor3d-visibility.css";

export type Editor3dVisibilityPanelProps = {
  /** Сообщить родителю об открытии (например, чтобы скрыть соседние плавающие кнопки). */
  readonly onOpenChange?: (open: boolean) => void;
};

/** Плавающая панель: видимость категорий 3D (дерево: слои, материалы, конструктив, крыша). */
export function Editor3dVisibilityPanel({ onOpenChange }: Editor3dVisibilityPanelProps) {
  const idBase = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const theme3d = useEditor3dThemeColors();
  const project = useAppStore((s) => s.currentProject);
  const vs = project.viewState;
  const set3dLayerVisibility = useAppStore((s) => s.set3dLayerVisibility);
  const showAll3dProjectLayers = useAppStore((s) => s.showAll3dProjectLayers);
  const hideAll3dProjectLayers = useAppStore((s) => s.hideAll3dProjectLayers);

  const sortedProjectLayers = useMemo(() => sortLayersByOrder(project.layers), [project.layers]);

  const windowsReady = hasWindowGeometry3d(project);
  const doorsReady = hasDoorGeometry3d(project);
  const hasRoofAssembly3d = project.roofAssemblyCalculations.length > 0;

  const treeRoots = useMemo(
    () =>
      buildEditor3dVisibilityTree(sortedProjectLayers, {
        windowsReady,
        doorsReady,
        hasRoofAssembly3d,
      }),
    [sortedProjectLayers, windowsReady, doorsReady, hasRoofAssembly3d],
  );

  const allGroupIds = useMemo(() => collectAllGroupIds(treeRoots), [treeRoots]);

  const collapsedKeySet = useMemo(
    () =>
      resolveEditor3dVisibilityCollapsedKeySet(
        vs.editor3dVisibilityCollapsePrimed,
        vs.editor3dVisibilityCollapsedKeys,
        allGroupIds,
      ),
    [vs.editor3dVisibilityCollapsePrimed, vs.editor3dVisibilityCollapsedKeys, allGroupIds],
  );

  const onToggleCollapsed = useCallback(
    (key: string) => {
      const s = resolveEditor3dVisibilityCollapsedKeySet(
        vs.editor3dVisibilityCollapsePrimed,
        vs.editor3dVisibilityCollapsedKeys,
        allGroupIds,
      );
      if (s.has(key)) {
        s.delete(key);
      } else {
        s.add(key);
      }
      set3dLayerVisibility({
        editor3dVisibilityCollapsedKeys: [...s],
        editor3dVisibilityCollapsePrimed: true,
      });
    },
    [
      allGroupIds,
      set3dLayerVisibility,
      vs.editor3dVisibilityCollapsePrimed,
      vs.editor3dVisibilityCollapsedKeys,
    ],
  );

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

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
      className={`ed3-vis-wrap${open ? " ed3-vis-wrap--open" : ""}`}
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
        <div
          id={`${idBase}-panel`}
          className="ed3-vis-popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${idBase}-vis-title`}
        >
          <header className="ed3-vis-card-header">
            <div className="ed3-vis-card-title-group">
              <LucideToolIcon icon={Layers} className="ed3-vis-card-title-icon" />
              <h2 id={`${idBase}-vis-title`} className="ed3-vis-card-title">
                Видимость
              </h2>
            </div>
            <button
              type="button"
              className="ed3-vis-card-close"
              aria-label="Закрыть панель видимости"
              onClick={() => setOpen(false)}
            >
              <LucideToolIcon icon={X} className="ed3-vis-card-close-icon" />
            </button>
          </header>
          <p className="ed3-vis-card-lead">
            Показать или скрыть части модели. Переключатели материалов стен действуют на все этажи; слои
            управляют целыми уровнями. Состояние списка и свёрнутых групп сохраняется в проекте.
          </p>
          <div className="ed3-vis-card-toolbar">
            <button type="button" className="ed3-vis-action-btn" onClick={() => showAll3dProjectLayers()}>
              Включить все слои
            </button>
            <button type="button" className="ed3-vis-action-btn" onClick={() => hideAll3dProjectLayers()}>
              Выключить все слои
            </button>
          </div>
          <div className="ed3-vis-card-scroll">
            <Editor3dVisibilityTree
              idBase={idBase}
              roots={treeRoots}
              vs={vs}
              hiddenLayerIds={vs.hidden3dProjectLayerIds}
              collapsedKeys={collapsedKeySet}
              onToggleCollapsed={onToggleCollapsed}
              onApplyPatch={(patch) => set3dLayerVisibility(patch)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
