import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, FileText, SlidersHorizontal } from "lucide-react";

import { downloadPdfBytes, exportSingleReportPdf } from "@/core/reports/pdf/bundlePdfExport";
import { getReportDefinition } from "@/core/reports/registry";
import { evaluateReportReadiness } from "@/core/reports/readiness";
import type { CoverCameraCorner } from "@/core/reports/renderers/coverCamera";
import {
  FEATURE_AI_COVER_ENHANCEMENT,
  getDefaultImageEnhancementProvider,
} from "@/core/reports/providers/imageEnhancementProvider";
import type { CoverRenderMode } from "@/core/reports/providers/imageEnhancementProvider";
import type { ImageEnhancementPromptPresetId } from "@/core/reports/providers/imageEnhancementPresets";
import type { ReportCompileParams } from "@/core/reports/types";
import { useAppStore } from "@/store/useAppStore";
import {
  REPORT_LEFT_PANEL_OPEN_PX,
  REPORT_RIGHT_PANEL_OPEN_PX,
  REPORT_SIDE_RAIL_PX,
  collapseOnePanelIfBothOpenNarrow,
  useReportsLayoutStore,
} from "@/store/useReportsLayoutStore";

import { composeCoverSideBySide } from "./coverImageCompose";
import type { CoverBackgroundKey } from "./coverSnapshotConstants";
import { ExportBundleDialog } from "./ExportBundleDialog";
import { ProjectCoverReportPanel } from "./ProjectCoverReportPanel";
import { ProjectCoverSnapshotCanvas } from "./ProjectCoverSnapshotCanvas";
import { ReportPreviewPanel } from "./ReportPreviewPanel";
import { ReportsTree } from "./ReportsTree";
import { useLiveReportModel } from "./useLiveReportModel";

import "./reports-workspace.css";

function safeFilenamePart(name: string): string {
  return name.replace(/[^\wа-яА-ЯёЁ\-]+/gi, "_").slice(0, 80) || "project";
}

