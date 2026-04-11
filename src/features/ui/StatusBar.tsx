import { worldMmToPlanMm } from "@/core/domain/projectOriginPlan";
import { useAppStore } from "@/store/useAppStore";

interface StatusBarProps {
  readonly cursorWorldMm: { x: number; y: number } | null;
}

function persistenceHint(
  ready: boolean,
  enabled: boolean,
  status: "idle" | "loading" | "saving" | "saved" | "error",
): string {
  if (!ready || status === "loading") {
    return "Проект: загрузка…";
  }
  if (!enabled) {
    return "Облако: нет (задайте VITE_FIREBASE_* в .env)";
  }
  if (status === "saving") {
    return "Облако: сохранение…";
  }
  if (status === "error") {
    return "Облако: ошибка";
  }
  if (status === "saved") {
    return "Облако: сохранено";
  }
  return "Облако: готово";
}

export function StatusBar({ cursorWorldMm }: StatusBarProps) {
  const project = useAppStore((s) => s.currentProject);
  const cursor =
    cursorWorldMm === null
      ? "—"
      : project.projectOrigin
        ? (() => {
            const p = worldMmToPlanMm(cursorWorldMm, project);
            return `ΔX: ${p.x.toFixed(0)} мм · ΔY: ${p.y.toFixed(0)} мм (от базы)`;
          })()
        : `X: ${cursorWorldMm.x.toFixed(0)} мм · Y: ${cursorWorldMm.y.toFixed(0)} мм (мир)`;

  const persistenceReady = useAppStore((s) => s.persistenceReady);
  const firestoreEnabled = useAppStore((s) => s.firestoreEnabled);
  const persistenceStatus = useAppStore((s) => s.persistenceStatus);
  const pendingWindow = useAppStore((s) => s.pendingWindowPlacement);

  return (
    <footer className="shell-status">
      <span>Курсор: {cursor}</span>
      {pendingWindow ? (
        <span className="muted" title="Наведите на стену активного слоя и нажмите ЛКМ; Esc или ПКМ — отмена">
          Режим: установка окна на стену
        </span>
      ) : null}
      <span className="muted">{persistenceHint(persistenceReady, firestoreEnabled, persistenceStatus)}</span>
      <span className="muted">ЛКМ: выбор · СКМ / инструмент «Панорама»: перетаскивание · Колёсико: масштаб</span>
    </footer>
  );
}
