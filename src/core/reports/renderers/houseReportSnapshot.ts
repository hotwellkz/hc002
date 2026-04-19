/**
 * Общие параметры растрового рендера дома для листов отчёта (обложка 3D и цветные фасады).
 */
export {
  COVER_RENDER_ASPECT,
  COVER_RENDER_LONG_SIDE_PX,
  getCoverRenderPixelSize as getHouseReportRasterPixelSize,
} from "./renderProjectCoverImage";

export { fitOrthoCameraForElevation } from "./facadeOrthoCamera";
