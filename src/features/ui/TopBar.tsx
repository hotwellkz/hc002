import { LayerToolbar } from "@/features/ui/LayerToolbar";
import { projectCommands } from "@/features/project/commands";
import { APP_NAME } from "@/shared/constants";
import { useAppStore } from "@/store/useAppStore";

export function TopBar() {
  const name = useAppStore((s) => s.currentProject.meta.name);
  const dirty = useAppStore((s) => s.dirty);
  const activeTab = useAppStore((s) => s.activeTab);

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
      <div className="shell-top-center">{activeTab === "2d" ? <LayerToolbar /> : null}</div>
      <div className="shell-top-right row">
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
