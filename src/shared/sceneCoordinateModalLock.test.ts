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
      }),
    ).toBe(true);
  });
});
