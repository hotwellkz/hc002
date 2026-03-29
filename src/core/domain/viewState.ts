export type EditorTab = "2d" | "3d";

export interface ViewportState2D {
  readonly panXMm: number;
  readonly panYMm: number;
  /** Пикселей на мм. */
  readonly zoomPixelsPerMm: number;
}

export interface ViewportState3D {
  readonly polarAngle: number;
  readonly azimuthalAngle: number;
  readonly distance: number;
  readonly targetXMm: number;
  readonly targetYMm: number;
  readonly targetZMm: number;
}

export interface ViewState {
  readonly activeTab: EditorTab;
  readonly viewport2d: ViewportState2D;
  readonly viewport3d: ViewportState3D;
}
