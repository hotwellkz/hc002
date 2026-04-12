import { useCallback, useMemo, useState } from "react";

import { compileReport } from "@/core/reports/compileReport";
import { getReportDefinition } from "@/core/reports/registry";
import type { ReportCompileParams, ReportRenderModel } from "@/core/reports/types";
import type { Project } from "@/core/domain/project";

function defaultParams(): ReportCompileParams {
  return {
    scaleDenominator: 100,
    reportDateIso: new Date().toISOString(),
    sheetIndex: 1,
    sheetCount: 1,
  };
}

/**
 * @param compileOverlay — доп. поля для компиляции (например data URL обложки 3D).
 */
export function useLiveReportModel(
  project: Project,
  reportDefinitionId: string | null,
  compileOverlay: Partial<ReportCompileParams> | null = null,
) {
  const [params, setParams] = useState<ReportCompileParams>(defaultParams);
  const [recalcToken, setRecalcToken] = useState(0);

  const bumpRecalc = useCallback(() => {
    setRecalcToken((n) => n + 1);
    setParams((p) => ({ ...p, reportDateIso: new Date().toISOString() }));
  }, []);

  const mergedParams = useMemo((): ReportCompileParams => {
    if (!compileOverlay) {
      return params;
    }
    return { ...params, ...compileOverlay };
  }, [params, compileOverlay]);

  const { model, compileError } = useMemo((): {
    model: ReportRenderModel | null;
    compileError: string | null;
  } => {
    if (!reportDefinitionId) {
      return { model: null, compileError: null };
    }
    const def = getReportDefinition(reportDefinitionId);
    if (!def) {
      return { model: null, compileError: "Неизвестный отчёт." };
    }
    try {
      return { model: compileReport(project, def, mergedParams), compileError: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { model: null, compileError: msg };
    }
  }, [project, reportDefinitionId, mergedParams, recalcToken]);

  return {
    model,
    compileError,
    params,
    mergedParams,
    recalcToken,
    setScaleDenominator: (n: number) => setParams((p) => ({ ...p, scaleDenominator: Math.max(1, Math.round(n)) })),
    bumpRecalc,
  };
}
