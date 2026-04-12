import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";

import type { LayerLevelMode } from "@/core/domain/layer";
import { LAYER_DOMAIN_LABELS, editor2dPlanScopeToLayerDomain, type LayerDomain } from "@/core/domain/layerDomain";
import {
  getAdjacentLayerIdInDomain,
  getLayerById,
  sortLayersByOrder,
  sortLayersForDomain,
} from "@/core/domain/layerOps";
import { normalizeVisibleLayerIds } from "@/core/domain/layerVisibility";
import { computeLayerVerticalStack, getLayerVerticalSlice } from "@/core/domain/layerVerticalStack";
import { useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

type TabId = "current" | "list";

interface LayerParamsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

function modeLabel(m: LayerLevelMode): string {
  return m === "absolute" ? "Абс." : "От пред.";
}

function topHint(slice: ReturnType<typeof getLayerVerticalSlice>, manualHeightMm: number): string {
  if (slice.geometryTopMm == null) {
    return manualHeightMm > 0
      ? "Верх: низ + ручная высота (нет геометрии)"
      : "Верх совпадает с низом (пустой слой, ручная высота 0)";
  }
  if (Math.abs(slice.computedTopMm - slice.geometryTopMm) < 0.5) {
    return "Верх вычислен по объектам слоя";
  }
  return "Верх = max(объекты, низ + ручная высота)";
}

export function LayerParamsModal({ open, onClose }: LayerParamsModalProps) {
  const project = useAppStore((s) => s.currentProject);
  const listMode = useAppStore((s) => s.layerListDisplayMode);
  const setListMode = useAppStore((s) => s.setLayerListDisplayMode);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const toggleVisibleLayer = useAppStore((s) => s.toggleVisibleLayer);
  const reorderLayerUp = useAppStore((s) => s.reorderLayerUp);
  const reorderLayerDown = useAppStore((s) => s.reorderLayerDown);
  const moveLayerToStackIndex = useAppStore((s) => s.moveLayerToStackIndex);

  const [tab, setTab] = useState<TabId>("current");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<LayerDomain>("floorPlan");
  const [elevationMm, setElevationMm] = useState(0);
  const [levelMode, setLevelMode] = useState<LayerLevelMode>("absolute");
  const [offsetFromBelowMm, setOffsetFromBelowMm] = useState(0);
  const [manualHeightMm, setManualHeightMm] = useState(0);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);

  const activeId = project.activeLayerId;
  const activeLayer = useMemo(() => getLayerById(project, activeId), [project, activeId]);
  const scopeDomain = editor2dPlanScopeToLayerDomain(project.viewState.editor2dPlanScope);
  const fullSorted = useMemo(() => sortLayersByOrder(project.layers), [project.layers]);
  const sortedLayersView = useMemo(() => {
    if (listMode === "project") {
      return fullSorted;
    }
    return sortLayersForDomain(project, scopeDomain);
  }, [listMode, fullSorted, project, scopeDomain]);
  const extraVisible = useMemo(() => new Set(normalizeVisibleLayerIds(project)), [project]);
  const verticalById = useMemo(() => computeLayerVerticalStack(project), [project]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTab("current");
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "current" || !activeLayer) {
      return;
    }
    setName(activeLayer.name);
    setDomain(activeLayer.domain);
    setElevationMm(activeLayer.elevationMm);
    setLevelMode(activeLayer.levelMode);
    setOffsetFromBelowMm(activeLayer.offsetFromBelowMm);
    setManualHeightMm(activeLayer.manualHeightMm);
  }, [open, tab, activeLayer]);

  const activeSlice = useMemo(
    () => (activeLayer ? getLayerVerticalSlice(project, activeLayer.id, verticalById) : null),
    [project, activeLayer, verticalById],
  );

  const onRowDragStart = useCallback((e: DragEvent, layerId: string) => {
    setDragLayerId(layerId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", layerId);
  }, []);

  const onRowDragEnd = useCallback(() => {
    setDragLayerId(null);
  }, []);

  const onRowDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onRowDrop = useCallback(
    (e: DragEvent, targetSortedIndex: number) => {
      e.preventDefault();
      const id = dragLayerId ?? e.dataTransfer.getData("text/plain");
      if (!id) {
        return;
      }
      moveLayerToStackIndex(id, targetSortedIndex);
      setDragLayerId(null);
    },
    [dragLayerId, moveLayerToStackIndex],
  );

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(onClose);

  useEffect(() => {
    if (open) {
      clearApplyError();
    }
  }, [open, clearApplyError]);

  if (!open) {
    return null;
  }

  const handleApplyCurrent = () =>
    runApply(() => {
      const n = name.trim();
      if (!n || !activeLayer) {
        return false;
      }
      updateLayer(activeId, {
        name: n,
        domain,
        elevationMm: Number.isFinite(elevationMm) ? elevationMm : activeLayer.elevationMm,
        levelMode,
        offsetFromBelowMm: Number.isFinite(offsetFromBelowMm) ? offsetFromBelowMm : 0,
        manualHeightMm: Number.isFinite(manualHeightMm) ? manualHeightMm : 0,
      });
    });

  const dirtyCurrent =
    activeLayer &&
    (name.trim() !== activeLayer.name ||
      domain !== activeLayer.domain ||
      elevationMm !== activeLayer.elevationMm ||
      levelMode !== activeLayer.levelMode ||
      offsetFromBelowMm !== activeLayer.offsetFromBelowMm ||
      manualHeightMm !== activeLayer.manualHeightMm);

  const canApply = tab === "current" && activeLayer && name.trim().length > 0 && dirtyCurrent;

  return (
    <div className="lm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lm-dialog lm-dialog--wide lp-dialog lp-dialog--stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="lp-title" className="lm-title">
          Параметры слоя
        </h2>

        <div className="lp-tabs" role="tablist" aria-label="Разделы параметров слоя">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "current"}
            className={`lp-tab ${tab === "current" ? "lp-tab--active" : ""}`}
            onClick={() => setTab("current")}
          >
            Текущий слой
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "list"}
            className={`lp-tab ${tab === "list" ? "lp-tab--active" : ""}`}
            onClick={() => setTab("list")}
          >
            Список слоёв
          </button>
        </div>

        {tab === "current" && activeLayer && activeSlice && (
          <div className="lp-panel" role="tabpanel">
            <div className="lm-field">
              <label className="lm-label" htmlFor="lp-name">
                Название слоя
              </label>
              <input
                id="lp-name"
                className="lm-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="lm-field">
              <label className="lm-label" htmlFor="lp-domain">
                Раздел проекта
              </label>
              <select
                id="lp-domain"
                className="lm-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value as LayerDomain)}
              >
                {(Object.keys(LAYER_DOMAIN_LABELS) as LayerDomain[]).map((d) => (
                  <option key={d} value={d}>
                    {LAYER_DOMAIN_LABELS[d]}
                  </option>
                ))}
              </select>
              <p className="lp-micro">
                Определяет, в каком режиме слева слой показывается по умолчанию. Один общий стек высот для всего
                здания.
              </p>
            </div>

            <div className="lm-field">
              <span className="lm-label">Режим уровня</span>
              <div className="lp-radio-row">
                <label className="lp-radio">
                  <input
                    type="radio"
                    name="lp-level-mode"
                    checked={levelMode === "absolute"}
                    onChange={() => setLevelMode("absolute")}
                  />
                  Абсолютный <span className="lp-muted">(от нуля проекта)</span>
                </label>
                <label className="lp-radio">
                  <input
                    type="radio"
                    name="lp-level-mode"
                    checked={levelMode === "relativeToBelow"}
                    onChange={() => setLevelMode("relativeToBelow")}
                  />
                  Относительно предыдущего слоя <span className="lp-muted">(от его верха)</span>
                </label>
              </div>
            </div>

            {levelMode === "absolute" ? (
              <div className="lm-field">
                <label className="lm-label" htmlFor="lp-elev">
                  Базовый уровень (мм)
                </label>
                <input
                  id="lp-elev"
                  className="lm-input lm-input--narrow"
                  type="number"
                  value={elevationMm}
                  onChange={(e) => setElevationMm(Number(e.target.value))}
                />
                <span className="lp-unit">мм</span>
              </div>
            ) : (
              <div className="lm-field">
                <label className="lm-label" htmlFor="lp-offset">
                  Смещение от верха слоя ниже (мм)
                </label>
                <input
                  id="lp-offset"
                  className="lm-input lm-input--narrow"
                  type="number"
                  value={offsetFromBelowMm}
                  onChange={(e) => setOffsetFromBelowMm(Number(e.target.value))}
                />
                <span className="lp-unit">мм</span>
                <p className="lp-micro">
                  Слой ниже — предыдущая строка в списке (снизу вверх). Для самого нижнего слоя используется
                  запасной базовый уровень из поля «Базовый уровень».
                </p>
              </div>
            )}

            {levelMode === "relativeToBelow" && (
              <div className="lm-field">
                <label className="lm-label" htmlFor="lp-fallback">
                  Запасной базовый уровень (мм)
                </label>
                <input
                  id="lp-fallback"
                  className="lm-input lm-input--narrow"
                  type="number"
                  value={elevationMm}
                  onChange={(e) => setElevationMm(Number(e.target.value))}
                />
                <span className="lp-unit">мм</span>
                <p className="lp-micro">Используется, если у слоя нет нижнего соседа в стеке.</p>
              </div>
            )}

            <div className="lm-field">
              <label className="lm-label" htmlFor="lp-manual-h">
                Высота слоя для расчёта следующего (мм)
              </label>
              <input
                id="lp-manual-h"
                className="lm-input lm-input--narrow"
                type="number"
                value={manualHeightMm}
                onChange={(e) => setManualHeightMm(Number(e.target.value))}
              />
              <span className="lp-unit">мм</span>
              <p className="lp-micro">
                Участвует в верхней отметке: max(геометрия слоя, расчётный низ + это значение). Для пустого слоя
                задайте толщину/высоту «воздуха», чтобы следующий слой опирался на неё.
              </p>
            </div>

            <div className="lp-readonly-block">
              <div className="lp-readonly-row">
                <span className="lp-readonly-label">Расчётный низ слоя</span>
                <span className="lp-readonly-val">{Math.round(activeSlice.computedBaseMm)} мм</span>
              </div>
              <div className="lp-readonly-row">
                <span className="lp-readonly-label">Расчётный верх слоя</span>
                <span className="lp-readonly-val">{Math.round(activeSlice.computedTopMm)} мм</span>
              </div>
              <p className="lp-micro lp-micro--tight">{topHint(activeSlice, manualHeightMm)}</p>
            </div>
          </div>
        )}

        {tab === "list" && (
          <div className="lp-panel" role="tabpanel">
            <div className="lm-field" style={{ marginBottom: "0.75rem" }}>
              <button
                type="button"
                className="lm-btn lm-btn--ghost lm-btn--sm"
                onClick={() => setListMode(listMode === "context" ? "project" : "context")}
              >
                {listMode === "context" ? "Показать все слои проекта" : "Только слои текущего раздела"}
              </button>
            </div>
            <p className="lp-stack-legend">
              Порядок в таблице: <strong>снизу вверх</strong> по зданию (первая строка — нижний слой). Перетащите строку
              или используйте стрелки.
              {listMode === "context" ? (
                <>
                  {" "}
                  Сейчас: только «{LAYER_DOMAIN_LABELS[scopeDomain]}».
                </>
              ) : null}
            </p>
            <div className="lp-table-wrap">
              <table className="lp-table lp-table--stack">
                <thead>
                  <tr>
                    <th className="lp-th-drag" scope="col" aria-label="Перетаскивание" />
                    <th className="lp-th-check" scope="col">
                      Видимость
                    </th>
                    <th scope="col">Название</th>
                    {listMode === "project" ? <th scope="col">Раздел</th> : null}
                    <th scope="col">Режим</th>
                    <th scope="col">По высоте</th>
                    <th scope="col">Стек</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLayersView.map((l, sortedIdx) => {
                    const isActive = l.id === activeId;
                    const checked = isActive || extraVisible.has(l.id);
                    const slice = getLayerVerticalSlice(project, l.id, verticalById);
                    const isDrag = dragLayerId === l.id;
                    const idxGlobal = fullSorted.findIndex((x) => x.id === l.id);
                    const upDisabled =
                      listMode === "context"
                        ? getAdjacentLayerIdInDomain(project, l.id, "next") === null
                        : idxGlobal < 0 || idxGlobal >= fullSorted.length - 1;
                    const downDisabled =
                      listMode === "context"
                        ? getAdjacentLayerIdInDomain(project, l.id, "previous") === null
                        : idxGlobal <= 0;
                    return (
                      <tr
                        key={l.id}
                        className={`${isActive ? "lp-row-active" : ""} ${isDrag ? "lp-row-drag" : ""}`}
                        draggable
                        onDragStart={(e) => onRowDragStart(e, l.id)}
                        onDragEnd={onRowDragEnd}
                        onDragOver={onRowDragOver}
                        onDrop={(e) => onRowDrop(e, sortedIdx)}
                      >
                        <td className="lp-drag-cell" title="Перетащить">
                          <span className="lp-drag-grip" aria-hidden>
                            ⋮⋮
                          </span>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="lp-check"
                            checked={checked}
                            disabled={isActive}
                            title={
                              isActive
                                ? "Текущий слой всегда отображается на плане"
                                : "Показать слой в 2D как вспомогательный"
                            }
                            onChange={() => {
                              if (!isActive) {
                                toggleVisibleLayer(l.id);
                              }
                            }}
                          />
                        </td>
                        <td>
                          <span className="lp-layer-name">{l.name}</span>
                          {isActive && (
                            <span className="lp-badge" title="Активный слой для редактирования">
                              Текущий
                            </span>
                          )}
                        </td>
                        {listMode === "project" ? (
                          <td className="lp-mode-cell">{LAYER_DOMAIN_LABELS[l.domain]}</td>
                        ) : null}
                        <td className="lp-mode-cell">
                          <span title={l.levelMode === "absolute" ? "От нуля проекта" : "От верха предыдущего слоя"}>
                            {modeLabel(l.levelMode)}
                          </span>
                        </td>
                        <td className="lp-num lp-range-cell" title="Расчётный низ → верх">
                          {Math.round(slice.computedBaseMm)}→{Math.round(slice.computedTopMm)} мм
                        </td>
                        <td className="lp-stack-actions">
                          <button
                            type="button"
                            className="lm-btn lm-btn--ghost lm-btn--sm"
                            title="Выше по зданию"
                            disabled={upDisabled}
                            onClick={() => reorderLayerDown(l.id)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="lm-btn lm-btn--ghost lm-btn--sm"
                            title="Ниже по зданию"
                            disabled={downDisabled}
                            onClick={() => reorderLayerUp(l.id)}
                          >
                            ↓
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="lp-hint">
              Дополнительные слои показываются приглушённо; редактировать можно только объекты текущего слоя.
            </p>
          </div>
        )}

        {applyError ? (
          <p className="lp-micro" role="alert" style={{ color: "var(--danger, #b91c1c)", marginTop: 8 }}>
            {applyError}
          </p>
        ) : null}

        <div className="lm-actions lp-actions">
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            disabled={!canApply || isSubmitting}
            onClick={() => {
              void handleApplyCurrent();
            }}
          >
            {isSubmitting ? "Сохранение…" : "Применить"}
          </button>
          <button type="button" className="lm-btn lm-btn--ghost" onClick={onClose} disabled={isSubmitting}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
