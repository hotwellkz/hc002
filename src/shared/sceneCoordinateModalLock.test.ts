import { describe, expect, it } from "vitest";

import { isSceneCoordinateModalBlocking } from "./sceneCoordinateModalLock";

describe("isSceneCoordinateModalBlocking", () => {
  it("false если все модалки закрыты", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: false,
      }),
    ).toBe(false);
  });

  it("true если открыта любая из координатных модалок", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: true,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: false,
      }),
    ).toBe(true);
  });

  it("true если открыт числовой ввод смещения проёма", () => {
    expect(
      isSceneCoordinateModalBlocking({
        wallCoordinateModalOpen: false,
        wallAnchorCoordinateModalOpen: false,
        wallMoveCopyCoordinateModalOpen: false,
        lengthChangeCoordinateModalOpen: false,
        projectOriginCoordinateModalOpen: false,
        openingAlongMoveNumericModalOpen: true,
      }),
    ).toBe(true);
  });
});
