import { describe, expect, it } from "vitest";

import {
  decodeProjectWireFromFirestore,
  encodeProjectWireForFirestore,
  FIRESTORE_FOOTPRINT_HOLE_RING_KEY,
} from "./projectFirestoreWire";
import type { ProjectFileV1 } from "@/core/io/projectWire";

describe("projectFirestoreWire", () => {
  it("кодирует holeRingsMm без вложенных массивов и декодирует обратно", () => {
    const wire: ProjectFileV1 = {
      schemaVersion: 1,
      id: "p1",
      name: "t",
      createdAt: "a",
      updatedAt: "b",
      units: "mm",
      layers: [
        {
          id: "L",
          name: "1",
          domain: "floorPlan",
          orderIndex: 0,
          elevationMm: 0,
          levelMode: "absolute",
          offsetFromBelowMm: 0,
          manualHeightMm: 0,
          isVisible: true,
          createdAt: "a",
          updatedAt: "b",
        },
      ],
      activeLayerId: "L",
      visibleLayerIds: ["L"],
      walls: [],
      planLines: [],
      foundationStrips: [
        {
          kind: "footprint_poly",
          id: "f1",
          layerId: "L",
          depthMm: 400,
          sideOutMm: 50,
          sideInMm: 50,
          createdAt: "t",
          outerRingMm: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
          holeRingsMm: [
            [
              { x: 10, y: 10 },
              { x: 90, y: 10 },
              { x: 90, y: 90 },
              { x: 10, y: 90 },
            ],
          ],
        },
      ],
      foundationPiles: [],
      wallCalculations: [],
      wallJoints: [],
      openings: [],
      openingFramingPieces: [],
      rooms: [],
      foundation: { type: "none" },
      roof: { slopes: [] },
      materialSet: { id: "m1", name: "По умолчанию" },
      sheets: [],
      dimensions: [],
      settings: {} as ProjectFileV1["settings"],
      viewState: {} as ProjectFileV1["viewState"],
      profiles: [],
    };

    const enc = encodeProjectWireForFirestore(wire);
    const fs0 = enc.foundationStrips![0]!;
    expect(fs0.kind).toBe("footprint_poly");
    if (fs0.kind === "footprint_poly") {
      const holes = fs0.holeRingsMm as unknown[];
      expect(Array.isArray(holes[0])).toBe(false);
      expect(holes[0]).toMatchObject({ [FIRESTORE_FOOTPRINT_HOLE_RING_KEY]: expect.any(Array) });
    }

    const dec = decodeProjectWireFromFirestore(enc);
    expect(dec.foundationStrips![0]).toEqual(wire.foundationStrips![0]);
  });
});
