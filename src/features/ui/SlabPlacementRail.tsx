import type { ReactNode } from "react";
import { Spline, Square } from "lucide-react";

import type { SlabBuildMode } from "@/core/domain/settings";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";
import { useAppStore } from "@/store/useAppStore";

import "./linear-placement-rail.css";
import "./slab-placement-rail.css";

const MODES: readonly { mode: SlabBuildMode; title: string; icon: ReactNode }[] = [
  {
    mode: "rectangle",
    title: "Плита: прямоугольник (две точки по диагонали)",
    icon: <LucideToolIcon icon={Square} className="lpr-icon" />,
  },
  {
    mode: "polyline",
    title: "Плита: полилиния по точкам",
    icon: <LucideToolIcon icon={Spline} className="lpr-icon" />,
  },
];

/**
 * Правая панель: режим контура плиты. Видна во время активного сеанса постановки плиты.
 */
export function SlabPlacementRail() {
  const session = useAppStore((s) => s.slabPlacementSession);
  const slabMode = useAppStore((s) => s.currentProject.settings.editor2d.slabBuildMode);
  const setSlabBuildMode = useAppStore((s) => s.setSlabBuildMode);

  if (!session) {
    return null;
  }

  const heading =
    session.draft.purpose === "foundation" ? "Плита (фундамент)" : "Плита (перекрытие)";

  return (
    <aside className="lpr spr" aria-label="Режим построения плиты">
      <div className="spr-heading">{heading}</div>
      <div className="lpr-group" aria-label="Контур плиты">
        {MODES.map(({ mode: m, title, icon }) => (
          <button
            key={m}
            type="button"
            className="lpr-btn"
            title={title}
            aria-label={title}
            aria-pressed={slabMode === m}
            data-active={slabMode === m}
            onClick={() => setSlabBuildMode(m)}
          >
            {icon}
          </button>
        ))}
      </div>
      <p className="spr-hint">
        {slabMode === "rectangle"
          ? "Две точки по углам прямоугольника."
          : "Точки контура · замыкание: первая точка, двойной клик или Enter."}
      </p>
    </aside>
  );
}
