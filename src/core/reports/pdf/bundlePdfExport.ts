import type { ReportRenderModel } from "../types";
import { renderReportModelToPdfBytes } from "./renderReportToPdf";

/** MVP: один отчёт — один PDF-документ. */
export async function exportSingleReportPdf(model: ReportRenderModel): Promise<Uint8Array> {
  return renderReportModelToPdfBytes(model);
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
