import { useCallback, useEffect, useMemo, useState } from "react";

import { newEntityId } from "@/core/domain/ids";
import type {
  Profile,
  ProfileCategory,
  ProfileCompositionMode,
  ProfileLayer,
  ProfileMaterialType,
} from "@/core/domain/profile";
import {
  computeProfileTotalThicknessMm,
  formatProfileSummary,
  sortProfileLayersByOrder,
} from "@/core/domain/profileOps";
import {
  DEFAULT_WALL_MANUFACTURING,
  inferFrameMemberWidthMmFromProfile,
  type DoorOpeningFramingPreset,
  type WallManufacturingSettings,
  type WindowOpeningFramingPreset,
} from "@/core/domain/wallManufacturing";
import { validateProfile } from "@/core/domain/profileValidation";
import { useAppStore } from "@/store/useAppStore";

import "./profiles-modal.css";

const CATEGORY_LABELS: Record<ProfileCategory, string> = {
  wall: "Стена",
  slab: "Перекрытие",
  roof: "Кровля",
  beam: "Балка",
  pipe: "Труба",
  board: "Доска/брус",
  custom: "Другое",
};

const MATERIAL_OPTIONS: { value: ProfileMaterialType; label: string }[] = [
  { value: "osb", label: "OSB" },
  { value: "eps", label: "EPS" },
  { value: "xps", label: "XPS" },
  { value: "wood", label: "Дерево" },
  { value: "steel", label: "Сталь" },
  { value: "gypsum", label: "Гипсокартон" },
  { value: "concrete", label: "Бетон" },
  { value: "membrane", label: "Мембрана" },
  { value: "insulation", label: "Изоляция" },
  { value: "custom", label: "Другое" },
];

function cloneProfile(p: Profile): Profile {
  return JSON.parse(JSON.stringify(p)) as Profile;
}

function createEmptyDraft(): Profile {
  const t = new Date().toISOString();
  return {
    id: newEntityId(),
    name: "Новый профиль",
    category: "wall",
    compositionMode: "layered",
    layers: [
      {
        id: newEntityId(),
        orderIndex: 0,
        materialName: "Материал",
        materialType: "custom" as ProfileMaterialType,
        thicknessMm: 10,
      },
    ],
    markPrefix: "1S",
    createdAt: t,
    updatedAt: t,
  };
}

function normalizeWallManufacturing(
  wm: Partial<WallManufacturingSettings> | undefined,
  profile?: Profile,
): WallManufacturingSettings {
  const base = { ...DEFAULT_WALL_MANUFACTURING, ...(wm ?? {}) };
  const model = base.calculationModel ?? DEFAULT_WALL_MANUFACTURING.calculationModel;
  const extra: {
    panelNominalWidthMm?: number;
    panelNominalHeightMm?: number;
    frameMemberWidthMm?: number;
  } = {};
  if (model === "frame" && profile) {
    if (profile.defaultWidthMm != null && profile.defaultWidthMm > 0) {
      extra.panelNominalWidthMm = Math.round(profile.defaultWidthMm);
    }
    if (profile.defaultHeightMm != null && profile.defaultHeightMm > 0) {
      extra.panelNominalHeightMm = Math.round(profile.defaultHeightMm);
    }
    if (base.frameMemberWidthMm == null) {
      const inferred = inferFrameMemberWidthMmFromProfile(profile);
      if (inferred != null && inferred > 0) {
        extra.frameMemberWidthMm = inferred;
      }
    }
  }
  return { ...base, ...extra } as WallManufacturingSettings;
}

interface ProfilesModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function ProfilesModal({ open, onClose }: ProfilesModalProps) {
  const project = useAppStore((s) => s.currentProject);
  const upsertProfile = useAppStore((s) => s.upsertProfile);
  const removeProfileById = useAppStore((s) => s.removeProfileById);
  const duplicateProfileById = useAppStore((s) => s.duplicateProfileById);

  const [draft, setDraft] = useState<Profile | null>(null);
  const [localErrors, setLocalErrors] = useState<string[]>([]);

  const sortedProfiles = useMemo(
    () => [...project.profiles].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [project.profiles],
  );

