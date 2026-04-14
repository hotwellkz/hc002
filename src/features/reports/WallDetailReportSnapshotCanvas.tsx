import { useLayoutEffect, useRef } from "react";

import type { Project } from "@/core/domain/project";
import { WallDetailSheetCanvas } from "@/features/ui/WallDetailSheetCanvas";
import { rasterizeWallDetailSvgToPngDataUrl } from "@/features/reports/wallDetailSheetRasterCapture";

export interface WallDetailReportSnapshotCanvasProps {
  readonly project: Project;
  readonly wallId: string;
  readonly onCaptured: (dataUrl: string | null) => void;
}

/**
 * Скрытый рендер того же листа «Вид стены», что и во вкладке (без вида сверху, с мини-планом), для вставки в PDF.
 */
export function WallDetailReportSnapshotCanvas({ project, wallId, onCaptured }: WallDetailReportSnapshotCanvasProps) {
  const wall = project.walls.find((w) => w.id === wallId) ?? null;
  const doneRef = useRef(false);

  useLayoutEffect(() => {
    doneRef.current = false;
  }, [project.meta.updatedAt, wallId]);

  useLayoutEffect(() => {
    if (!wall) {
      onCaptured(null);
      return;
    }
    let cancelled = false;
    let frames = 0;
    const maxFrames = 90;

    const tick = (): void => {
      if (cancelled) {
        return;
      }
      frames += 1;
      const root = document.querySelector<HTMLElement>(`[data-wall-detail-report-snapshot="${wallId}"]`);
      const svg = root?.querySelector<SVGSVGElement>("svg.wd-canvas");
      const vb = svg?.getAttribute("viewBox");
      const ok = svg != null && vb != null && vb.length > 0 && frames > 8;
      if (ok) {
        void (async () => {
          const url = await rasterizeWallDetailSvgToPngDataUrl(svg!);
          if (!cancelled && !doneRef.current) {
            doneRef.current = true;
            onCaptured(url);
          }
        })();
        return;
      }
      if (frames >= maxFrames) {
        if (!cancelled) {
          onCaptured(null);
        }
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [wall, wallId, onCaptured, project.meta.updatedAt]);

  if (!wall) {
    return null;
  }

  return (
    <div
      data-wall-detail-report-snapshot={wallId}
      style={{
        position: "fixed",
        left: -12000,
        top: 0,
        width: 2800,
        height: 2000,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: 0.001,
      }}
      aria-hidden
    >
      <WallDetailSheetCanvas
        project={project}
        wall={wall}
        showTopView={false}
        showMiniPlan
        reportMode
        hideScrollHint
      />
    </div>
  );
}
