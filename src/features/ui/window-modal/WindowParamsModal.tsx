import { useEffect, useMemo, useState } from "react";

import type {
  OpeningAlongAnchor,
  OpeningAlongAlignment,
  OpeningSipConstructionSpec,
} from "@/core/domain/openingWindowTypes";
import { defaultOpeningSipConstruction } from "@/core/domain/openingFramingGenerate";
import type { SaveWindowParamsPayload } from "@/core/domain/openingWindowMutations";
import type { Project } from "@/core/domain/project";
import {
  DEFAULT_SILL_OVERHANG_MM,
  DEFAULT_VIEW_PRESET_KEY,
  DEFAULT_WINDOW_FORM_KEY,
  DEFAULT_WINDOW_HEIGHT_MM,
  DEFAULT_WINDOW_WIDTH_MM,
  WINDOW_FORM_OPTIONS,
  WINDOW_VIEW_PRESETS,
  type WindowFormKey,
  type WindowViewPresetKey,
} from "@/core/domain/windowFormCatalog";
import { useAppStore } from "@/store/useAppStore";

import { WindowFormPreview } from "./WindowFormPreview";
import { WindowPositionDimPreview } from "./WindowPositionDimPreview";
import { WindowSipConstructionPreview } from "./WindowSipConstructionPreview";

import "../layer-modals.css";
import "./window-params-modal.css";

