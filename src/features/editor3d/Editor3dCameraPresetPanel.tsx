import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowBigUp, Box, BrickWall, Camera, PanelRight, RotateCcw } from "lucide-react";

import { useAppStore } from "@/store/useAppStore";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";

import {
  type Editor3dCameraPresetKind,
  viewportLikelyMatchesPreset,
} from "./editor3dCameraPresetsMath";
import { useEditor3dThemeColors } from "./useEditor3dThemeColors";

import "./editor3d-camera-presets.css";

const MENU_ITEMS: readonly { kind: Editor3dCameraPresetKind; label: string }[] = [
  { kind: "front", label: "Спереди" },
  { kind: "back", label: "Сзади" },
  { kind: "left", label: "Слева" },
  { kind: "right", label: "Справа" },
  { kind: "top", label: "Сверху" },
  { kind: "bottom", label: "Снизу" },
  { kind: "isometric", label: "Изометрия" },
  { kind: "reset", label: "Сброс вида" },
];

export function Editor3dCameraPresetPanel({
  disabled,
  onSelectPreset,
}: {
  readonly disabled: boolean;
  readonly onSelectPreset: (kind: Editor3dCameraPresetKind) => void;
}) {
  const idBase = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const theme3d = useEditor3dThemeColors();
  const viewport3d = useAppStore((s) => s.currentProject.viewState.viewport3d);

  const activeKind = useMemo((): Editor3dCameraPresetKind | null => {
    const order: readonly Editor3dCameraPresetKind[] = [
      "front",
      "back",
      "left",
      "right",
      "top",
      "bottom",
      "isometric",
      "reset",
    ];
    for (const k of order) {
      if (viewportLikelyMatchesPreset(viewport3d, k)) {
        return k;
      }
    }
    return null;
  }, [viewport3d]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const pick = (kind: Editor3dCameraPresetKind) => {
    onSelectPreset(kind);
    setMenuOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      className="ed3-cam-presets-wrap"
      style={
        {
          "--ed3-overlay-bg": theme3d.overlayBg,
          "--ed3-overlay-text": theme3d.overlayText,
        } as CSSProperties
      }
    >
      <div className="ed3-cam-presets-row ed3-cam-presets-row--quick" aria-label="Быстрые виды камеры">
        <button
          type="button"
          className={`ed3-cam-quick-btn${activeKind === "front" ? " ed3-cam-quick-btn--active" : ""}`}
          title="Спереди"
          aria-label="Вид спереди"
          aria-pressed={activeKind === "front"}
          disabled={disabled}
          onClick={() => pick("front")}
        >
          <LucideToolIcon icon={BrickWall} className="ed3-cam-quick-icon" />
        </button>
        <button
          type="button"
          className={`ed3-cam-quick-btn${activeKind === "right" ? " ed3-cam-quick-btn--active" : ""}`}
          title="Справа"
          aria-label="Вид справа"
          aria-pressed={activeKind === "right"}
          disabled={disabled}
          onClick={() => pick("right")}
        >
          <LucideToolIcon icon={PanelRight} className="ed3-cam-quick-icon" />
        </button>
        <button
          type="button"
          className={`ed3-cam-quick-btn${activeKind === "top" ? " ed3-cam-quick-btn--active" : ""}`}
          title="Сверху"
          aria-label="Вид сверху"
          aria-pressed={activeKind === "top"}
          disabled={disabled}
          onClick={() => pick("top")}
        >
          <LucideToolIcon icon={ArrowBigUp} className="ed3-cam-quick-icon" />
        </button>
        <button
          type="button"
          className={`ed3-cam-quick-btn${activeKind === "isometric" || activeKind === "reset" ? " ed3-cam-quick-btn--active" : ""}`}
          title="Изометрия"
          aria-label="Изометрический вид"
          aria-pressed={activeKind === "isometric" || activeKind === "reset"}
          disabled={disabled}
          onClick={() => pick("isometric")}
        >
          <LucideToolIcon icon={Box} className="ed3-cam-quick-icon" />
        </button>
        <button
          type="button"
          className="ed3-cam-quick-btn"
          title="Сброс вида"
          aria-label="Сброс стандартного вида"
          disabled={disabled}
          onClick={() => pick("reset")}
        >
          <LucideToolIcon icon={RotateCcw} className="ed3-cam-quick-icon" />
        </button>
      </div>
      <div className="ed3-cam-presets-row">
        <button
          type="button"
          className="ed3-cam-presets-menu-btn"
          aria-expanded={menuOpen}
          aria-controls={`${idBase}-cam-presets-panel`}
          disabled={disabled}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <LucideToolIcon icon={Camera} className="ed3-cam-presets-icon" />
          Виды
        </button>
      </div>
      {menuOpen ? (
        <div
          id={`${idBase}-cam-presets-panel`}
          className="ed3-cam-presets-popover"
          role="menu"
          aria-label="Пресеты камеры"
        >
          {MENU_ITEMS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className={`ed3-cam-presets-popover-row${activeKind === kind ? " ed3-cam-presets-popover-row--active" : ""}`}
              onClick={() => pick(kind)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
