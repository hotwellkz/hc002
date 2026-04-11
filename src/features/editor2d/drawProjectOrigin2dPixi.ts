import { Container, Graphics, Text } from "pixi.js";

import { cssHexToPixiNumber } from "@/shared/cssColor";

import type { ViewportTransform } from "./viewportTransforms";
import { worldToScreen } from "./viewportTransforms";

export function clearProjectOriginMarker(container: Container): void {
  for (const c of [...container.children]) {
    c.destroy({ children: true });
  }
  container.removeChildren();
}

/**
 * Компактный маркер базы плана (0,0): короткий крест в экранных пикселях + ненавязчивая подпись.
 */
export function drawProjectOriginMarker2d(
  container: Container,
  originMm: { readonly x: number; readonly y: number },
  t: ViewportTransform,
  opts: { readonly toolActive: boolean },
): void {
  clearProjectOriginMarker(container);
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const muted = cs.getPropertyValue("--color-text-muted").trim() || "#8b96a8";
  const mutedPixi = cssHexToPixiNumber(muted);

  const p0 = worldToScreen(originMm.x, originMm.y, t);
  const half = opts.toolActive ? 6 : 5;
  const w = opts.toolActive ? 1.35 : 1.1;

  const g = new Graphics();
  g.moveTo(p0.x - half, p0.y);
  g.lineTo(p0.x + half, p0.y);
  g.stroke({ width: w, color: mutedPixi, alpha: 0.88 });
  g.moveTo(p0.x, p0.y - half);
  g.lineTo(p0.x, p0.y + half);
  g.stroke({ width: w, color: mutedPixi, alpha: 0.88 });
  container.addChild(g);

  const txt = new Text({
    text: "0,0",
    style: {
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: 9,
      fill: mutedPixi,
      fontWeight: "500",
    },
  });
  txt.anchor.set(0, 1);
  txt.x = p0.x + half + 3;
  txt.y = p0.y - half - 1;
  txt.alpha = 0.78;
  container.addChild(txt);
}
