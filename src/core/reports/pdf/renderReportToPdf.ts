import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

import type { ReportRenderModel } from "../types";

const MM_TO_PT = 72 / 25.4;

function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

/** Лист: X вправо, Y вниз (как в модели отчёта). PDF — Y вверх от низа страницы. */
function sheetYDownToPdfY(pageHeightMm: number, yMm: number): number {
  return mmToPt(pageHeightMm - yMm);
}

function hexToRgb01(hex: string): ReturnType<typeof rgb> | undefined {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return undefined;
  }
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return rgb(r, g, b);
}

export async function renderReportModelToPdfBytes(model: ReportRenderModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([mmToPt(model.pageWidthMm), mmToPt(model.pageHeightMm)]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const h = model.pageHeightMm;

  for (const p of model.primitives) {
    switch (p.kind) {
      case "line": {
        const x1 = mmToPt(p.x1Mm);
        const y1 = sheetYDownToPdfY(h, p.y1Mm);
        const x2 = mmToPt(p.x2Mm);
        const y2 = sheetYDownToPdfY(h, p.y2Mm);
        const hasDash = p.dashMm != null && p.dashMm.length >= 2;
        const ink = hasDash ? rgb(0.475, 0.329, 0.282) : p.muted ? rgb(0.22, 0.22, 0.22) : rgb(0.04, 0.04, 0.04);
        const dashPt =
          p.dashMm != null && p.dashMm.length >= 2 ? p.dashMm.map((d) => mmToPt(d)) : undefined;
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: mmToPt(p.strokeMm),
          color: ink,
          dashArray: dashPt,
          dashPhase: 0,
        });
        break;
      }
      case "polyline": {
        const pts = p.pointsMm;
        if (pts.length < 2) {
          break;
        }
        const strokeW = mmToPt(p.strokeMm);
        const n = p.closed ? pts.length : pts.length - 1;
        const hasDash = p.dashMm != null && p.dashMm.length >= 2;
        const ink = hasDash
          ? rgb(0.475, 0.329, 0.282)
          : p.muted
            ? rgb(0.58, 0.58, 0.58)
            : rgb(0, 0, 0);
        const dashPt =
          p.dashMm != null && p.dashMm.length >= 2 ? [...p.dashMm.map((d) => mmToPt(d))] : undefined;
        for (let i = 0; i < n; i++) {
          const a = pts[i % pts.length]!;
          const b = pts[(i + 1) % pts.length]!;
          page.drawLine({
            start: { x: mmToPt(a.x), y: sheetYDownToPdfY(h, a.y) },
            end: { x: mmToPt(b.x), y: sheetYDownToPdfY(h, b.y) },
            thickness: strokeW,
            color: ink,
            dashArray: dashPt,
            dashPhase: 0,
          });
        }
        break;
      }
      case "rect": {
        const x = mmToPt(p.xMm);
        const yTop = sheetYDownToPdfY(h, p.yMm);
        const w = mmToPt(p.widthMm);
        const hh = mmToPt(p.heightMm);
        const yPdf = yTop - hh;
        const fill = p.fill != null ? hexToRgb01(p.fill) : undefined;
        const bw = p.strokeMm <= 1e-9 ? 0 : mmToPt(p.strokeMm);
        page.drawRectangle({
          x,
          y: yPdf,
          width: w,
          height: hh,
          borderColor: rgb(0.06, 0.06, 0.06),
          borderWidth: bw,
          color: fill,
        });
        break;
      }
      case "image": {
        const idx = p.href.indexOf("base64,");
        if (idx < 0) {
          break;
        }
        const b64 = p.href.slice(idx + 7);
        let bytes: Uint8Array;
        try {
          bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        } catch {
          break;
        }
        const isJpeg = /image\/jpe?g/i.test(p.href);
        const emb = isJpeg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        const x = mmToPt(p.xMm);
        const yTop = sheetYDownToPdfY(h, p.yMm);
        const w = mmToPt(p.widthMm);
        const hh = mmToPt(p.heightMm);
        page.drawImage(emb, { x, y: yTop - hh, width: w, height: hh });
        break;
      }
      case "text": {
        const size = mmToPt(p.fontSizeMm);
        const x = mmToPt(p.xMm);
        const y = sheetYDownToPdfY(h, p.yMm);
        const w = font.widthOfTextAtSize(p.text, size);
        let drawX = x;
        if (p.anchor === "middle") {
          drawX = x - w / 2;
        } else if (p.anchor === "end") {
          drawX = x - w;
        }
        page.drawText(p.text, {
          x: drawX,
          y: y - size * 0.85,
          size,
          font,
          color: rgb(0.05, 0.05, 0.05),
        });
        break;
      }
      case "dimensionLine": {
        const strokeExt = rgb(0.36, 0.61, 0.82);
        const strokeMain = rgb(0.08, 0.4, 0.75);
        const swExt = mmToPt(Math.max(0.07, (p.strokeMm ?? 0.12) * 0.72));
        const swMain = mmToPt(p.strokeMm ?? 0.12);
        page.drawLine({
          start: { x: mmToPt(p.anchor1Xmm), y: sheetYDownToPdfY(h, p.anchor1Ymm) },
          end: { x: mmToPt(p.dimLineX1mm), y: sheetYDownToPdfY(h, p.dimLineY1mm) },
          thickness: swExt,
          color: strokeExt,
        });
        page.drawLine({
          start: { x: mmToPt(p.anchor2Xmm), y: sheetYDownToPdfY(h, p.anchor2Ymm) },
          end: { x: mmToPt(p.dimLineX2mm), y: sheetYDownToPdfY(h, p.dimLineY2mm) },
          thickness: swExt,
          color: strokeExt,
        });
        const x1 = p.dimLineX1mm;
        const y1 = p.dimLineY1mm;
        const x2 = p.dimLineX2mm;
        const y2 = p.dimLineY2mm;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const gap = p.centerGapMm ?? 0;
        if (gap > 0 && len > gap + 1e-3) {
          const ux = dx / len;
          const uy = dy / len;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const g2 = gap / 2;
          const xa = mx - ux * g2;
          const ya = my - uy * g2;
          const xb = mx + ux * g2;
          const yb = my + uy * g2;
          page.drawLine({
            start: { x: mmToPt(x1), y: sheetYDownToPdfY(h, y1) },
            end: { x: mmToPt(xa), y: sheetYDownToPdfY(h, ya) },
            thickness: swMain,
            color: strokeMain,
          });
          page.drawLine({
            start: { x: mmToPt(xb), y: sheetYDownToPdfY(h, yb) },
            end: { x: mmToPt(x2), y: sheetYDownToPdfY(h, y2) },
            thickness: swMain,
            color: strokeMain,
          });
        } else {
          page.drawLine({
            start: { x: mmToPt(x1), y: sheetYDownToPdfY(h, y1) },
            end: { x: mmToPt(x2), y: sheetYDownToPdfY(h, y2) },
            thickness: swMain,
            color: strokeMain,
          });
        }
        const fs = mmToPt(p.labelFontSizeMm ?? 5.55);
        const tw = font.widthOfTextAtSize(p.label, fs);
        const rot = p.labelRotationDeg ?? 0;
        page.drawText(p.label, {
          x: mmToPt(p.labelXmm) - tw / 2,
          y: sheetYDownToPdfY(h, p.labelYmm) - fs * 0.35,
          size: fs,
          font,
          color: strokeMain,
          rotate: degrees(rot),
        });
        break;
      }
      case "tableBlock": {
        let y0 = p.yMm;
        for (let r = 0; r < p.cells.length; r++) {
          const row = p.cells[r]!;
          let x0 = p.xMm;
          const rh = p.rowHeightsMm[r] ?? 6;
          for (let c = 0; c < row.length; c++) {
            const cw = p.colWidthsMm[c] ?? 20;
            page.drawRectangle({
              x: mmToPt(x0),
              y: sheetYDownToPdfY(h, y0 + rh) - mmToPt(rh),
              width: mmToPt(cw),
              height: mmToPt(rh),
              borderColor: rgb(0.6, 0.6, 0.6),
              borderWidth: 0.5,
            });
            page.drawText(row[c] ?? "", {
              x: mmToPt(x0) + 1,
              y: sheetYDownToPdfY(h, y0 + rh) - mmToPt(p.fontSizeMm) - 1,
              size: mmToPt(p.fontSizeMm),
              font,
              color: rgb(0, 0, 0),
            });
            x0 += cw;
          }
          y0 += rh;
        }
        break;
      }
    }
  }

  return pdf.save();
}
