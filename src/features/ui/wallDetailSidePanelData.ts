import { useMemo } from "react";

import { getProfileById } from "@/core/domain/profileOps";
import type { Project } from "@/core/domain/project";
import type { Wall } from "@/core/domain/wall";
import { resolveWallCalculationModel } from "@/core/domain/wallManufacturing";
import {
  buildWallDetailSipFacadeSlices,
  type WallDetailSipFacadeSlice,
} from "@/core/domain/wallDetailSipElevation";
import { buildWallDetailSipPanelDisplayGrouping } from "@/core/domain/wallDetailSipPanelGrouping";
import {
  formatLumberFullDisplayMark,
  formatSipPanelDisplayMark,
  lumberGroupKeySectionAndLength,
  lumberGroupedPositionIndexByPieceId,
  lumberPiecesSortedForDisplay,
  wallMarkLabelForDisplay,
} from "@/core/domain/pieceDisplayMark";

const SHEET_WALL_TOP_MM = 96;

/** Таблицы справа во вкладке «Вид стены» — те же данные, что использует холст. */
export function useWallDetailSidePanelData(project: Project, wall: Wall | null) {
  const calc = wall ? project.wallCalculations.find((c) => c.wallId === wall.id) ?? null : null;

  const openingsOnWall = useMemo(() => {
    if (!wall) return [];
    return project.openings
      .filter((o) => o.wallId === wall.id && o.offsetFromStartMm != null)
      .sort((a, b) => (a.offsetFromStartMm ?? 0) - (b.offsetFromStartMm ?? 0));
  }, [project.openings, wall]);

  const wallLabel = wall ? wallMarkLabelForDisplay(wall.markLabel, wall.id.slice(0, 8)) : "";
  const wallProfile = wall?.profileId ? getProfileById(project, wall.profileId) : undefined;
  const isSipLikeWall = wallProfile ? resolveWallCalculationModel(wallProfile) === "sip" : true;
  const wallSystemLabel = isSipLikeWall ? "SIP" : "Листовая";

  const L = wall ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : 0;

  const lumberPositionByPieceId = useMemo(
    () => (calc ? lumberGroupedPositionIndexByPieceId(calc.lumberPieces) : new Map<string, number>()),
    [calc],
  );

  const lumberRows = useMemo(() => {
    if (!calc || !wall) return [];
    const sorted = lumberPiecesSortedForDisplay(calc.lumberPieces);
    const wallMark = wallMarkLabelForDisplay(wall.markLabel, wall.id.slice(0, 8));
    type Agg = { n: number; section: string; length: number; qty: number; sortHint: number };
    const byKey = new Map<string, Agg>();
    for (const p of sorted) {
      const key = lumberGroupKeySectionAndLength(p);
      const n = lumberPositionByPieceId.get(p.id) ?? 0;
      const section = `${Math.round(p.sectionThicknessMm)}x${Math.round(p.sectionDepthMm)}`;
      const length = Math.round(p.lengthMm);
      const sortHint = p.displayOrder * 1e9 + p.sortKey;
      const g = byKey.get(key);
      if (g) {
        g.qty += 1;
      } else {
        byKey.set(key, { n, section, length, qty: 1, sortHint });
      }
    }
    return [...byKey.values()]
      .sort((a, b) => a.n - b.n || a.sortHint - b.sortHint)
      .map((r) => ({
        n: r.n,
        rowKey: `${r.section}-${r.length}`,
        mark: formatLumberFullDisplayMark(wallMark, r.n),
        section: r.section,
        length: r.length,
        qty: r.qty,
      }));
  }, [calc, wall, lumberPositionByPieceId]);

  const wallDetailSipFrameMm = useMemo(() => {
    if (!wall || !calc) return null;
    const wallTop = SHEET_WALL_TOP_MM;
    const wallBottom = wallTop + wall.heightMm;
    return {
      wallTopMm: wallTop,
      wallBottomMm: wallBottom,
      wallHeightMm: wall.heightMm,
    };
  }, [wall, calc]);

  const sipFacadeSlices: readonly WallDetailSipFacadeSlice[] = useMemo(() => {
    if (!wall || !calc || !wallDetailSipFrameMm || calc.sipRegions.length === 0) {
      return [];
    }
    const panelNominalW = Math.max(1, Math.round(calc.settingsSnapshot.panelNominalWidthMm ?? 1250));
    return buildWallDetailSipFacadeSlices(calc.sipRegions, openingsOnWall, wall, wallDetailSipFrameMm, {
      panelNominalWidthMm: panelNominalW,
    });
  }, [wall, calc, openingsOnWall, wallDetailSipFrameMm]);

  const sipPanelGrouping = useMemo(() => {
    if (!wall || sipFacadeSlices.length === 0) {
      return null;
    }
    const wallBottomSheetMm = SHEET_WALL_TOP_MM + wall.heightMm;
    return buildWallDetailSipPanelDisplayGrouping(
      sipFacadeSlices,
      L,
      wall.thicknessMm,
      openingsOnWall,
      wall.id,
      wallBottomSheetMm,
    );
  }, [wall, sipFacadeSlices, L, openingsOnWall, wall?.thicknessMm]);

  const sipRows = useMemo(() => {
    if (!sipPanelGrouping) return [];
    return [...sipPanelGrouping.groupedRows]
      .sort((a, b) => a.positionOneBased - b.positionOneBased)
      .map((r) => ({
        mark: formatSipPanelDisplayMark(wallLabel, r.positionOneBased - 1),
        size: `${r.widthMm}x${r.heightMm}x${r.thicknessMm}`,
        qty: r.qty,
        rowKey: r.groupKey,
      }));
  }, [sipPanelGrouping, wallLabel]);

  return {
    calc,
    openingsOnWall,
    wallLabel,
    sipFacadeSlices,
    sipPanelGrouping,
    lumberRows,
    sipRows,
    isSipLikeWall,
    wallSystemLabel,
  };
}
