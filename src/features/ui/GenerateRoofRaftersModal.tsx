import { useEffect, useId, useMemo, useState } from "react";

import { isProfileUsableForFloorBeam } from "@/core/domain/floorBeamSection";
import type { RoofRafterBeamStepMode } from "@/core/domain/roofRafterGenerator";
import { finishStoreModalApply, storeModalApplyNoop, useModalApplyClose } from "@/shared/modalSubmit";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function GenerateRoofRaftersModal() {
  const open = useAppStore((s) => s.generateRoofRaftersModalOpen);
  const close = useAppStore((s) => s.closeGenerateRoofRaftersModal);
  const apply = useAppStore((s) => s.applyGenerateRoofRafters);
  const openProfiles = useAppStore((s) => s.openProfilesModal);
  const project = useAppStore((s) => s.currentProject);

  const { runApply, isSubmitting, applyError, clearApplyError } = useModalApplyClose(storeModalApplyNoop);

  const titleId = useId();

  const gableSystems = useMemo(
    () => project.roofSystems.filter((s) => s.roofKind === "gable"),
    [project.roofSystems],
  );

  const beamProfiles = useMemo(
    () => project.profiles.filter((pr) => isProfileUsableForFloorBeam(pr)).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [project.profiles],
  );

  const [roofSystemId, setRoofSystemId] = useState("");
  const [rafterProfileId, setRafterProfileId] = useState("");
  const [ridgeBeamEnabled, setRidgeBeamEnabled] = useState(false);
  const [pairBothSlopes, setPairBothSlopes] = useState(true);
  const [beamStep, setBeamStep] = useState<RoofRafterBeamStepMode>("everyBoard");
  /** Прогон и стойки генерируются парно (одинаковые флаги в вызове). */
  const [enablePurlinAndPosts, setEnablePurlinAndPosts] = useState(false);
  const [enableStruts, setEnableStruts] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    clearApplyError();
    const firstSys = gableSystems[0];
    setRoofSystemId((prev) => (prev && gableSystems.some((s) => s.id === prev) ? prev : firstSys?.id ?? ""));
    const firstBeam = beamProfiles[0];
    setRafterProfileId((prev) => (prev && beamProfiles.some((p) => p.id === prev) ? prev : firstBeam?.id ?? ""));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, clearApplyError, gableSystems, beamProfiles]);

  if (!open) {
    return null;
  }

  if (gableSystems.length === 0 || beamProfiles.length === 0) {
    return (
      <div className="lm-backdrop" role="presentation" onClick={close}>
        <div
          className="lm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="lm-title">
            Сгенерировать стропила
          </h2>
          <p className="lm-muted">
            {gableSystems.length === 0
              ? "Нужна двускатная крыша из генератора (тип «двускатная») и доски перекрытия в контуре крыши."
              : "Нет подходящего профиля сечения (как для балок перекрытия). Создайте профиль в библиотеке."}
          </p>
          <div className="lm-actions">
            <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
              Закрыть
            </button>
            {beamProfiles.length === 0 ? (
              <button type="button" className="lm-btn lm-btn--primary" onClick={() => openProfiles()}>
                Профили
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const submit = () =>
    void runApply(() => {
      if (!roofSystemId || !rafterProfileId) {
        return false;
      }
      apply({
        roofSystemId,
        rafterProfileId,
        ridgeBeamEnabled,
        pairBothSlopes,
        beamStep,
        enablePosts: enablePurlinAndPosts,
        enablePurlin: enablePurlinAndPosts,
        enableStruts,
      });
      const s = useAppStore.getState();
      return finishStoreModalApply(s.generateRoofRaftersModalOpen, s.lastError);
    });

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog lm-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="lm-title">
          Сгенерировать стропила
        </h2>
        <p className="lm-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
          Стропила строятся по доскам чердачного перекрытия внутри контура крыши: нижняя точка на плоскости ската на уровне
          верха перекрытия, верх на линии конька. Существующие стропила для выбранной крыши будут заменены.
        </p>

        <div className="lm-field" style={{ marginTop: 14 }}>
          <label className="lm-label" htmlFor="grr-roof-system">
            Крыша (двускатная)
          </label>
          <select
            id="grr-roof-system"
            className="lm-select"
            value={roofSystemId}
            onChange={(e) => setRoofSystemId(e.target.value)}
          >
            {gableSystems.map((s) => (
              <option key={s.id} value={s.id}>
                Крыша {s.id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </div>

        <div className="lm-field" style={{ marginTop: 10 }}>
          <label className="lm-label" htmlFor="grr-profile">
            Профиль / сечение стропил
          </label>
          <select
            id="grr-profile"
            className="lm-select"
            value={rafterProfileId}
            onChange={(e) => setRafterProfileId(e.target.value)}
          >
            {beamProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="lm-field" style={{ marginTop: 10 }}>
          <label className="lm-label">
            <input
              type="checkbox"
              checked={ridgeBeamEnabled}
              onChange={(e) => setRidgeBeamEnabled(e.target.checked)}
            />{" "}
            Коньковый брус (заглушка: +40 мм к отметке конька)
          </label>
        </div>

        <div className="lm-field" style={{ marginTop: 10 }}>
          <label className="lm-label">
            <input type="checkbox" checked={pairBothSlopes} onChange={(e) => setPairBothSlopes(e.target.checked)} />{" "}
            Парные стропила на оба ската
          </label>
        </div>

        <div className="lm-field" style={{ marginTop: 10 }}>
          <label className="lm-label" htmlFor="grr-step">
            Шаг по балкам перекрытия
          </label>
          <select
            id="grr-step"
            className="lm-select"
            value={beamStep}
            onChange={(e) => setBeamStep(e.target.value as RoofRafterBeamStepMode)}
          >
            <option value="everyBoard">По каждой доске в зоне крыши</option>
            <option value="everyOtherBoard">Через одну доску</option>
            <option value="allBoards">Все доски (как «по каждой»)</option>
          </select>
        </div>

        <p className="lm-muted" style={{ marginTop: 12, fontSize: 12, lineHeight: 1.45 }}>
          Прогон вдоль конька и вертикальные стойки на балках перекрытия строятся вместе: прогон ниже линии опирания
          стропил на коньке, стойки с шагом по балкам (см. константу в коде). Включение одного пункта ниже включает оба.
          Подкосы — от уровня перекрытия к стропилам; при их включении автоматически включаются стойки и прогон.
        </p>
        <div className="lm-field" style={{ marginTop: 6 }}>
          <label className="lm-label">
            <input
              type="checkbox"
              checked={enablePurlinAndPosts}
              onChange={(e) => setEnablePurlinAndPosts(e.target.checked)}
            />{" "}
            Стойки
          </label>
        </div>
        <div className="lm-field">
          <label className="lm-label">
            <input
              type="checkbox"
              checked={enablePurlinAndPosts}
              onChange={(e) => setEnablePurlinAndPosts(e.target.checked)}
            />{" "}
            Прогон
          </label>
        </div>
        <div className="lm-field">
          <label className="lm-label">
            <input
              type="checkbox"
              checked={enableStruts}
              onChange={(e) => {
                const v = e.target.checked;
                setEnableStruts(v);
                if (v) {
                  setEnablePurlinAndPosts(true);
                }
              }}
            />{" "}
            Подкосы
          </label>
        </div>

        {applyError ? (
          <p className="lm-muted" style={{ marginTop: 8, color: "var(--danger, #b91c1c)" }} role="alert">
            {applyError}
          </p>
        ) : null}

        <div className="lm-actions" style={{ marginTop: 20 }}>
          <button type="button" className="lm-btn lm-btn--ghost" onClick={() => close()}>
            Отмена
          </button>
          <button type="button" className="lm-btn lm-btn--primary" disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? "…" : "Сгенерировать"}
          </button>
        </div>
      </div>
    </div>
  );
}