  const syncDraftFromId = useCallback(
    (id: string) => {
      const p = project.profiles.find((x) => x.id === id);
      setDraft(p ? cloneProfile(p) : null);
      setLocalErrors([]);
    },
    [project.profiles],
  );

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setLocalErrors([]);
      return;
    }
    const list = useAppStore.getState().currentProject.profiles;
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (sorted.length === 0) {
      setDraft(createEmptyDraft());
    } else {
      setDraft(cloneProfile(sorted[0]!));
    }
    setLocalErrors([]);
  }, [open]);

  if (!open) {
    return null;
  }

  const updateDraft = (next: Profile) => {
    setDraft(next);
    setLocalErrors([]);
  };

  const patchWallManufacturing = (patch: Partial<WallManufacturingSettings>) => {
    if (!draft) {
      return;
    }
    updateDraft({
      ...draft,
      wallManufacturing: normalizeWallManufacturing(
        {
          ...draft.wallManufacturing,
          ...patch,
        },
        draft,
      ),
    });
  };

  const handleSave = () => {
    if (!draft) {
      return;
    }
    const toSave: Profile = {
      ...draft,
      wallManufacturing: normalizeWallManufacturing(draft.wallManufacturing, draft),
    };
    const errs = validateProfile(toSave);
    if (errs.length > 0) {
      setLocalErrors(errs);
      return;
    }
    const ok = upsertProfile(toSave);
    if (ok) {
      setLocalErrors([]);
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Удалить этот профиль?")) {
      return;
    }
    removeProfileById(id);
    if (draft?.id === id) {
      const rest = project.profiles.filter((p) => p.id !== id);
      setDraft(rest[0] ? cloneProfile(rest[0]) : createEmptyDraft());
    }
  };

  const handleDuplicate = (id: string) => {
    const prevIds = new Set(useAppStore.getState().currentProject.profiles.map((p) => p.id));
    duplicateProfileById(id);
    const np = useAppStore.getState().currentProject.profiles;
    const newbie = np.find((p) => !prevIds.has(p.id));
    if (newbie) {
      setDraft(cloneProfile(newbie));
    }
  };

  const setCompositionMode = (mode: ProfileCompositionMode) => {
    if (!draft) {
      return;
    }
    if (mode === "solid") {
      const layers = draft.layers.length
        ? [sortProfileLayersByOrder([...draft.layers])[0]!]
        : [
            {
              id: newEntityId(),
              orderIndex: 0,
              materialName: "Сечение",
              materialType: "wood" as ProfileMaterialType,
              thicknessMm: draft.defaultThicknessMm ?? 100,
            },
          ];
      updateDraft({
        ...draft,
        compositionMode: "solid",
        layers,
      });
    } else {
      const layers =
        draft.layers.length > 0
          ? sortProfileLayersByOrder([...draft.layers]).map((l, i) => ({ ...l, orderIndex: i }))
          : [
              {
                id: newEntityId(),
                orderIndex: 0,
                materialName: "Слой 1",
                materialType: "custom" as ProfileMaterialType,
                thicknessMm: 10,
              },
            ];
      updateDraft({
        ...draft,
        compositionMode: "layered",
        layers,
      });
    }
  };

  const moveLayer = (layerId: string, dir: -1 | 1) => {
    if (!draft || draft.compositionMode !== "layered") {
      return;
    }
    const sorted = sortProfileLayersByOrder([...draft.layers]);
    const i = sorted.findIndex((l) => l.id === layerId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) {
      return;
    }
    [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
    const layers = sorted.map((l, idx) => ({ ...l, orderIndex: idx }));
    updateDraft({ ...draft, layers });
  };

  const addLayer = () => {
    if (!draft || draft.compositionMode !== "layered") {
      return;
    }
    const sorted = sortProfileLayersByOrder([...draft.layers]);
    const next: ProfileLayer = {
      id: newEntityId(),
      orderIndex: sorted.length,
      materialName: "Новый слой",
      materialType: "custom" as ProfileMaterialType,
      thicknessMm: 10,
    };
    updateDraft({ ...draft, layers: [...sorted, next] });
  };

  const removeLayer = (layerId: string) => {
    if (!draft) {
      return;
    }
    const rest = draft.layers.filter((l) => l.id !== layerId);
    const fixed = sortProfileLayersByOrder([...rest]).map((l, i) => ({ ...l, orderIndex: i }));
    updateDraft({ ...draft, layers: fixed });
  };

  const patchLayer = (layerId: string, patch: Partial<ProfileLayer>) => {
    if (!draft) {
      return;
    }
    updateDraft({
      ...draft,
      layers: draft.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    });
  };

  const totalMm = draft ? computeProfileTotalThicknessMm(draft) : 0;

  return (
    <div className="pm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pm-head">
          <h2 id="pm-title" className="pm-title">
            Профили
          </h2>
          <button type="button" className="pm-btn pm-btn--ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="pm-body">
          <div className="pm-list-pane">
            <div className="pm-list-actions">
              <button
                type="button"
                className="pm-btn pm-btn--primary"
                style={{ width: "100%" }}
                onClick={() => {
                  const d = createEmptyDraft();
                  setDraft(d);
                  setLocalErrors([]);
                }}
              >
                + Создать профиль
              </button>
            </div>
            <div className="pm-list-scroll">
              {sortedProfiles.length === 0 && (
                <div className="pm-empty">Список пуст. Создайте профиль или сохраните черновик справа.</div>
              )}
                {sortedProfiles.map((p) => (
                <div key={p.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`pm-row ${draft?.id === p.id ? "pm-row--active" : ""}`}
                    onClick={() => syncDraftFromId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        syncDraftFromId(p.id);
                      }
                    }}
                  >
                    <span className="pm-row-title">{p.name}</span>
                    <span className="pm-row-meta">
                      {CATEGORY_LABELS[p.category]} · {formatProfileSummary(p)}
                    </span>
                    <div className="pm-row-btns">
                      <button
                        type="button"
                        className="pm-btn pm-btn--sm pm-btn--ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(p.id);
                        }}
                      >
                        Дублировать
                      </button>
                      <button
                        type="button"
                        className="pm-btn pm-btn--sm pm-btn--ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pm-edit-pane">
            {!draft ? (
              <div className="pm-empty">Выберите профиль слева или создайте новый.</div>
            ) : (
              <>
                <div className="pm-field">
                  <label className="pm-label" htmlFor="pm-name">
                    Название
                  </label>
                  <input
                    id="pm-name"
                    className="pm-input"
                    value={draft.name}
                    onChange={(e) => updateDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="pm-row2">
                  <div className="pm-field">
                    <label className="pm-label" htmlFor="pm-cat">
                      Категория
                    </label>
                    <select
                      id="pm-cat"
                      className="pm-select"
                      value={draft.category}
                      onChange={(e) =>
                        updateDraft({ ...draft, category: e.target.value as ProfileCategory })
                      }
                    >
                      {(Object.keys(CATEGORY_LABELS) as ProfileCategory[]).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="pm-field">
                    <label className="pm-label" htmlFor="pm-mode">
                      Режим
                    </label>
                    <select
                      id="pm-mode"
                      className="pm-select"
                      value={draft.compositionMode}
                      onChange={(e) => setCompositionMode(e.target.value as ProfileCompositionMode)}
                    >
                      <option value="layered">Составной (слои)</option>
                      <option value="solid">Цельный / сечение</option>
                    </select>
                  </div>
                </div>

                {draft.category === "wall" ? (
                  <div className="pm-field">
                    <label className="pm-label" htmlFor="pm-mark">
                      Префикс маркировки стены
                    </label>
                    <input
                      id="pm-mark"
                      className="pm-input"
                      value={draft.markPrefix ?? ""}
                      placeholder="1S"
                      autoComplete="off"
                      onChange={(e) => updateDraft({ ...draft, markPrefix: e.target.value })}
                    />
                    <p className="muted" style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5 }}>
                      Автоматические марки: 1S_1, 1S_2… по порядку создания стен в проекте.
                    </p>
                  </div>
                ) : null}

                <div className="pm-row2">
                  <div className="pm-field">
                    <label className="pm-label" htmlFor="pm-h">
                      Высота по умолчанию, мм
                    </label>
                    <input
                      id="pm-h"
                      className="pm-input"
                      type="number"
                      value={draft.defaultHeightMm ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value;
                        updateDraft({
                          ...draft,
                          defaultHeightMm: v === "" ? undefined : Number(v),
                        });
                      }}
                    />
                  </div>
                  <div className="pm-field">
                    <label className="pm-label" htmlFor="pm-w">
                      Ширина по умолчанию, мм
                    </label>
                    <input
                      id="pm-w"
                      className="pm-input"
                      type="number"
                      value={draft.defaultWidthMm ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value;
                        updateDraft({
                          ...draft,
                          defaultWidthMm: v === "" ? undefined : Number(v),
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="pm-field">
                  <label className="pm-label" htmlFor="pm-d">
                    Толщина/глубина по умолчанию, мм {draft.compositionMode === "solid" ? "(если без слоёв)" : ""}
                  </label>
                  <input
                    id="pm-d"
                    className="pm-input"
                    type="number"
                    value={draft.defaultThicknessMm ?? ""}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value;
                      updateDraft({
                        ...draft,
                        defaultThicknessMm: v === "" ? undefined : Number(v),
                      });
                    }}
                  />
                </div>

                {draft.category === "wall" ? (
                  <div className="pm-row2">
                    <div className="pm-field">
                      <label className="pm-label" htmlFor="pm-calc-model">
                        Модель расчёта
                      </label>
                      <select
                        id="pm-calc-model"
                        className="pm-select"
                        value={draft.wallManufacturing?.calculationModel ?? "frame"}
                        onChange={(e) =>
                          patchWallManufacturing({
                            calculationModel: e.target.value as "sip" | "frame",
                          })}
                      >
                        <option value="frame">Каркас/перегородка</option>
                        <option value="sip">SIP</option>
                      </select>
                    </div>
                    <div className="pm-field">
                      <label className="pm-label" htmlFor="pm-stud-spacing">
                        Шаг каркаса, мм
                      </label>
                      <input
                        id="pm-stud-spacing"
                        className="pm-input"
                        type="number"
                        value={draft.wallManufacturing?.studSpacingMm ?? ""}
                        placeholder="400 / 600"
                        onChange={(e) => {
                          const v = e.target.value;
                          patchWallManufacturing({
                            studSpacingMm: v === "" ? DEFAULT_WALL_MANUFACTURING.studSpacingMm : Number(v),
                          });
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {draft.category === "wall" &&
                (draft.wallManufacturing?.calculationModel ?? "frame") === "frame" ? (
                  <div className="pm-row2">
                    <div className="pm-field">
                      <label className="pm-label" htmlFor="pm-door-opening-preset">
                        Схема проёма: дверь
                      </label>
                      <select
                        id="pm-door-opening-preset"
                        className="pm-select"
                        value={draft.wallManufacturing?.doorOpeningFramingPreset ?? "frame_gkl_door"}
                        onChange={(e) =>
                          patchWallManufacturing({
                            doorOpeningFramingPreset: e.target.value as DoorOpeningFramingPreset,
                          })
                        }
                      >
                        <option value="frame_gkl_door">Каркас / ГКЛ</option>
                        <option value="sip_standard">Как у SIP (3 сегмента)</option>
                      </select>
                    </div>
                    <div className="pm-field">
                      <label className="pm-label" htmlFor="pm-window-opening-preset">
                        Схема проёма: окно
                      </label>
                      <select
                        id="pm-window-opening-preset"
                        className="pm-select"
                        value={draft.wallManufacturing?.windowOpeningFramingPreset ?? "frame_gkl_window"}
                        onChange={(e) =>
                          patchWallManufacturing({
                            windowOpeningFramingPreset: e.target.value as WindowOpeningFramingPreset,
                          })
                        }
                      >
                        <option value="frame_gkl_window">Каркас / ГКЛ</option>
                        <option value="sip_standard">Как у SIP</option>
                        <option value="frame_reinforced">Усиленный каркас</option>
                      </select>
                    </div>
                  </div>
                ) : null}

                {draft.category === "wall" ? (
                  <div className="pm-row2">
                    <div className="pm-field">
                      <label className="pm-label" htmlFor="pm-frame-material">
                        Материал каркаса
                      </label>
                      <select
                        id="pm-frame-material"
                        className="pm-select"
                        value={draft.wallManufacturing?.frameMaterial ?? "wood"}
                        onChange={(e) =>
                          patchWallManufacturing({
                            frameMaterial: e.target.value as "wood" | "steel",
                          })}
                      >
                        <option value="wood">Дерево</option>
                        <option value="steel">Металл</option>
                      </select>
                    </div>
                    {(draft.wallManufacturing?.calculationModel ?? "frame") === "frame" ? (
                      <div className="pm-field">
                        <label className="pm-label" htmlFor="pm-frame-member-w">
                          Ширина профиля каркаса, мм
                        </label>
                        <input
                          id="pm-frame-member-w"
                          className="pm-input"
                          type="number"
                          value={draft.wallManufacturing?.frameMemberWidthMm ?? ""}
                          placeholder="из слоя стали"
                          onChange={(e) => {
                            const v = e.target.value;
                            patchWallManufacturing({
                              frameMemberWidthMm: v === "" ? undefined : Number(v),
                            });
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {draft.category === "wall" &&
                (draft.wallManufacturing?.calculationModel ?? "frame") === "frame" &&
                draft.wallManufacturing?.frameMaterial === "steel" ? (
                  <div className="pm-row2" style={{ alignItems: "flex-start" }}>
                    <div className="pm-field" style={{ flex: 1, minWidth: 200 }}>
                      <label className="pm-label" htmlFor="pm-partition-stud">
                        Стойка (шир×полка), мм
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          id="pm-partition-stud"
                          className="pm-input"
                          type="number"
                          title="Ширина профиля по нормали к стене"
                          value={draft.wallManufacturing?.framePartitionStudWidthMm ?? ""}
                          placeholder="75"
                          onChange={(e) => {
                            const v = e.target.value;
                            patchWallManufacturing({
                              framePartitionStudWidthMm: v === "" ? undefined : Number(v),
                            });
                          }}
                        />
                        <input
                          className="pm-input"
                          type="number"
                          title="Полка вдоль стены"
                          value={draft.wallManufacturing?.framePartitionStudDepthAlongWallMm ?? ""}
                          placeholder="50"
                          onChange={(e) => {
                            const v = e.target.value;
                            patchWallManufacturing({
                              framePartitionStudDepthAlongWallMm: v === "" ? undefined : Number(v),
                            });
                          }}
                        />
                      </div>
                    </div>
                    <div className="pm-field" style={{ flex: 1, minWidth: 200 }}>
                      <label className="pm-label" htmlFor="pm-partition-track">
                        Направляющая (шир×высота), мм
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          id="pm-partition-track"
                          className="pm-input"
                          type="number"
                          title="Ширина направляющей"
                          value={draft.wallManufacturing?.framePartitionTrackWidthMm ?? ""}
                          placeholder="75"
                          onChange={(e) => {
                            const v = e.target.value;
                            patchWallManufacturing({
                              framePartitionTrackWidthMm: v === "" ? undefined : Number(v),
                            });
                          }}
                        />
                        <input
                          className="pm-input"
                          type="number"
                          title="Высота профиля в фасаде"
                          value={draft.wallManufacturing?.framePartitionTrackDepthMm ?? ""}
                          placeholder="40"
                          onChange={(e) => {
                            const v = e.target.value;
                            patchWallManufacturing({
                              framePartitionTrackDepthMm: v === "" ? undefined : Number(v),
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="pm-field">
                  <label className="pm-label" htmlFor="pm-notes">
                    Примечание
                  </label>
                  <textarea
                    id="pm-notes"
                    className="pm-textarea"
                    value={draft.notes ?? ""}
                    onChange={(e) => updateDraft({ ...draft, notes: e.target.value || undefined })}
                  />
                </div>

                {draft.compositionMode === "layered" && (
                  <>
                    <div className="pm-label" style={{ marginBottom: 8 }}>
                      Слои (снизу вверх по порядку)
                    </div>
                    {sortProfileLayersByOrder([...draft.layers]).map((layer, idx) => (
                      <div key={layer.id} className="pm-layer-card">
                        <div className="pm-row2">
                          <div className="pm-field" style={{ marginBottom: 0 }}>
                            <label className="pm-label">Материал</label>
                            <input
                              className="pm-input"
                              value={layer.materialName}
                              onChange={(e) => patchLayer(layer.id, { materialName: e.target.value })}
                            />
                          </div>
                          <div className="pm-field" style={{ marginBottom: 0 }}>
                            <label className="pm-label">Тип</label>
                            <select
                              className="pm-select"
                              value={layer.materialType}
                              onChange={(e) =>
                                patchLayer(layer.id, { materialType: e.target.value as ProfileMaterialType })
                              }
                            >
                              {MATERIAL_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="pm-field" style={{ marginBottom: 0 }}>
                          <label className="pm-label">Толщина слоя, мм</label>
                          <input
                            className="pm-input"
                            type="number"
                            value={layer.thicknessMm}
                            onChange={(e) =>
                              patchLayer(layer.id, { thicknessMm: Number(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div className="pm-layer-actions">
                          <button
                            type="button"
                            className="pm-btn pm-btn--sm"
                            disabled={idx === 0}
                            onClick={() => moveLayer(layer.id, -1)}
                          >
                            Вверх
                          </button>
                          <button
                            type="button"
                            className="pm-btn pm-btn--sm"
                            disabled={idx >= draft.layers.length - 1}
                            onClick={() => moveLayer(layer.id, 1)}
                          >
                            Вниз
                          </button>
                          <button type="button" className="pm-btn pm-btn--sm pm-btn--ghost" onClick={() => removeLayer(layer.id)}>
                            Удалить слой
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="pm-btn pm-btn--ghost" onClick={addLayer}>
                      + Добавить слой
                    </button>
                  </>
                )}

                {draft.compositionMode === "solid" && (
                  <div>
                    <div className="pm-label" style={{ marginBottom: 8 }}>
                      Сечение (один материал)
                    </div>
                    {draft.layers.slice(0, 1).map((layer) => (
                      <div key={layer.id} className="pm-layer-card">
                        <div className="pm-row2">
                          <div className="pm-field" style={{ marginBottom: 0 }}>
                            <label className="pm-label">Материал</label>
                            <input
                              className="pm-input"
                              value={layer.materialName}
                              onChange={(e) => patchLayer(layer.id, { materialName: e.target.value })}
                            />
                          </div>
                          <div className="pm-field" style={{ marginBottom: 0 }}>
                            <label className="pm-label">Тип</label>
                            <select
                              className="pm-select"
                              value={layer.materialType}
                              onChange={(e) =>
                                patchLayer(layer.id, { materialType: e.target.value as ProfileMaterialType })
                              }
                            >
                              {MATERIAL_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="pm-field" style={{ marginBottom: 0 }}>
                          <label className="pm-label">Толщина сечения, мм</label>
                          <input
                            className="pm-input"
                            type="number"
                            value={layer.thicknessMm}
                            onChange={(e) =>
                              patchLayer(layer.id, { thicknessMm: Number(e.target.value) || 0 })
                            }
                          />
                        </div>
                      </div>
                    ))}
                    {draft.layers.length === 0 && (
                      <p className="pm-empty" style={{ padding: 0 }}>
                        Укажите толщину по умолчанию выше или добавьте слой через переключение в «Составной».
                      </p>
                    )}
                  </div>
                )}

                <div className="pm-badge-total">Итоговая толщина: {totalMm > 0 ? `${Math.round(totalMm)} мм` : "—"}</div>

                {localErrors.length > 0 && (
                  <div className="pm-err" role="alert">
                    {localErrors.map((e) => (
                      <div key={e}>{e}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="pm-foot">
          <button type="button" className="pm-btn pm-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="pm-btn pm-btn--primary" disabled={!draft} onClick={handleSave}>
            Сохранить профиль
          </button>
        </div>
      </div>
    </div>
  );
}
