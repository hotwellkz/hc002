import { useEffect, useMemo, useState } from "react";

import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { isProfileUsableForRoofPlane } from "@/core/domain/roofPlane";
import type { RoofSystemKind } from "@/core/domain/roofSystem";
import type { MonoCardinalDrain } from "@/core/domain/roofSystemRectangleGeometry";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

type PlacementMode = "roofSystem" | "manualPlane";

export function AddRoofPlaneModal() {
  const open = useAppStore((s) => s.addRoofPlaneModalOpen);
  const close = useAppStore((s) => s.closeAddRoofPlaneModal);
  const applyManual = useAppStore((s) => s.applyAddRoofPlaneModal);
  const applySystem = useAppStore((s) => s.applyAddRoofSystemModal);
  const project = useAppStore((s) => s.currentProject);
  const stickyManual = useAppStore((s) => s.lastRoofPlanePlacementParams);
  const stickySys = useAppStore((s) => s.lastRoofSystemPlacementParams);
  const session = useAppStore((s) => s.roofPlanePlacementSession);
  const sessionSys = useAppStore((s) => s.roofSystemPlacementSession);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const roofProfiles = useMemo(
    () => project.profiles.filter((pr) => isProfileUsableForRoofPlane(pr)).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [project.profiles],
  );

  const [mode, setMode] = useState<PlacementMode>("roofSystem");
  const [angleDeg, setAngleDeg] = useState(15);
  const [levelMm, setLevelMm] = useState(0);
  const [profileId, setProfileId] = useState("");
  const [roofKind, setRoofKind] = useState<RoofSystemKind>("gable");
  const [eaveMm, setEaveMm] = useState(450);
  const [sideMm, setSideMm] = useState(450);
  const [ridgeAlong, setRidgeAlong] = useState<"short" | "long">("short");
  const [monoDrain, setMonoDrain] = useState<MonoCardinalDrain>("s");

  useEffect(() => {
    if (!open) {
      return;
    }
    if (session) {
      setMode("manualPlane");
      setAngleDeg(session.draft.angleDeg);
      setLevelMm(session.draft.levelMm);
      setProfileId(session.draft.profileId);
      return;
    }
    if (sessionSys) {
      setMode("roofSystem");
      const d = sessionSys.draft;
      setRoofKind(d.roofKind);
      setAngleDeg(d.pitchDeg);
      setLevelMm(d.baseLevelMm);
      setProfileId(d.profileId);
      setEaveMm(d.eaveOverhangMm);
      setSideMm(d.sideOverhangMm);
      setRidgeAlong(d.ridgeAlong);
      setMonoDrain(d.monoDrainCardinal);
      return;
    }
    if (stickySys && !stickyManual) {
      setMode("roofSystem");
      setRoofKind(stickySys.roofKind);
      setAngleDeg(stickySys.pitchDeg);
      setLevelMm(stickySys.baseLevelMm);
      setProfileId(stickySys.profileId);
      setEaveMm(stickySys.eaveOverhangMm);
      setSideMm(stickySys.sideOverhangMm);
      setRidgeAlong(stickySys.ridgeAlong);
      setMonoDrain(stickySys.monoDrainCardinal);
      return;
    }
    if (stickyManual) {
      setMode("manualPlane");
      setAngleDeg(stickyManual.angleDeg);
      setLevelMm(stickyManual.levelMm);
      setProfileId(stickyManual.profileId);
      return;
    }
    setMode("roofSystem");
    setAngleDeg(15);
    setLevelMm(0);
    setProfileId(roofProfiles[0]?.id ?? "");
    setRoofKind("gable");
    setEaveMm(450);
    setSideMm(450);
    setRidgeAlong("short");
    setMonoDrain("s");
  }, [open, session, sessionSys, stickyManual, stickySys, roofProfiles]);

  useEffect(() => {
    if (open) {
      clearApplyError();
    }
  }, [open, clearApplyError]);

  if (!open) {
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
      if (mode === "manualPlane") {
        applyManual({ angleDeg: Number(angleDeg), levelMm: Number(levelMm), profileId: profileId.trim() });
      } else {
        applySystem({
          roofKind,
          pitchDeg: Number(angleDeg),
          baseLevelMm: Number(levelMm),
          profileId: profileId.trim(),
          eaveOverhangMm: Number(eaveMm),
          sideOverhangMm: Number(sideMm),
          ridgeAlong,
          monoDrainCardinal: monoDrain,
        });
      }
      const s = useAppStore.getState();
      return finishStoreModalApply(s.addRoofPlaneModalOpen, s.lastError);
    });

  const title =
    session || sessionSys
      ? mode === "manualPlane"
        ? "Параметры плоскости крыши"
        : "Параметры крыши"
      : mode === "manualPlane"
        ? "Ручная плоскость крыши"
        : "Новая крыша";

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roof-plane-add-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="roof-plane-add-title" className="lm-title">
          {title}
        </h2>
        <div className="lm-field" style={{ marginBottom: 12 }}>
          <span className="lm-label">Режим</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="radio"
                name="roof-mode"
                checked={mode === "roofSystem"}
                onChange={() => setMode("roofSystem")}
              />
              Простая крыша (контур + генератор)
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="radio"
                name="roof-mode"
                checked={mode === "manualPlane"}
                onChange={() => setMode("manualPlane")}
              />
              Ручная плоскость (advanced)
            </label>
          </div>
        </div>

        {mode === "roofSystem" ? (
          <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
            После «Построить» укажите на плане два угла прямоугольника — основание крыши. Скаты, конёк и свесы считаются из
            одной модели.
          </p>
        ) : (
          <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
            После «Построить» задайте базовую линию ската и глубину плоскости на плане.
          </p>
        )}

        {mode === "roofSystem" ? (
          <label className="lm-field">
            <span className="lm-label">Тип крыши</span>
            <select className="lm-input" value={roofKind} onChange={(e) => setRoofKind(e.target.value as RoofSystemKind)}>
              <option value="mono">Односкатная</option>
              <option value="gable">Двускатная</option>
              <option value="hip">Четырёхскатная (вальмовая)</option>
            </select>
          </label>
        ) : null}

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

        {mode === "roofSystem" ? (
          <>
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
          </>
        ) : null}

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
            {isSubmitting ? "…" : mode === "roofSystem" ? "Построить" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
