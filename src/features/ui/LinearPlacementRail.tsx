import type { ReactNode } from "react";

import type { LinearProfilePlacementMode } from "@/core/geometry/linearPlacementGeometry";
import type { WallShapeMode } from "@/core/domain/wallShapeMode";
import { useAppStore } from "@/store/useAppStore";

import "./linear-placement-rail.css";

function IconLine() {
  return (
    <svg className="lpr-icon" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconRect() {
  return (
    <svg className="lpr-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="2" d="M6 7h12v10H6z" />
    </svg>
  );
}

function IconCenter() {
  return (
    <svg className="lpr-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 2a6 6 0 110 12 6 6 0 010-12zm0 2a4 4 0 100 8 4 4 0 000-8z"
      />
    </svg>
  );
}

function IconAlignLeft() {
  return (
    <svg className="lpr-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h14v2H4v-2z" />
    </svg>
  );
}

function IconAlignRight() {
  return (
    <svg className="lpr-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 6h16v2H4V6zm10 5h6v2h-6v-2zM6 16h14v2H6v-2z" />
    </svg>
  );
}

const SHAPES: readonly { mode: WallShapeMode; title: string; icon: ReactNode }[] = [
  { mode: "line", title: "Линия", icon: <IconLine /> },
  { mode: "rectangle", title: "Прямоугольник", icon: <IconRect /> },
];

const MODES: readonly { mode: LinearProfilePlacementMode; title: string; icon: ReactNode }[] = [
  { mode: "center", title: "По центру", icon: <IconCenter /> },
  { mode: "leftEdge", title: "По левому краю", icon: <IconAlignLeft /> },
  { mode: "rightEdge", title: "По правому краю", icon: <IconAlignRight /> },
];

export function LinearPlacementRail() {
  const shapeMode = useAppStore((s) => s.currentProject.settings.editor2d.wallShapeMode);
  const setShapeMode = useAppStore((s) => s.setWallShapeMode);
  const mode = useAppStore((s) => s.currentProject.settings.editor2d.linearPlacementMode);
  const setMode = useAppStore((s) => s.setLinearPlacementMode);

  return (
    <aside className="lpr" aria-label="Режимы построения стены">
      <div className="lpr-group" aria-label="Форма контура">
        {SHAPES.map(({ mode: m, title, icon }) => (
          <button
            key={m}
            type="button"
            className="lpr-btn"
            title={title}
            aria-label={title}
            aria-pressed={shapeMode === m}
            data-active={shapeMode === m}
            onClick={() => setShapeMode(m)}
          >
            {icon}
          </button>
        ))}
      </div>
      <div className="lpr-divider" role="separator" aria-hidden="true" />
      <div className="lpr-group" aria-label="Положение по толщине">
        {MODES.map(({ mode: m, title, icon }) => (
          <button
            key={m}
            type="button"
            className="lpr-btn"
            title={title}
            aria-label={title}
            aria-pressed={mode === m}
            data-active={mode === m}
            onClick={() => setMode(m)}
          >
            {icon}
          </button>
        ))}
      </div>
    </aside>
  );
}
