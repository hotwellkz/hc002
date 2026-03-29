import { useAppStore } from "@/store/useAppStore";

import "./left-nav-rail.css";

function IconFloorPlan({ active }: { readonly active: boolean }) {
  return (
    <svg className="lnr-icon" viewBox="0 0 24 24" aria-hidden="true" data-active={active}>
      <path
        fill="currentColor"
        d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
      />
    </svg>
  );
}

/** Вертикальная навигация по режимам рабочей области. */
export function LeftNavRail() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const floorPlanActive = activeTab === "2d";

  return (
    <nav className="lnr" aria-label="Режим работы">
      <button
        type="button"
        className="lnr-btn"
        title="План этажа"
        aria-label="План этажа"
        aria-pressed={floorPlanActive}
        data-active={floorPlanActive}
        onClick={() => setActiveTab("2d")}
      >
        <IconFloorPlan active={floorPlanActive} />
      </button>
    </nav>
  );
}
