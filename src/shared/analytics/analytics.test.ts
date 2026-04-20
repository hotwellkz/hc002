import { beforeEach, describe, expect, it } from "vitest";

import { __resetAnalyticsForTests, trackEvent, trackPageView } from "./analytics";

describe("analytics fail-safe без env", () => {
  beforeEach(() => {
    __resetAnalyticsForTests();
  });

  it("trackEvent ничего не ломает, если аналитика не инициализирована", () => {
    expect(() => trackEvent("click_start_project")).not.toThrow();
    expect(() => trackEvent("click_demo", { source: "test" })).not.toThrow();
    expect(() => trackEvent("registration_success", { mode: "self_signup" })).not.toThrow();
  });

  it("trackPageView ничего не ломает, если аналитика не инициализирована", () => {
    expect(() => trackPageView("/")).not.toThrow();
    expect(() => trackPageView("/app/projects")).not.toThrow();
  });
});