export function ReportsWorkspace() {
  const project = useAppStore((s) => s.currentProject);
  const activeTab = useAppStore((s) => s.activeTab);
  const [selectedId, setSelectedId] = useState<string>("project_cover_3d");
  const [coverCorner, setCoverCorner] = useState<CoverCameraCorner>("front_left");
  const [coverBackground, setCoverBackground] = useState<CoverBackgroundKey>("white");
  const [coverRenderMode, setCoverRenderMode] = useState<CoverRenderMode>("sourceRenderOnly");
  const [aiPreset, setAiPreset] = useState<ImageEnhancementPromptPresetId>("client_presentation");
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [aiDataUrl, setAiDataUrl] = useState<string | null>(null);
  const [bothComposite, setBothComposite] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [snapshotMountId, setSnapshotMountId] = useState(0);

  const coverCompileOverlay = useMemo((): Partial<ReportCompileParams> | null => {
    if (selectedId !== "project_cover_3d") {
      return null;
    }
    let href: string | null | undefined;
    if (coverRenderMode === "sourceRenderOnly") {
      href = sourceDataUrl;
    } else if (coverRenderMode === "aiEnhanced") {
      href = aiDataUrl ?? sourceDataUrl;
    } else {
      href = bothComposite ?? sourceDataUrl;
    }
    return {
      coverImageHref: href ?? null,
      coverSheetTitle: "3D вид дома",
      coverSubtitle: "Общий вид дома (3D)",
      coverStampTag: "Обложка проекта",
    };
  }, [aiDataUrl, bothComposite, coverRenderMode, selectedId, sourceDataUrl]);

  const { model, compileError, params, setScaleDenominator, bumpRecalc, recalcToken } = useLiveReportModel(
    project,
    selectedId,
    coverCompileOverlay,
  );

  const [exportOpen, setExportOpen] = useState(false);
  const prevTabRef = useRef<typeof activeTab | null>(null);

  const leftCollapsed = useReportsLayoutStore((s) => s.leftCollapsed);
  const rightCollapsed = useReportsLayoutStore((s) => s.rightCollapsed);
  const toggleLeft = useReportsLayoutStore((s) => s.toggleLeft);
  const toggleRight = useReportsLayoutStore((s) => s.toggleRight);

  const leftWidthPx = leftCollapsed ? REPORT_SIDE_RAIL_PX : REPORT_LEFT_PANEL_OPEN_PX;
  const rightWidthPx = rightCollapsed ? REPORT_SIDE_RAIL_PX : REPORT_RIGHT_PANEL_OPEN_PX;

  useEffect(() => {
    const onResize = () => collapseOnePanelIfBothOpenNarrow();
    window.addEventListener("resize", onResize);
    collapseOnePanelIfBothOpenNarrow();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const def = useMemo(() => (selectedId ? getReportDefinition(selectedId) : undefined), [selectedId]);
  const readiness = useMemo(
    () => (def ? evaluateReportReadiness(project, def) : { status: "soon" as const, messages: [] }),
    [project, def],
  );

  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (!import.meta.env.DEV || activeTab !== "reports" || prev === "reports") {
      return;
    }
    console.info("[reports] switched to reports tab", {
      activeTab,
      selectedReportId: selectedId,
      reportsWorkspaceMounted: true,
    });
  }, [activeTab, selectedId]);

  useEffect(() => {
    if (coverRenderMode !== "both" || !sourceDataUrl || !aiDataUrl) {
      setBothComposite(null);
      return;
    }
    let cancelled = false;
    void composeCoverSideBySide(sourceDataUrl, aiDataUrl).then((url) => {
      if (!cancelled) {
        setBothComposite(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [aiDataUrl, coverRenderMode, sourceDataUrl]);

  const exportPdf = useCallback(async () => {
    if (!model) {
      return;
    }
    const bytes = await exportSingleReportPdf(model);
    const base = safeFilenamePart(project.meta.name);
    const rep = safeFilenamePart(def?.title ?? "report");
    downloadPdfBytes(bytes, `${base}_${rep}.pdf`);
  }, [model, project.meta.name, def?.title]);

  const recaptureCover = useCallback(() => {
    bumpRecalc();
    setAiMessage(null);
  }, [bumpRecalc]);

  useEffect(() => {
    setSnapshotMountId((n) => n + 1);
  }, [coverCorner, coverBackground, project.meta.updatedAt, recalcToken]);

  const cacheKey = useMemo(
    () => `${project.meta.id}|${project.meta.updatedAt}|${coverCorner}|${coverBackground}`,
    [coverBackground, coverCorner, project.meta.id, project.meta.updatedAt],
  );

  const onCoverCaptured = useCallback((url: string | null) => {
    setSourceDataUrl(url);
  }, []);

  const showCoverSnapshot =
    selectedId === "project_cover_3d" && readiness.status !== "blocked" && activeTab === "reports";

  const onAiEnhance = useCallback(async () => {
    if (!sourceDataUrl) {
      setAiMessage("Сначала выполните 3D-рендер.");
      return;
    }
    setAiBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch(sourceDataUrl);
      const blob = await res.blob();
      const provider = getDefaultImageEnhancementProvider();
      const out = await provider.enhance(blob, aiPreset, { mode: coverRenderMode });
      if (out.mimeType.startsWith("image/")) {
        setAiDataUrl(URL.createObjectURL(new Blob([out.imageBytes], { type: out.mimeType })));
        setAiMessage("AI-версия получена.");
      } else {
        setAiDataUrl(null);
        setAiMessage(
          FEATURE_AI_COVER_ENHANCEMENT ? "Провайдер не вернул изображение." : "AI-улучшение пока недоступно (заглушка).",
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiMessage(msg);
    } finally {
      setAiBusy(false);
    }
  }, [aiPreset, coverRenderMode, sourceDataUrl]);

  const onResetAi = useCallback(() => {
    setAiDataUrl(null);
    setBothComposite(null);
    setAiMessage(null);
  }, []);

  return (
    <div
      className="reports-workspace"
      data-left-collapsed={leftCollapsed ? "true" : "false"}
      data-right-collapsed={rightCollapsed ? "true" : "false"}
      style={
        {
          "--rw-left-w": `${leftWidthPx}px`,
          "--rw-right-w": `${rightWidthPx}px`,
        } as CSSProperties
      }
    >
      {showCoverSnapshot ? (
        <ProjectCoverSnapshotCanvas
          key={`${snapshotMountId}-${cacheKey}-${recalcToken}`}
          project={project}
          corner={coverCorner}
          background={coverBackground}
          onCaptured={onCoverCaptured}
        />
      ) : null}

      <aside className="reports-workspace__column reports-workspace__column--left" style={{ width: leftWidthPx }}>
        {!leftCollapsed ? (
          <>
            <div className="reports-workspace__head">
              <h2 className="reports-workspace__h2">Отчёты</h2>
              <button
                type="button"
                className="reports-workspace__panel-toggle"
                onClick={toggleLeft}
                aria-expanded
                aria-controls="reports-tree-panel"
                title="Скрыть список отчётов"
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div id="reports-tree-panel" className="reports-workspace__scroll">
              <ReportsTree project={project} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </>
        ) : (
          <button
            type="button"
            className="reports-workspace__rail reports-workspace__rail--left"
            onClick={toggleLeft}
            aria-expanded={false}
            title="Показать список отчётов"
          >
            <FileText size={20} strokeWidth={2} aria-hidden />
            <ChevronRight size={18} strokeWidth={2} aria-hidden />
          </button>
        )}
      </aside>

      <main className="reports-workspace__main">
        <ReportPreviewPanel model={model} compileError={compileError} />
      </main>

      <aside className="reports-workspace__column reports-workspace__column--right" style={{ width: rightWidthPx }}>
        {!rightCollapsed ? (
          <>
            <div className="reports-workspace__head reports-workspace__head--right">
              <button
                type="button"
                className="reports-workspace__panel-toggle"
                onClick={toggleRight}
                aria-expanded
                aria-controls="reports-params-panel"
                title="Скрыть параметры"
              >
                <ChevronRight size={18} strokeWidth={2} aria-hidden />
              </button>
              <h3 className="reports-workspace__h3">Параметры</h3>
            </div>
            <div id="reports-params-panel" className="reports-workspace__scroll">
              {selectedId === "project_cover_3d" ? (
                <ProjectCoverReportPanel
                  cameraCorner={coverCorner}
                  onCameraCorner={setCoverCorner}
                  background={coverBackground}
                  onBackground={setCoverBackground}
                  renderMode={coverRenderMode}
                  onRenderMode={setCoverRenderMode}
                  aiPreset={aiPreset}
                  onAiPreset={setAiPreset}
                  onRecaptureRender={recaptureCover}
                  onAiEnhance={() => void onAiEnhance()}
                  onResetAi={onResetAi}
                  onExportPdf={() => void exportPdf()}
                  aiBusy={aiBusy}
                  aiMessage={aiMessage}
                />
              ) : (
                <>
                  <label className="reports-workspace__field">
                    <span>Знаменатель масштаба (1:N)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={params.scaleDenominator}
                      onChange={(e) => setScaleDenominator(Number(e.target.value))}
                    />
                  </label>
                  <p className="reports-workspace__hint">
                    Фактический масштаб на листе подбирается автоматически; в штампе показывается приближённое значение.
                  </p>
                  <div className="reports-workspace__actions">
                    <button type="button" className="btn" onClick={bumpRecalc}>
                      Пересчитать
                    </button>
                    <button type="button" className="btn" onClick={() => setExportOpen(true)}>
                      Экспорт PDF
                    </button>
                  </div>
                </>
              )}
              <div className="reports-workspace__status" data-status={readiness.status}>
                <strong>Статус:</strong>{" "}
                {readiness.status === "ready"
                  ? "готов"
                  : readiness.status === "warning"
                    ? "есть замечания"
                    : readiness.status === "blocked"
                      ? "недостаточно данных"
                      : "в разработке"}
              </div>
              {readiness.messages.length > 0 ? (
                <ul className="reports-workspace__warnings">
                  {readiness.messages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              ) : null}
              {model?.messages && model.messages.length > 0 ? (
                <div className="reports-workspace__compile">
                  <strong>Сообщения сборки</strong>
                  <ul>
                    {model.messages.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <button
            type="button"
            className="reports-workspace__rail reports-workspace__rail--right"
            onClick={toggleRight}
            aria-expanded={false}
            title="Показать параметры отчёта"
          >
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
            <SlidersHorizontal size={20} strokeWidth={2} aria-hidden />
          </button>
        )}
      </aside>

      <ExportBundleDialog
        open={exportOpen}
        title="Экспорт в PDF"
        filename={`${safeFilenamePart(project.meta.name)}_${safeFilenamePart(def?.title ?? "report")}.pdf`}
        onClose={() => setExportOpen(false)}
        onConfirmExport={() => void exportPdf()}
      />
    </div>
  );
}
