import { useSyncExternalStore } from "react";

import { MOBILE_LAYOUT_MAX_WIDTH_PX } from "@/shared/constants/mobileLayout";

function subscribeMobileLayout(cb: () => void) {
  const mq = window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getMobileLayoutSnapshot() {
  return window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`).matches;
}

function getServerSnapshot() {
  return false;
}

/** true на телефонах и узком окне (см. MOBILE_LAYOUT_MAX_WIDTH_PX). */
export function useMobileLayout(): boolean {
  return useSyncExternalStore(subscribeMobileLayout, getMobileLayoutSnapshot, getServerSnapshot);
}
