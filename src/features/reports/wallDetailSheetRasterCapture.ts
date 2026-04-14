import wallDetailCss from "@/features/ui/wall-detail-workspace.css?raw";

/**
 * Растровый снимок SVG «Вид стены» для PDF: встраиваем стили вкладки, чтобы совпадала отрисовка.
 */
export async function rasterizeWallDetailSvgToPngDataUrl(svgEl: SVGSVGElement): Promise<string | null> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.setAttribute("type", "text/css");
  st.textContent = `
svg.wd-canvas, svg.wd-canvas * { --color-dimension-line: #64748b; --color-dimension-text: #1f2937; --color-accent: #5b8cff; }
${wallDetailCss}
`;
  defs.appendChild(st);
  clone.insertBefore(defs, clone.firstChild);

  const vb = clone.getAttribute("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [, , vw, vh] = parts;
      clone.setAttribute("width", String(vw));
      clone.setAttribute("height", String(vh));
    }
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1200;
      const h = img.naturalHeight || 900;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
