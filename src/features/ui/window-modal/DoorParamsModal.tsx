import { useEffect, useMemo, useState } from "react";

import type { OpeningAlongAnchor, OpeningAlongAlignment } from "@/core/domain/openingWindowTypes";
import type { SaveDoorParamsPayload } from "@/core/domain/openingDoorMutations";
import { defaultOpeningSipConstruction } from "@/core/domain/openingFramingGenerate";
import { useAppStore } from "@/store/useAppStore";
import { DoorFormPreview } from "./DoorFormPreview";

import "../layer-modals.css";
import "./window-params-modal.css";

const DEFAULT_DOOR_WIDTH = 1000;
const DEFAULT_DOOR_HEIGHT = 2100;

function parsePositiveMm(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNonNegativeMm(raw: string): number | null {
  const n = Number(String(raw).replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function DoorParamsModal() {
  const addOpen = useAppStore((s) => s.addDoorModalOpen);
  const edit = useAppStore((s) => s.doorEditModal);
  const project = useAppStore((s) => s.currentProject);
  const closeAdd = useAppStore((s) => s.closeAddDoorModal);
  const applyAdd = useAppStore((s) => s.applyDoorFormModal);
  const closeEdit = useAppStore((s) => s.closeDoorEditModal);
  const applyEdit = useAppStore((s) => s.applyDoorEditModal);
  const editMode = edit != null;

  const [activeTab, setActiveTab] = useState<"form" | "position" | "sip">("form");
  const [heightStr, setHeightStr] = useState(String(DEFAULT_DOOR_HEIGHT));
  const [widthStr, setWidthStr] = useState(String(DEFAULT_DOOR_WIDTH));
  const [doorType, setDoorType] = useState<"single">("single");
  const [doorSwing, setDoorSwing] = useState<"in_right" | "in_left" | "out_right" | "out_left">("in_right");
  const [doorTrimStr, setDoorTrimStr] = useState("50");
  const [isEmpty, setIsEmpty] = useState(false);
  const [anchorAlongWall, setAnchorAlongWall] = useState<OpeningAlongAnchor>("wall_start");
  const [offsetAlongStr, setOffsetAlongStr] = useState("0");
  const [alignment, setAlignment] = useState<OpeningAlongAlignment>("center");
  const [levelStr, setLevelStr] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (addOpen && !editMode) {
      setActiveTab("form");
      setHeightStr(String(DEFAULT_DOOR_HEIGHT));
      setWidthStr(String(DEFAULT_DOOR_WIDTH));
      setDoorType("single");
      setDoorSwing("in_right");
      setDoorTrimStr("50");
      setIsEmpty(false);
      setError(null);
    }
  }, [addOpen, editMode]);

  useEffect(() => {
    if (!edit) {
      return;
    }
    const o = project.openings.find((x) => x.id === edit.openingId);
    if (!o || o.kind !== "door") {
      return;
    }
    setActiveTab(edit.initialTab);
    setHeightStr(String(o.heightMm));
    setWidthStr(String(o.widthMm));
    setDoorType(o.doorType ?? "single");
    setDoorSwing(o.doorSwing ?? "in_right");
    setDoorTrimStr(String(o.doorTrimMm ?? 50));
    setIsEmpty(o.isEmptyOpening === true);
    setAnchorAlongWall(o.position?.anchorAlongWall ?? "wall_start");
    setOffsetAlongStr(String(o.position?.offsetAlongWallMm ?? 0));
    setAlignment(o.position?.alignment ?? "center");
    setLevelStr(String(o.position?.sillLevelMm ?? 0));
    setError(null);
  }, [edit?.openingId, edit?.initialTab, project.openings]);

  const sipConstruction = useMemo(() => defaultOpeningSipConstruction(project.profiles), [project.profiles]);

  const open = addOpen || editMode;
  if (!open) {
    return null;
  }

  const widthMm = parsePositiveMm(widthStr);
  const heightMm = parsePositiveMm(heightStr);
  const trimMm = parseNonNegativeMm(doorTrimStr);
  const offsetAlongMm = parseNonNegativeMm(offsetAlongStr);
  const levelMm = parseNonNegativeMm(levelStr);

  const positionSpec =
    offsetAlongMm != null && levelMm != null
      ? {
          anchorAlongWall,
          offsetAlongWallMm: offsetAlongMm,
          alignment,
          sillLevelMm: levelMm,
        }
      : null;

  const submitAdd = () => {
    if (widthMm == null || heightMm == null || trimMm == null) {
      setError("Проверьте размеры двери и наличника.");
      return;
    }
    setError(null);
    applyAdd({ widthMm, heightMm, doorType, doorSwing, doorTrimMm: trimMm, isEmptyOpening: isEmpty });
  };

  const submitEdit = () => {
    if (widthMm == null || heightMm == null || trimMm == null || !positionSpec) {
      setError("Проверьте числовые поля.");
      return;
    }
    const payload: SaveDoorParamsPayload = {
      widthMm,
      heightMm,
      isEmptyOpening: isEmpty,
      doorType,
      doorSwing,
      doorTrimMm: trimMm,
      position: positionSpec,
      sipConstruction,
    };
    setError(null);
    applyEdit(payload);
  };

  return (
    <div className="wp-backdrop" role="presentation" onClick={() => (editMode ? closeEdit() : closeAdd())}>
      <div className="wp-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="wp-dialog__title">{editMode ? "Параметры двери" : "Добавить дверь"}</h2>
        <div className="wp-tabs" role="tablist">
          <button type="button" role="tab" className="wp-tab" data-active={activeTab === "form"} onClick={() => setActiveTab("form")}>
            Форма двери
          </button>
          <button type="button" role="tab" className="wp-tab" data-active={activeTab === "position"} onClick={() => setActiveTab("position")}>
            Позиция
          </button>
          <button type="button" role="tab" className="wp-tab" data-active={activeTab === "sip"} onClick={() => setActiveTab("sip")}>
            Конструкция SIP
          </button>
        </div>

        {activeTab === "form" ? (
          <div className="wp-body">
            <div className="wp-form">
              {error ? <p className="wp-error">{error}</p> : null}
              <div className="wp-field-row">
                <div className="lm-field wp-field">
                  <label className="lm-label">Высота (мм)</label>
                  <input className="lm-input" value={heightStr} onChange={(e) => setHeightStr(e.target.value)} />
                </div>
                <div className="lm-field wp-field">
                  <label className="lm-label">Ширина (мм)</label>
                  <input className="lm-input" value={widthStr} onChange={(e) => setWidthStr(e.target.value)} />
                </div>
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label">Тип двери</label>
                <select className="lm-input" value={doorType} disabled={isEmpty} onChange={(e) => setDoorType(e.target.value as "single")}>
                  <option value="single">Одиночная дверь</option>
                </select>
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label">Открывание</label>
                <select
                  className="lm-input"
                  value={doorSwing}
                  disabled={isEmpty}
                  onChange={(e) => setDoorSwing(e.target.value as "in_right" | "in_left" | "out_right" | "out_left")}
                >
                  <option value="in_right">На себя, направо</option>
                  <option value="in_left">На себя, налево</option>
                  <option value="out_right">От себя, направо</option>
                  <option value="out_left">От себя, налево</option>
                </select>
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label">Наличник (мм)</label>
                <input className="lm-input" value={doorTrimStr} disabled={isEmpty} onChange={(e) => setDoorTrimStr(e.target.value)} />
              </div>
              <label className="wp-check">
                <input type="checkbox" checked={isEmpty} onChange={(e) => setIsEmpty(e.target.checked)} />
                Пустой проём
              </label>
            </div>
            <div className="wp-preview-wrap">
              <DoorFormPreview
                widthMm={widthMm ?? DEFAULT_DOOR_WIDTH}
                heightMm={heightMm ?? DEFAULT_DOOR_HEIGHT}
                doorType={doorType}
                doorSwing={doorSwing}
                isEmptyOpening={isEmpty}
                trimMm={trimMm ?? 0}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "position" ? (
          <div className="wp-body wp-body--single">
            <div className="wp-form">
              {error ? <p className="wp-error">{error}</p> : null}
              <div className="lm-field wp-field">
                <label className="lm-label">От</label>
                <select className="lm-input" value={anchorAlongWall} onChange={(e) => setAnchorAlongWall(e.target.value as OpeningAlongAnchor)}>
                  <option value="wall_start">Начало стены (0)</option>
                  <option value="wall_end">Конец стены</option>
                  <option value="wall_center">Центр стены</option>
                </select>
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label">Значение (мм)</label>
                <input className="lm-input" value={offsetAlongStr} onChange={(e) => setOffsetAlongStr(e.target.value)} />
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label">Выравнивание</label>
                <select className="lm-input" value={alignment} onChange={(e) => setAlignment(e.target.value as OpeningAlongAlignment)}>
                  <option value="center">По центру</option>
                  <option value="leading">По левому краю</option>
                  <option value="trailing">По правому краю</option>
                </select>
              </div>
              <div className="lm-field wp-field">
                <label className="lm-label">Уровень (мм)</label>
                <input className="lm-input" value={levelStr} onChange={(e) => setLevelStr(e.target.value)} />
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "sip" ? (
          <div className="wp-body wp-body--single">
            <div className="wp-form">
              {error ? <p className="wp-error">{error}</p> : null}
              <p className="wp-muted">Черновая вкладка SIP для двери. Параметры сохраняются вместе с проёмом.</p>
            </div>
          </div>
        ) : null}

        <div className="wp-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={() => (editMode ? closeEdit() : closeAdd())}>
            Отмена
          </button>
          <button type="button" className="lm-btn lm-btn--primary" onClick={editMode ? submitEdit : submitAdd}>
            {editMode ? "Сохранить" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}

