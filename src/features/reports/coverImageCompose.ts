/**
 * Склейка двух data URL в одно изображение (режим «исходник + AI»).
 */
export async function composeCoverSideBySide(leftHref: string, rightHref: string): Promise<string> {
  const [a, b] = await Promise.all([loadImage(leftHref), loadImage(rightHref)]);
  const w = a.width + b.width;
  const h = Math.max(a.height, b.height);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) {
    return leftHref;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(a, 0, (h - a.height) / 2);
  ctx.drawImage(b, a.width, (h - b.height) / 2);
  return c.toDataURL("image/png");
}

function loadImage(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("cover image load failed"));
    img.src = href;
  });
}
