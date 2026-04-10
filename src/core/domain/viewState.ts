export type EditorTab = "2d" | "3d" | "spec" | "wall";

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
  /** Узкий rail вместо полной панели «Свойства» (сохраняется в проекте). */
  readonly rightPropertiesCollapsed: boolean;
  /**
   * true: layered-профили в 3D как отдельные объёмы по слоям.
   * false: одна «сплошная» стена (упрощённо, меньше мешей).
   */
  readonly show3dProfileLayers: boolean;
  /**
   * true: layered-профили на 2D-плане как полосы по толщине (независимо от масштаба).
   * false: одна полоса как раньше.
   */
  readonly show2dProfileLayers: boolean;
  /**
   * true: в 3D показывать объёмы из расчёта (SIP-панели, пиломатериалы).
   * false: только геометрия стен по профилю.
   */
  readonly show3dCalculation: boolean;
  /** Видимость оболочки стены: OSB (слои профиля с материалом osb). */
  readonly show3dLayerOsb: boolean;
  /** Видимость утеплителя в оболочке и расчётных SIP-зон (eps/xps/insulation + расчёт EPS). */
  readonly show3dLayerEps: boolean;
  /** Видимость пиломатериала из расчёта стены (каркас). */
  readonly show3dLayerFrame: boolean;
  /** Слои обшивки гипсокартоном в 3D (`materialType: gypsum` в профиле). */
  readonly show3dLayerGypsum: boolean;
  /** Заготовка: проёмы / окна в 3D (пока без отдельной геометрии). */
  readonly show3dLayerWindows: boolean;
  /** Заготовка: двери в 3D. */
  readonly show3dLayerDoors: boolean;
}

/** Нормализация viewState из файла (старые проекты без поля). */
const VALID_TABS: readonly EditorTab[] = ["2d", "3d", "spec", "wall"];

export function normalizeViewState(
  input: Pick<ViewState, "activeTab" | "viewport2d" | "viewport3d"> & {
    readonly rightPropertiesCollapsed?: boolean;
    readonly show3dProfileLayers?: boolean;
    readonly show2dProfileLayers?: boolean;
    readonly show3dCalculation?: boolean;
    readonly show3dLayerOsb?: boolean;
    readonly show3dLayerEps?: boolean;
    readonly show3dLayerFrame?: boolean;
    readonly show3dLayerGypsum?: boolean;
    readonly show3dLayerWindows?: boolean;
    readonly show3dLayerDoors?: boolean;
  },
): ViewState {
  const tab = VALID_TABS.includes(input.activeTab as EditorTab) ? input.activeTab : "2d";
  return {
    activeTab: tab,
    viewport2d: input.viewport2d,
    viewport3d: input.viewport3d,
    rightPropertiesCollapsed: input.rightPropertiesCollapsed === true,
    show3dProfileLayers: input.show3dProfileLayers !== false,
    show2dProfileLayers: input.show2dProfileLayers !== false,
    show3dCalculation: input.show3dCalculation !== false,
    show3dLayerOsb: input.show3dLayerOsb !== false,
    show3dLayerEps: input.show3dLayerEps !== false,
    show3dLayerFrame: input.show3dLayerFrame !== false,
    show3dLayerGypsum: input.show3dLayerGypsum !== false,
    show3dLayerWindows: input.show3dLayerWindows !== false,
    show3dLayerDoors: input.show3dLayerDoors !== false,
  };
}
