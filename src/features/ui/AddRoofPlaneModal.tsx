import { useEffect, useMemo, useState } from "react";

import { isProfileUsableForRoofPlane } from "@/core/domain/roofPlane";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function AddRoofPlaneModal() {
  const open = useAppStore((s) => s.addRoofPlaneModalOpen);
  const close = useAppStore((s) => s.closeAddRoofPlaneModal);
  const apply = useAppStore((s) => s.applyAddRoofPlaneModal);
  const project = useAppStore((s) => s.currentProject);
  const sticky = useAppStore((s) => s.lastRoofPlanePlacementParams);
  const session = useAppStore((s) => s.roofPlanePlacementSession);

  const roofProfiles = useMemo(
    () => project.profiles.filter((pr) => isProfileUsableForRoofPlane(pr)).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [project.profiles],
  );

  const [angleDeg, setAngleDeg] = useState(15);
  const [levelMm, setLevelMm] = useState(0);
  const [profileId, setProfileId] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    if (session) {
      setAngleDeg(session.draft.angleDeg);
      setLevelMm(session.draft.levelMm);
      setProfileId(session.draft.profileId);
      return;
    }
    if (sticky) {
      setAngleDeg(sticky.angleDeg);
      setLevelMm(sticky.levelMm);
      setProfileId(sticky.profileId);
      return;
    }
    setAngleDeg(15);
    setLevelMm(0);
    setProfileId(roofProfiles[0]?.id ?? "");
  }, [open, session, sticky, roofProfiles]);

  if (!open) {
    return null;
  }

  const profileMissing = profileId.trim() === "";
  const profileInvalid = !roofProfiles.some((p) => p.id === profileId);
  const applyDisabled = profileMissing || profileInvalid;

  const submit = () => {
    if (applyDisabled) {
      return;
    }
    apply({ angleDeg: Number(angleDeg), levelMm: Number(levelMm), profileId: profileId.trim() });
  };

  const title = session ? "Параметры плоскости крыши" : "Плоскость крыши";

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
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
          Угол и уровень сохраняются в объект. После «Применить» укажите на плане базовую линию ската и глубину
          плоскости.
        </p>
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
        <div className="lm-actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={close}>
            Отмена
          </button>
          <button type="button" className="lm-btn lm-btn--primary" onClick={submit} disabled={applyDisabled}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
