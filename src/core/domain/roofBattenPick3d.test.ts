import { describe, expect, it } from "vitest";

import { parseRoofBattenPickEntityId, roofBattenPickEntityId } from "./roofBattenPick3d";

describe("roofBattenPick3d", () => {
  it("кодирует и парсит id ската и индекса", () => {
    const id = roofBattenPickEntityId("plane-uuid-1", 7);
    expect(id).toBe("roofBatten:plane-uuid-1:7");
    expect(parseRoofBattenPickEntityId(id)).toEqual({ planeId: "plane-uuid-1", battenIndex: 7 });
  });

  it("отклоняет посторонние строки", () => {
    expect(parseRoofBattenPickEntityId("wall:x")).toBeNull();
    expect(parseRoofBattenPickEntityId("roofBatten:")).toBeNull();
    expect(parseRoofBattenPickEntityId("roofBatten:onlyPlane")).toBeNull();
    expect(parseRoofBattenPickEntityId("roofBatten:plane:naN")).toBeNull();
  });
});