function parsePositiveMm(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function parseNonNegativeMm(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

function boardLikeProfiles(project: Project) {
  return project.profiles.filter((p) => p.category === "board" || p.category === "beam" || p.category === "custom");
}

export function WindowParamsModal() {
  const addOpen = useAppStore((s) => s.addWindowModalOpen);
  const edit = useAppStore((s) => s.windowEditModal);
  const project = useAppStore((s) => s.currentProject);
  const closeAdd = useAppStore((s) => s.closeAddWindowModal);
  const applyAdd = useAppStore((s) => s.applyWindowFormModal);
  const closeEdit = useAppStore((s) => s.closeWindowEditModal);
  const applyEdit = useAppStore((s) => s.applyWindowEditModal);

  const editMode = edit != null;

  const [activeTab, setActiveTab] = useState<"form" | "position" | "sip">("form");
  const [formKey, setFormKey] = useState<WindowFormKey>(DEFAULT_WINDOW_FORM_KEY);
  const [widthStr, setWidthStr] = useState(String(DEFAULT_WINDOW_WIDTH_MM));
  const [heightStr, setHeightStr] = useState(String(DEFAULT_WINDOW_HEIGHT_MM));
  const [viewPreset, setViewPreset] = useState<WindowViewPresetKey>(DEFAULT_VIEW_PRESET_KEY);
  const [sillStr, setSillStr] = useState(String(DEFAULT_SILL_OVERHANG_MM));
  const [isEmpty, setIsEmpty] = useState(false);
  const [anchorAlongWall, setAnchorAlongWall] = useState<OpeningAlongAnchor>("wall_start");
  const [offsetAlongStr, setOffsetAlongStr] = useState("0");
  const [alignment, setAlignment] = useState<OpeningAlongAlignment>("center");
  const [sillLevelStr, setSillLevelStr] = useState("900");
  const [sipAboveId, setSipAboveId] = useState<string>("");
  const [sipAboveDouble, setSipAboveDouble] = useState(false);
  const [sipLintTopId, setSipLintTopId] = useState<string>("");
  const [sipLintTopDouble, setSipLintTopDouble] = useState(false);
  const [sipLintBotId, setSipLintBotId] = useState<string>("");
  const [sipLintBotDouble, setSipLintBotDouble] = useState(false);
  const [sipSideId, setSipSideId] = useState<string>("");
  const [sipSideType, setSipSideType] = useState<"type1" | "type2" | "type3">("type1");
  const [sipSideClosing, setSipSideClosing] = useState(false);
  const [sipBelowId, setSipBelowId] = useState<string>("");
  const [sipBelowDouble, setSipBelowDouble] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profiles = useMemo(() => boardLikeProfiles(project), [project.profiles]);
  const hasProfiles = profiles.length > 0;

  useEffect(() => {
    if (addOpen && !editMode) {
      setActiveTab("form");
      setFormKey(DEFAULT_WINDOW_FORM_KEY);
      setWidthStr(String(DEFAULT_WINDOW_WIDTH_MM));
      setHeightStr(String(DEFAULT_WINDOW_HEIGHT_MM));
      setViewPreset(DEFAULT_VIEW_PRESET_KEY);
      setSillStr(String(DEFAULT_SILL_OVERHANG_MM));
      setIsEmpty(false);
      setError(null);
    }
  }, [addOpen, editMode]);

  useEffect(() => {
    if (!edit) {
      return;
    }
    const o = project.openings.find((x) => x.id === edit.openingId);
    if (!o || o.kind !== "window") {
      return;
    }
    setActiveTab(edit.initialTab);
    setFormKey(o.formKey ?? DEFAULT_WINDOW_FORM_KEY);
    setWidthStr(String(o.widthMm));
    setHeightStr(String(o.heightMm));
    setViewPreset(o.viewPreset ?? DEFAULT_VIEW_PRESET_KEY);
    setSillStr(String(o.sillOverhangMm ?? DEFAULT_SILL_OVERHANG_MM));
    setIsEmpty(o.isEmptyOpening === true);
    const pos = o.position;
    if (pos) {
      setAnchorAlongWall(pos.anchorAlongWall);
      setOffsetAlongStr(String(pos.offsetAlongWallMm));
      setAlignment(pos.alignment);
      setSillLevelStr(String(pos.sillLevelMm));
    } else {
      setAnchorAlongWall("wall_start");
      setOffsetAlongStr("0");
      setAlignment("center");
      setSillLevelStr(String(o.sillHeightMm ?? 900));
    }
    const sip = o.sipConstruction ?? defaultOpeningSipConstruction(project.profiles);
    setSipAboveId(sip.aboveProfileId ?? "");
    setSipAboveDouble(sip.aboveDouble);
    setSipLintTopId(sip.lintelTopProfileId ?? "");
    setSipLintTopDouble(sip.lintelTopDouble === true);
    setSipLintBotId(sip.lintelBottomProfileId ?? "");
    setSipLintBotDouble(sip.lintelBottomDouble === true);
    setSipSideId(sip.sideProfileId ?? "");
    setSipSideType(sip.sideType);
    setSipSideClosing(sip.sideClosingStuds);
    setSipBelowId(sip.belowProfileId ?? "");
    setSipBelowDouble(sip.belowDouble);
    setError(null);
  }, [edit?.openingId, edit?.initialTab, project.openings, project.profiles]);

  const sipConstruction = useMemo(
    (): OpeningSipConstructionSpec => ({
      aboveProfileId: sipAboveId || null,
      aboveDouble: sipAboveDouble,
      lintelTopProfileId: sipLintTopId || null,
      lintelTopDouble: sipLintTopDouble,
      lintelBottomProfileId: sipLintBotId || null,
      lintelBottomDouble: sipLintBotDouble,
      sideProfileId: sipSideId || null,
      sideType: sipSideType,
      sideClosingStuds: sipSideClosing,
      belowProfileId: sipBelowId || null,
      belowDouble: sipBelowDouble,
    }),
    [
      sipAboveId,
      sipAboveDouble,
      sipLintTopId,
      sipLintTopDouble,
      sipLintBotId,
      sipLintBotDouble,
      sipSideId,
      sipSideType,
      sipSideClosing,
      sipBelowId,
      sipBelowDouble,
    ],
  );

  const open = addOpen || editMode;

  if (!open) {
    return null;
  }

  const widthMm = parsePositiveMm(widthStr);
  const heightMm = parsePositiveMm(heightStr);
  const sillMm = Number(String(sillStr).replace(",", ".").trim());
  const sillOk = Number.isFinite(sillMm) && sillMm >= 0;
  const offsetAlongMm = parseNonNegativeMm(offsetAlongStr);
  const sillLevelMm = parseNonNegativeMm(sillLevelStr);

  const positionSpec =
    offsetAlongMm !== null && sillLevelMm !== null
      ? {
          anchorAlongWall,
          offsetAlongWallMm: offsetAlongMm,
          alignment,
          sillLevelMm,
        }
      : null;

  const buildPayload = (): SaveWindowParamsPayload | null => {
    const w = parsePositiveMm(widthStr);
    const h = parsePositiveMm(heightStr);
    const sill = Number(String(sillStr).replace(",", ".").trim());
    if (w === null || h === null) {
      return null;
    }
    if (!Number.isFinite(sill) || sill < 0) {
      return null;
    }
    if (!positionSpec) {
      return null;
    }
    const fk = formKey;
    const opt = WINDOW_FORM_OPTIONS.find((o) => o.key === fk);
    return {
      formKey: fk,
      formName: opt?.name ?? "Прямоугольник",
      widthMm: w,
      heightMm: h,
      viewPreset,
      sillOverhangMm: sill,
      isEmptyOpening: isEmpty,
      position: positionSpec,
      sipConstruction,
    };
  };

  const submitAdd = () => {
    const w = parsePositiveMm(widthStr);
    const h = parsePositiveMm(heightStr);
    const sill = Number(String(sillStr).replace(",", ".").trim());
    if (w === null || h === null) {
      setError("Укажите ширину и высоту числами больше 0.");
      return;
    }
    if (!Number.isFinite(sill) || sill < 0) {
      setError("Наплыв должен быть неотрицательным числом.");
      return;
    }
    setError(null);
    applyAdd({
      formKey,
      widthMm: w,
      heightMm: h,
      viewPreset,
      sillOverhangMm: sill,
      isEmptyOpening: isEmpty,
    });
  };

  const submitEdit = () => {
    const payload = buildPayload();
    if (!payload) {
      setError("Проверьте числовые поля (ширина, высота, смещение, уровень).");
      return;
    }
    setError(null);
    applyEdit(payload);
  };

  const onBackdrop = () => {
    setError(null);
    if (editMode) {
      closeEdit();
    } else {
      closeAdd();
    }
  };

  const profileSelect = (id: string, setId: (s: string) => void, label: string) => (
    <div className="lm-field wp-field">
      <label className="lm-label">{label}</label>
      {!hasProfiles ? (
        <p className="wp-error wp-error--inline">Нет профилей доски/бруса. Создайте профиль в разделе «Профили».</p>
      ) : (
        <select className="lm-input" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">— не задано —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.id}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <div className="wp-backdrop" role="presentation" onClick={onBackdrop}>
      <div
        className="wp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wp-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wp-dialog-title" className="wp-dialog__title">
          {editMode ? "Параметры окна" : "Параметры"}
        </h2>

        <div className="wp-tabs" role="tablist" aria-label="Разделы параметров окна">
          <button
            type="button"
            role="tab"
            className="wp-tab"
            data-active={activeTab === "form"}
            aria-selected={activeTab === "form"}
            onClick={() => setActiveTab("form")}
          >
            Форма окна
          </button>
          <button
            type="button"
            role="tab"
            className="wp-tab"
            data-active={activeTab === "position"}
            aria-selected={activeTab === "position"}
            disabled={!editMode}
            title={!editMode ? "Доступно после установки на стену" : undefined}
            onClick={() => editMode && setActiveTab("position")}
          >
            Позиция
          </button>
          <button
            type="button"
            role="tab"
            className="wp-tab"
            data-active={activeTab === "sip"}
            aria-selected={activeTab === "sip"}
            disabled={!editMode}
            title={!editMode ? "Доступно после установки на стену" : undefined}
            onClick={() => editMode && setActiveTab("sip")}
          >
            Конструкция SIP
          </button>
        </div>

        {activeTab === "form" ? (
          <div className="wp-body">
            <div className="wp-form">
              {error ? (
                <p className="wp-error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-form-shape">
                  Форма окна
                </label>
                <select
                  id="wp-form-shape"
                  className="lm-input"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value as WindowFormKey)}
                >
                  {WINDOW_FORM_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="wp-field-row">
                <div className="lm-field wp-field">
                  <label className="lm-label" htmlFor="wp-h">
                    Высота (мм)
                  </label>
                  <input
                    id="wp-h"
                    className="lm-input"
                    type="text"
                    inputMode="decimal"
                    value={heightStr}
                    onChange={(e) => setHeightStr(e.target.value)}
                  />
                </div>
                <div className="lm-field wp-field">
                  <label className="lm-label" htmlFor="wp-w">
                    Ширина (мм)
                  </label>
                  <input
                    id="wp-w"
                    className="lm-input"
                    type="text"
                    inputMode="decimal"
                    value={widthStr}
                    onChange={(e) => setWidthStr(e.target.value)}
                  />
                </div>
              </div>

              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-view">
                  Вид окна
                </label>
                <select
                  id="wp-view"
                  className="lm-input"
                  value={viewPreset}
                  onChange={(e) => setViewPreset(e.target.value as WindowViewPresetKey)}
                >
                  {WINDOW_VIEW_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-sill">
                  Наплыв (мм)
                </label>
                <input
                  id="wp-sill"
                  className="lm-input lm-input--narrow"
                  type="text"
                  inputMode="decimal"
                  value={sillStr}
                  onChange={(e) => setSillStr(e.target.value)}
                />
              </div>

              <label className="wp-check">
                <input type="checkbox" checked={isEmpty} onChange={(e) => setIsEmpty(e.target.checked)} />
                Пустой проём
              </label>
            </div>

            <div className="wp-preview-wrap">
              <WindowFormPreview
                widthMm={widthMm ?? DEFAULT_WINDOW_WIDTH_MM}
                heightMm={heightMm ?? DEFAULT_WINDOW_HEIGHT_MM}
                viewPreset={viewPreset}
              />
            </div>
          </div>
        ) : null}

        {editMode && activeTab === "position" ? (
          <div className="wp-body">
            <div className="wp-form">
              {error ? (
                <p className="wp-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-anchor">
                  Смещение от
                </label>
                <select
                  id="wp-anchor"
                  className="lm-input"
                  value={anchorAlongWall}
                  onChange={(e) => setAnchorAlongWall(e.target.value as OpeningAlongAnchor)}
                >
                  <option value="wall_start">Начало стены</option>
                  <option value="wall_end">Конец стены</option>
                  <option value="wall_center">Центр стены</option>
                </select>
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-off-along">
                  Значение (мм) вдоль стены
                </label>
                <input
                  id="wp-off-along"
                  className="lm-input"
                  type="text"
                  inputMode="decimal"
                  value={offsetAlongStr}
                  onChange={(e) => setOffsetAlongStr(e.target.value)}
                />
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-align">
                  Выравнивание
                </label>
                <select
                  id="wp-align"
                  className="lm-input"
                  value={alignment}
                  onChange={(e) => setAlignment(e.target.value as OpeningAlongAlignment)}
                >
                  <option value="center">По центру</option>
                  <option value="leading">По левому краю</option>
                  <option value="trailing">По правому краю</option>
                </select>
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-sill-level">
                  Уровень низа проёма (мм)
                </label>
                <input
                  id="wp-sill-level"
                  className="lm-input"
                  type="text"
                  inputMode="decimal"
                  value={sillLevelStr}
                  onChange={(e) => setSillLevelStr(e.target.value)}
                />
              </div>
            </div>
            <div className="wp-preview-wrap wp-preview-wrap--position">
              <WindowPositionDimPreview
                widthMm={widthMm ?? DEFAULT_WINDOW_WIDTH_MM}
                heightMm={heightMm ?? DEFAULT_WINDOW_HEIGHT_MM}
                anchorAlongWall={anchorAlongWall}
                offsetAlongWallMm={offsetAlongMm ?? 0}
                alignment={alignment}
                sillLevelMm={sillLevelMm ?? 900}
              />
            </div>
          </div>
        ) : null}

        {editMode && activeTab === "sip" ? (
          <div className="wp-body wp-body--sip">
            <div className="wp-form wp-form--scroll">
              {error ? (
                <p className="wp-error" role="alert">
                  {error}
                </p>
              ) : null}
              <h3 className="wp-sip-h3">Над проёмом</h3>
              {profileSelect(sipAboveId, setSipAboveId, "Профиль")}
              <label className="wp-check">
                <input type="checkbox" checked={sipAboveDouble} onChange={(e) => setSipAboveDouble(e.target.checked)} />
                Двойной профиль
              </label>
              <h3 className="wp-sip-h3">Перемычка</h3>
              {profileSelect(sipLintTopId, setSipLintTopId, "Сверху")}
              <label className="wp-check">
                <input
                  type="checkbox"
                  checked={sipLintTopDouble}
                  onChange={(e) => setSipLintTopDouble(e.target.checked)}
                />
                Двойная (сверху)
              </label>
              {profileSelect(sipLintBotId, setSipLintBotId, "Снизу")}
              <label className="wp-check">
                <input
                  type="checkbox"
                  checked={sipLintBotDouble}
                  onChange={(e) => setSipLintBotDouble(e.target.checked)}
                />
                Двойная (снизу)
              </label>
              <h3 className="wp-sip-h3">Боковые</h3>
              {profileSelect(sipSideId, setSipSideId, "Профиль")}
              <div className="lm-field wp-field">
                <label className="lm-label" htmlFor="wp-side-type">
                  Тип
                </label>
                <select
                  id="wp-side-type"
                  className="lm-input"
                  value={sipSideType}
                  onChange={(e) => setSipSideType(e.target.value as "type1" | "type2" | "type3")}
                >
                  <option value="type1">Тип 1</option>
                  <option value="type2">Тип 2</option>
                  <option value="type3">Тип 3</option>
                </select>
              </div>
              <label className="wp-check">
                <input type="checkbox" checked={sipSideClosing} onChange={(e) => setSipSideClosing(e.target.checked)} />
                Закрывающие стойки
              </label>
              <h3 className="wp-sip-h3">Под проёмом</h3>
              {profileSelect(sipBelowId, setSipBelowId, "Профиль")}
              <label className="wp-check">
                <input type="checkbox" checked={sipBelowDouble} onChange={(e) => setSipBelowDouble(e.target.checked)} />
                Двойной профиль
              </label>
            </div>
            <div className="wp-preview-wrap wp-preview-wrap--sip-hint">
              <WindowSipConstructionPreview sip={sipConstruction} />
              <p className="wp-muted" style={{ marginTop: 12 }}>
                Профили из каталога проекта. Пустые поля при сохранении заполняются доской по умолчанию (например
                145×45). «Применить» пересобирает обрамление, SIP-панели стены (если расчёт уже выполнялся) и
                спецификацию.
              </p>
            </div>
          </div>
        ) : null}

        <div className="wp-actions">
          <button
            type="button"
            className="lm-btn lm-btn--ghost"
            onClick={() => {
              setError(null);
              if (editMode) {
                closeEdit();
              } else {
                closeAdd();
              }
            }}
          >
            Отмена
          </button>
          {editMode ? (
            <button
              type="button"
              className="lm-btn lm-btn--primary"
              disabled={!sillOk || widthMm === null || heightMm === null || positionSpec === null}
              onClick={submitEdit}
            >
              Сохранить
            </button>
          ) : (
            <button
              type="button"
              className="lm-btn lm-btn--primary"
              disabled={!sillOk || widthMm === null || heightMm === null}
              onClick={submitAdd}
            >
              Применить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
