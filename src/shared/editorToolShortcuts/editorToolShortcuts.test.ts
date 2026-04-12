import { describe, expect, it } from "vitest";

import { formatShortcutCodeLabel } from "./formatShortcutLabel";
import { buildShortcutCodeIndex, getResolvedShortcutCodes } from "./resolveEditorShortcutCodes";
import { hasBlockingEditorOverlayModal, shouldIgnoreEditorToolHotkeys } from "./shouldIgnoreEditorToolHotkeys";

const baseApp = {
  activeTab: "2d",
  layerManagerOpen: false,
  layerParamsModalOpen: false,
  profilesModalOpen: false,
  addWallModalOpen: false,
  addFloorBeamModalOpen: false,
  floorBeamSplitModalOpen: false,
  addFoundationStripModalOpen: false,
  addFoundationPileModalOpen: false,
  addSlabModalOpen: false,
  addRoofPlaneModalOpen: false,
  addWindowModalOpen: false,
  addDoorModalOpen: false,
  windowEditModal: null,
  doorEditModal: null,
  slabEditModal: null,
  wallJointParamsModalOpen: false,
  wallCalculationModalOpen: false,
  roofCalculationModalOpen: false,
  wallCoordinateModalOpen: false,
  floorBeamPlacementCoordinateModalOpen: false,
  slabCoordinateModalOpen: false,
  wallAnchorCoordinateModalOpen: false,
  wallMoveCopyCoordinateModalOpen: false,
  floorBeamMoveCopyCoordinateModalOpen: false,
  lengthChangeCoordinateModalOpen: false,
  projectOriginCoordinateModalOpen: false,
  openingAlongMoveNumericModalOpen: false,
  roofPlaneEdgeOffsetModal: null,
  foundationStripAutoPilesModal: null,
  entityCopyCoordinateModalOpen: false,
  entityCopyParamsModal: null,
  textureApply3dParamsModal: null,
  editor3dContextMenu: null,
} as const;

describe("getResolvedShortcutCodes", () => {
  it("возвращает дефолт при отсутствии override", () => {
    expect(getResolvedShortcutCodes("toolSelect", {})).toEqual(["KeyW"]);
  });

  it("null отключает действие", () => {
    expect(getResolvedShortcutCodes("toolSelect", { toolSelect: null })).toEqual([]);
  });

  it("для удаления по умолчанию два кода", () => {
    expect(getResolvedShortcutCodes("deleteSelected", {})).toEqual(["Delete", "Backspace"]);
  });
});

describe("buildShortcutCodeIndex", () => {
  it("строит индекс по дефолтам", () => {
    const m = buildShortcutCodeIndex({});
    expect(m.get("KeyW")).toEqual(["toolSelect"]);
    expect(m.get("Delete")).toEqual(["deleteSelected"]);
    expect(m.get("Backspace")).toEqual(["deleteSelected"]);
  });
});

describe("shouldIgnoreEditorToolHotkeys", () => {
  it("игнорирует не на вкладке 2D", () => {
    expect(
      shouldIgnoreEditorToolHotkeys(null, { ...baseApp, activeTab: "3d" }, { shortcutsSettingsModalOpen: false, shortcutRebindCaptureActive: false }),
    ).toBe(true);
  });

  it("игнорирует при открытом окне настроек", () => {
    expect(
      shouldIgnoreEditorToolHotkeys(null, baseApp, { shortcutsSettingsModalOpen: true, shortcutRebindCaptureActive: false }),
    ).toBe(true);
  });

  it("не игнорирует пустой холст 2D", () => {
    expect(
      shouldIgnoreEditorToolHotkeys(null, baseApp, { shortcutsSettingsModalOpen: false, shortcutRebindCaptureActive: false }),
    ).toBe(false);
  });
});

describe("hasBlockingEditorOverlayModal", () => {
  it("true при открытой модалке координат стены", () => {
    expect(hasBlockingEditorOverlayModal({ ...baseApp, wallCoordinateModalOpen: true })).toBe(true);
  });
});

describe("formatShortcutCodeLabel", () => {
  it("KeyW → W", () => {
    expect(formatShortcutCodeLabel("KeyW")).toBe("W");
  });
});
