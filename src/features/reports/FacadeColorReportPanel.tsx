export interface FacadeColorReportPanelProps {
  readonly onRecaptureRender: () => void;
  readonly onExportPdf: () => void;
}

/**
 * Параметры цветного фасада: тот же 3D-рендер, что у обложки; без AI и без выбора ракурса (фиксированная ортография по стороне).
 */
export function FacadeColorReportPanel({ onRecaptureRender, onExportPdf }: FacadeColorReportPanelProps) {
  return (
    <>
      <p className="reports-workspace__hint">
        Ортогональный вид без перспективы; материалы и освещение как у листа «3D вид дома». При изменении модели нажмите
        пересчёт.
      </p>
      <div className="reports-workspace__actions">
        <button type="button" className="btn" onClick={onRecaptureRender}>
          Пересчитать рендер
        </button>
        <button type="button" className="btn" onClick={onExportPdf}>
          Экспорт PDF
        </button>
      </div>
    </>
  );
}
