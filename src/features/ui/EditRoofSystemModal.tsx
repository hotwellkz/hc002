import { useEffect, useMemo, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { isProfileUsableForRoofPlane } from "@/core/domain/roofPlane";
import type { RoofSystemKind } from "@/core/domain/roofSystem";
import type { MonoCardinalDrain } from "@/core/domain/roofSystemRectangleGeometry";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

function monoCardinalFromDrainUnit(dx: number, dy: number): MonoCardinalDrain {
  if (Math.abs(dx) <= Math.abs(dy)) {
    return dy < 0 ? "s" : "n";
  }
  return dx > 0 ? "e" : "w";
}

export function EditRoofSystemModal() {
  const modal = useAppStore((s) => s.roofSystemEditModal);
  const close = useAppStore((s) => s.closeRoofSystemEditModal);
  const apply = useAppStore((s) => s.applyRoofSystemEditModal);
  const project = useAppStore((s) => s.currentProject);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const system = useMemo(() => {
    if (!modal) {
      return null;
    }
    return project.roofSystems.find((s) => s.id === modal.roofSystemId) ?? null;
  }, [modal, project.roofSystems]);

  const roofProfiles = useMemo(
    () => project.profiles.filter((pr) => isProfileUsableForRoofPlane(pr)).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [project.profiles],
  );

  const [angleDeg, setAngleDeg] = useState(15);
  const [levelMm, setLevelMm] = useState(0);
  const [profileId, setProfileId] = useState("");
  const [roofKind, setRoofKind] = useState<RoofSystemKind>("gable");
  const [eaveMm, setEaveMm] = useState(450);
  const [sideMm, setSideMm] = useState(450);
  const [ridgeAlong, setRidgeAlong] = useState<"short" | "long">("short");
  const [monoDrain, setMonoDrain] = useState<MonoCardinalDrain>("s");

  useEffect(() => {
    if (!modal || !system) {
      return;
    }
    setRoofKind(system.roofKind);
    setAngleDeg(system.pitchDeg);
    setLevelMm(system.baseLevelMm);
    setProfileId(system.profileId);
    setEaveMm(system.eaveOverhangMm);
    setSideMm(system.sideOverhangMm);
    setRidgeAlong(system.ridgeAlong);
    if (system.roofKind === "mono") {
      const d = system.drainUnitPlan;
      setMonoDrain(monoCardinalFromDrainUnit(d.x, d.y));
    } else {
      setMonoDrain("s");
    }
  }, [modal, system]);

  useEffect(() => {
    if (modal && system) {
      clearApplyError();
    }
  }, [modal, system, clearApplyError]);

  if (!modal || !system) {
    return null;
  }

  const profileMissing = profileId.trim() === "";
  const profileInvalid = !roofProfiles.some((p) => p.id === profileId);
  const applyDisabled = profileMissing || profileInvalid;

  const submit = () =>
    runApply(() => {
      if (applyDisabled) {
        return false;
      }
      apply({
        roofKind,
        pitchDeg: Number(angleDeg),
        baseLevelMm: Number(levelMm),
        profileId: profileId.trim(),
        eaveOverhangMm: Number(eaveMm),
        sideOverhangMm: Number(sideMm),
        ridgeAlong,
        monoDrainCardinal: monoDrain,
      });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.roofSystemEditModal != null, s.lastError);
    });

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roof-system-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="roof-system-edit-title" className="lm-title">
          Параметры крыши
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
          Режим: простая крыша (генератор). Изменения применяются ко всей крыше — все скаты, конёк и свесы пересчитываются.
          Контур основания не меняется.
        </p>
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.45, fontSize: 12 }}>
          Скатов в этой крыше: {system.generatedPlaneIds.length}
        </p>
        <div style={{ margin: "0 0 14px" }}>
          <button type="button" className="lm-btn lm-btn--ghost" disabled title="Будет доступно в следующих версиях">
            Перевести в ручной режим…
          </button>
        </div>

        <label className="lm-field">
          <span className="lm-label">Тип крыши</span>
          <select className="lm-input" value={roofKind} onChange={(e) => setRoofKind(e.target.value as RoofSystemKind)}>
            <option value="mono">Односкатная</option>
            <option value="gable">Двускатная</option>
            <option value="hip">Четырёхскатная (вальмовая)</option>
          </select>
        </label>

        <label className="lm-field">
          <span className="lm-label">Угол (°)</span>
          <input
            className="lm-input"
            type="number"
            step={0.1}
            value={angleDeg}
            onChange={(e) => setAngleDeg(Number(e.target.value))}
          />
        </label>
        <label className="lm-field">
          <span className="lm-label">Уровень (мм)</span>
          <input
            className="lm-input"
            type="number"
            step={1}
            value={levelMm}
            onChange={(e) => setLevelMm(Number(e.target.value))}
          />
        </label>

        <label className="lm-field">
          <span className="lm-label">Свес по карнизу (мм)</span>
          <input className="lm-input" type="number" step={1} min={0} value={eaveMm} onChange={(e) => setEaveMm(Number(e.target.value))} />
        </label>
        <label className="lm-field">
          <span className="lm-label">Боковой свес (мм)</span>
          <input className="lm-input" type="number" step={1} min={0} value={sideMm} onChange={(e) => setSideMm(Number(e.target.value))} />
        </label>
        {roofKind === "mono" ? (
          <label className="lm-field">
            <span className="lm-label">Направление стока</span>
            <select className="lm-input" value={monoDrain} onChange={(e) => setMonoDrain(e.target.value as MonoCardinalDrain)}>
              <option value="s">На юг ( −Y )</option>
              <option value="n">На север ( +Y )</option>
              <option value="e">На восток ( +X )</option>
              <option value="w">На запад ( −X )</option>
            </select>
          </label>
        ) : (
          <label className="lm-field">
            <span className="lm-label">Направление конька</span>
            <select className="lm-input" value={ridgeAlong} onChange={(e) => setRidgeAlong(e.target.value as "short" | "long")}>
              <option value="short">Вдоль короткой стороны прямоугольника</option>
              <option value="long">Вдоль длинной стороны прямоугольника</option>
            </select>
          </label>
        )}

        <label className="lm-field">
          <span className="lm-label">Профиль кровли</span>
          <select
            className="lm-input"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            aria-invalid={profileInvalid && !profileMissing}
          >
            <option value="">— выберите профиль —</option>
            {roofProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {roofProfiles.length === 0 ? (
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.45 }}>
            Нет профилей категории «крыша». Создайте профиль в библиотеке профилей.
          </p>
        ) : null}
        {profileInvalid && !profileMissing ? (
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 12, color: "var(--danger, #b91c1c)" }}>
            Выберите профиль из списка.
          </p>
        ) : null}
        {applyError ? (
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 12, color: "var(--danger, #b91c1c)" }} role="alert">
            {applyError}
          </p>
        ) : null}
        <div className="lm-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
            Отмена
          </button>
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            onClick={() => void submit()}
            disabled={applyDisabled || isSubmitting}
          >
            {isSubmitting ? "…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
