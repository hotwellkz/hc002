import { useEffect, useMemo, useState } from "react";

import { isProfileUsableForRoofPlane } from "@/core/domain/roofPlane";
import { useAppStore } from "@/store/useAppStore";

import "./layer-modals.css";

export function EditRoofPlaneModal() {
  const modal = useAppStore((s) => s.roofPlaneEditModal);
  const close = useAppStore((s) => s.closeRoofPlaneEditModal);
  const apply = useAppStore((s) => s.applyRoofPlaneEditModal);
  const project = useAppStore((s) => s.currentProject);

  const plane = useMemo(() => {
    if (!modal) {
      return null;
    }
    return project.roofPlanes.find((r) => r.id === modal.roofPlaneId) ?? null;
  }, [modal, project.roofPlanes]);

  const roofProfiles = useMemo(
    () => project.profiles.filter((pr) => isProfileUsableForRoofPlane(pr)).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [project.profiles],
  );

  const [angleDeg, setAngleDeg] = useState(15);
  const [levelMm, setLevelMm] = useState(0);
  const [profileId, setProfileId] = useState("");

  useEffect(() => {
    if (!modal || !plane) {
      return;
    }
    setAngleDeg(plane.angleDeg);
    setLevelMm(plane.levelMm);
    setProfileId(plane.profileId);
  }, [modal, plane]);

  if (!modal || !plane) {
    return null;
  }

  if (plane.roofSystemId) {
    return (
      <div className="lm-backdrop" role="presentation" onClick={close}>
        <div
          className="lm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roof-plane-edit-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="roof-plane-edit-title" className="lm-title">
            Параметры плоскости крыши
          </h2>
          <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
            Этот скат относится к крыше-генератору. Закройте окно и откройте «Параметры крыши» (двойной клик по любому скату
            этой крыши).
          </p>
          <div className="lm-actions">
            <button type="button" className="lm-btn lm-btn--primary" onClick={close}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }

  const profileMissing = profileId.trim() === "";
  const profileInvalid = !roofProfiles.some((p) => p.id === profileId);
  const applyDisabled = profileMissing || profileInvalid;

  const submit = () => {
    if (applyDisabled) {
      return;
    }
    apply({
      angleDeg: Number(angleDeg),
      levelMm: Number(levelMm),
      profileId: profileId.trim(),
    });
  };

  return (
    <div className="lm-backdrop" role="presentation" onClick={close}>
      <div
        className="lm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roof-plane-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="roof-plane-edit-title" className="lm-title">
          Параметры плоскости крыши
        </h2>
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5, fontSize: 13 }}>
          Ручная плоскость: угол, уровень и профиль применяются только к этому скату (Скат {plane.slopeIndex}).
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
