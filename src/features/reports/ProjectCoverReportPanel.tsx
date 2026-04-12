import type { CoverCameraCorner } from "@/core/reports/renderers/coverCamera";
import { FEATURE_AI_COVER_ENHANCEMENT } from "@/core/reports/providers/imageEnhancementProvider";
import type { CoverRenderMode } from "@/core/reports/providers/imageEnhancementProvider";
import type { ImageEnhancementPromptPresetId } from "@/core/reports/providers/imageEnhancementPresets";

import type { CoverBackgroundKey } from "./coverSnapshotConstants";

export interface ProjectCoverReportPanelProps {
  readonly cameraCorner: CoverCameraCorner;
  readonly onCameraCorner: (v: CoverCameraCorner) => void;
  readonly background: CoverBackgroundKey;
  readonly onBackground: (v: CoverBackgroundKey) => void;
  readonly renderMode: CoverRenderMode;
  readonly onRenderMode: (v: CoverRenderMode) => void;
  readonly aiPreset: ImageEnhancementPromptPresetId;
  readonly onAiPreset: (v: ImageEnhancementPromptPresetId) => void;
  readonly onRecaptureRender: () => void;
  readonly onAiEnhance: () => void;
  readonly onResetAi: () => void;
  readonly onExportPdf: () => void;
  readonly aiBusy: boolean;
  readonly aiMessage: string | null;
}

export function ProjectCoverReportPanel({
  cameraCorner,
  onCameraCorner,
  background,
  onBackground,
  renderMode,
  onRenderMode,
  aiPreset,
  onAiPreset,
  onRecaptureRender,
  onAiEnhance,
  onResetAi,
  onExportPdf,
  aiBusy,
  aiMessage,
}: ProjectCoverReportPanelProps) {
  const aiDisabled = !FEATURE_AI_COVER_ENHANCEMENT;

  return (
    <div className="reports-cover-params">
      <label className="reports-workspace__field">
        <span>Угол камеры</span>
        <select value={cameraCorner} onChange={(e) => onCameraCorner(e.target.value as CoverCameraCorner)}>
          <option value="front_left">Спереди слева</option>
          <option value="front_right">Спереди справа</option>
          <option value="rear_left">Сзади слева</option>
          <option value="rear_right">Сзади справа</option>
        </select>
      </label>

      <label className="reports-workspace__field">
        <span>Фон</span>
        <select value={background} onChange={(e) => onBackground(e.target.value as CoverBackgroundKey)}>
          <option value="white">Белый</option>
          <option value="light_gray">Светло-серый</option>
          <option value="sky_light">Светлое небо</option>
        </select>
      </label>

      <label className="reports-workspace__field">
        <span>Режим</span>
        <select value={renderMode} onChange={(e) => onRenderMode(e.target.value as CoverRenderMode)}>
          <option value="sourceRenderOnly">Только 3D-рендер</option>
          <option value="aiEnhanced" disabled={aiDisabled}>
            AI-обложка {aiDisabled ? "(скоро)" : ""}
          </option>
          <option value="both" disabled={aiDisabled}>
            Рендер + AI {aiDisabled ? "(скоро)" : ""}
          </option>
        </select>
      </label>

      <label className="reports-workspace__field">
        <span>Пресет AI</span>
        <select value={aiPreset} onChange={(e) => onAiPreset(e.target.value as ImageEnhancementPromptPresetId)} disabled={aiDisabled}>
          <option value="clean_minimal">Чистый минимализм</option>
          <option value="client_presentation">Презентация клиенту</option>
          <option value="premium_exterior">Премиум фасад</option>
        </select>
      </label>

      <p className="reports-workspace__hint">
        Обложка — только для презентации. Размеры и производство — по техническим листам из модели.
      </p>

      <div className="reports-workspace__actions reports-workspace__actions--stack">
        <button type="button" className="btn" onClick={onRecaptureRender}>
          Пересчитать рендер
        </button>
        <button type="button" className="btn" onClick={onAiEnhance} disabled={aiDisabled || aiBusy}>
          {aiBusy ? "AI…" : "AI-улучшить"}
        </button>
        <button type="button" className="btn" onClick={onResetAi} disabled={aiDisabled}>
          Сбросить AI-версию
        </button>
        <button type="button" className="btn" onClick={onExportPdf}>
          Экспорт PDF
        </button>
      </div>

      {aiMessage ? <p className="reports-workspace__hint">{aiMessage}</p> : null}
      {!FEATURE_AI_COVER_ENHANCEMENT ? (
        <p className="reports-workspace__hint">AI-улучшение обложки: интерфейс готов, провайдер появится в следующей версии.</p>
      ) : null}
    </div>
  );
}
