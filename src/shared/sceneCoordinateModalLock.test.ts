import { describe, expect, it } from "vitest";

import { isSceneCoordinateModalBlocking } from "./sceneCoordinateModalLock";

describe("isSceneCoordinateModalBlocking", () => {
  it("false если все модалки закрыты", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        floorBeamMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: false,
        slabCoordinateModalOpen: false,
        entityCopyCoordinateModalOpen: false,
        entityCopyParamsModal: null,
        roofPlaneEdgeOffsetModal: null,
      }),
    ).toBe(false);
  });

  it("true если открыта любая из координатных модалок", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: true,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        floorBeamMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: false,
        slabCoordinateModalOpen: false,
        entityCopyCoordinateModalOpen: false,
        entityCopyParamsModal: null,
        roofPlaneEdgeOffsetModal: null,
      }),
    ).toBe(true);
  });

  it("true если открыт числовой ввод смещения проёма", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        floorBeamMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: true,
        slabCoordinateModalOpen: false,
        entityCopyCoordinateModalOpen: false,
        entityCopyParamsModal: null,
        roofPlaneEdgeOffsetModal: null,
      }),
    ).toBe(true);
  });

  it("true если открыта модалка координат универсального копирования", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        floorBeamMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: false,
        slabCoordinateModalOpen: false,
        entityCopyCoordinateModalOpen: true,
        entityCopyParamsModal: null,
        roofPlaneEdgeOffsetModal: null,
      }),
    ).toBe(true);
  });

  it("true если открыта модалка параметров копирования", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        floorBeamMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: false,
        slabCoordinateModalOpen: false,
        entityCopyCoordinateModalOpen: false,
        entityCopyParamsModal: {},
        roofPlaneEdgeOffsetModal: null,
      }),
    ).toBe(true);
  });

  it("true если открыта модалка смещения ребра ската", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: false,
        floorBeamPlacementCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        floorBeamMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: false,
        slabCoordinateModalOpen: false,
        entityCopyCoordinateModalOpen: false,
        entityCopyParamsModal: null,
        roofPlaneEdgeOffsetModal: { planeId: "x", edgeIndex: 0, baseQuad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], initialValueStr: "0" },
      }),
    ).toBe(true);
  });
});
