import { describe, expect, it } from "vitest";

import { isPrivateRoute, serializeRobots } from "./documentSeo";

describe("isPrivateRoute", () => {
  it("главная и пустые значения — публичные", () => {
    expect(isPrivateRoute("/")).toBe(false);
    expect(isPrivateRoute("")).toBe(false);
  });

  it("/app, /login, /register, /invite/* и /demo — приватные", () => {
    expect(isPrivateRoute("/app")).toBe(true);
    expect(isPrivateRoute("/app/")).toBe(true);
    expect(isPrivateRoute("/app/projects")).toBe(true);
    expect(isPrivateRoute("/app/team")).toBe(true);
    expect(isPrivateRoute("/login")).toBe(true);
    expect(isPrivateRoute("/register")).toBe(true);
    expect(isPrivateRoute("/invite/abc")).toBe(true);
    expect(isPrivateRoute("/demo")).toBe(true);
  });

  it("публичные маркетинговые страницы — индексируем", () => {
    expect(isPrivateRoute("/sip-house-design-software")).toBe(false);
    expect(isPrivateRoute("/sip-panel-calculator")).toBe(false);
    expect(isPrivateRoute("/for-construction-companies")).toBe(false);
  });
});

describe("serializeRobots", () => {
  it("преобразует директивы в meta content", () => {
    expect(serializeRobots("index")).toBe("index, follow");
    expect(serializeRobots("noindex")).toBe("noindex, nofollow");
  });
});
