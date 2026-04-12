import "./reports-workspace.css";

export interface ExportBundleDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly filename: string;
  readonly onClose: () => void;
  readonly onConfirmExport: () => void | Promise<void>;
}

/**
 * MVP: простое подтверждение экспорта текущего отчёта в PDF.
 */
export function ExportBundleDialog({ open, title, filename, onClose, onConfirmExport }: ExportBundleDialogProps) {
  if (!open) {
    return null;
  }
  return (
    <div className="reports-export-overlay" role="dialog" aria-modal="true" aria-labelledby="reports-export-title">
      <div className="reports-export-dialog">
        <h2 id="reports-export-title" className="reports-export-dialog__h2">
          {title}
        </h2>
        <p className="reports-export-dialog__p">
          Будет сохранён файл <strong>{filename}</strong> в формате PDF.
        </p>
        <div className="reports-export-dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn reports-export-dialog__primary"
            onClick={() => void Promise.resolve(onConfirmExport()).then(onClose)}
          >
            Сохранить PDF
          </button>
        </div>
      </div>
    </div>
  );
}
