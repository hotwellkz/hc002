import type { OpeningAlongAnchor, OpeningAlongAlignment } from "@/core/domain/openingWindowTypes";

import { WindowPositionDiagramSvg } from "./WindowPositionDiagramSvg";

export interface WindowPositionDimPreviewProps {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly anchorAlongWall: OpeningAlongAnchor;
  readonly offsetAlongWallMm: number;
  readonly alignment: OpeningAlongAlignment;
  readonly sillLevelMm: number;
}

function anchorLabel(a: OpeningAlongAnchor): string {
  switch (a) {
    case "wall_start":
      return "Начало стены";
    case "wall_end":
      return "Конец стены";
    case "wall_center":
      return "Центр стены";
    default:
      return "";
  }
}

function alignmentLabel(al: OpeningAlongAlignment): string {
  switch (al) {
    case "center":
      return "По центру";
    case "leading":
      return "По левому краю";
    case "trailing":
      return "По правому краю";
    default:
      return "";
  }
}

function fmtMm(n: number): string {
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `${Math.round(n).toLocaleString("ru-RU")} мм`;
}

/**
 * Карточка превью вкладки «Позиция»: заголовок, SVG-схема (короткие подписи),
 * текстовый summary — длинные значения без обрезания.
 */
export function WindowPositionDimPreview(props: WindowPositionDimPreviewProps) {
  const { widthMm, heightMm, anchorAlongWall, offsetAlongWallMm, alignment, sillLevelMm } = props;

  return (
    <div className="wp-position-preview">
      <h3 className="wp-position-preview__title">Схема положения окна</h3>

      <div className="wp-position-preview__diagram">
        <WindowPositionDiagramSvg {...props} />
      </div>

      <dl className="wp-position-preview__summary">
        <div className="wp-position-preview__row">
          <dt>Привязка</dt>
          <dd>{anchorLabel(anchorAlongWall)}</dd>
        </div>
        <div className="wp-position-preview__row">
          <dt>Смещение</dt>
          <dd>{fmtMm(offsetAlongWallMm)}</dd>
        </div>
        <div className="wp-position-preview__row">
          <dt>Выравнивание</dt>
          <dd>{alignmentLabel(alignment)}</dd>
        </div>
        <div className="wp-position-preview__row">
          <dt>Низ проёма</dt>
          <dd>{fmtMm(sillLevelMm)}</dd>
        </div>
        <div className="wp-position-preview__row wp-position-preview__row--emph">
          <dt>Ширина × высота</dt>
          <dd>
            {Number.isFinite(widthMm) ? Math.round(widthMm).toLocaleString("ru-RU") : "—"} ×{" "}
            {Number.isFinite(heightMm) ? Math.round(heightMm).toLocaleString("ru-RU") : "—"} мм
          </dd>
        </div>
      </dl>
    </div>
  );
}
