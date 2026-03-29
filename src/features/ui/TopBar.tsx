import { Editor2DPlanToolbar } from "@/features/ui/Editor2DPlanToolbar";
import { LayerToolbar } from "@/features/ui/LayerToolbar";
import { projectCommands } from "@/features/project/commands";
import { APP_NAME } from "@/shared/constants";
import { useAppStore } from "@/store/useAppStore";

import "./top-bar.css";

function IconProfiles() {
  return (
    <svg className="tb-prof-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
        opacity="0.45"
      />
      <path fill="currentColor" d="M4 4h16v3H4V4zm0 6.5h16v3H4v-3zm0 6.5h16v3H4v-3z" />
    </svg>
  );
}

export function TopBar() {
  const name = useAppStore((s) => s.currentProject.meta.name);
  const dirty = useAppStore((s) => s.dirty);
  const activeTab = useAppStore((s) => s.activeTab);
  const openProfiles = useAppStore((s) => s.openProfilesModal);

  return (
    <header className="shell-top">
      <div className="shell-top-left row">
        <strong>{APP_NAME}</strong>
        <span className="muted">·</span>
        <span>
          {name}
          {dirty ? " *" : ""}
        </span>
      </div>
      <div className="shell-top-center shell-top-tools">
        {activeTab === "2d" ? (
          <>
            <Editor2DPlanToolbar />
            <LayerToolbar />
          </>
        ) : null}
      </div>
      <div className="shell-top-right row">
        <button
          type="button"
          className="tb-prof-btn"
          title="Профили"
          aria-label="Профили"
          onClick={() => openProfiles()}
        >
          <IconProfiles />
        </button>
        <button type="button" className="btn" onClick={() => projectCommands.createNew()}>
          Новый
        </button>
        <button type="button" className="btn" onClick={() => void projectCommands.open()}>
          Открыть…
        </button>
        <button type="button" className="btn" onClick={() => void projectCommands.save()}>
          Сохранить…
        </button>
        <button type="button" className="btn" onClick={() => projectCommands.bootstrapDemo()}>
          Демо
        </button>
      </div>
    </header>
  );
}
