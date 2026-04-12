import type { Point2D } from "../geometry/types";

import type { Project } from "./project";

export type EditorTab = "2d" | "3d" | "spec" | "wall";

/**
 * Подрежим 2D: план этажа, перекрытие (балки и плиты перекрытия) или фундамент (лента, сваи, плита).
 */
export type Editor2dPlanScope = "main" | "floorStructure" | "foundation" | "roof";

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

/** Центр орбиты в мировых мм плана (X,Y); углы и дистанция не трогаются. */
export function viewport3dWithPlanOrbitTargetMm(v: ViewportState3D, planXYMm: Point2D): ViewportState3D {
  return {
    ...v,
    targetXMm: planXYMm.x,
    targetYMm: planXYMm.y,
  };
}

/** Как у нового проекта: 3D-вид ещё не настраивали (для миграции target → projectOrigin). */
export function viewport3dMatchesFreshDefault(v: ViewportState3D): boolean {
  return (
    v.polarAngle === Math.PI / 4 &&
    v.azimuthalAngle === Math.PI / 4 &&
    v.distance === 12_000 &&
    v.targetXMm === 0 &&
    v.targetYMm === 0 &&
    v.targetZMm === 1500
  );
}

/**
 * Старые файлы: база плана задана, а target 3D-орбиты остался (0,0) — при открытии подставляем координаты базы.
 */
export function projectWithViewport3dTargetAlignedToOriginIfDefault(project: Project): Project {
  const o = project.projectOrigin;
  if (o == null || !viewport3dMatchesFreshDefault(project.viewState.viewport3d)) {
    return project;
  }
  const v3 = viewport3dWithPlanOrbitTargetMm(project.viewState.viewport3d, o);
  return {
    ...project,
    viewState: { ...project.viewState, viewport3d: v3 },
  };
}

export interface ViewState {
  readonly activeTab: EditorTab;
  readonly editor2dPlanScope: Editor2dPlanScope;
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
  /** Видимость фоновой сетки пола в 3D (не влияет на 2D-план). */
  readonly show3dGrid: boolean;
  /** Ленточный фундамент в 3D + плиты с `structuralPurpose: foundation`. */
  readonly show3dFoundation: boolean;
  /** Сваи (ж/б и др.) в 3D. */
  readonly show3dPiles: boolean;
  /** Перекрытие в 3D: балки пола + плиты перекрытия (`structuralPurpose: overlap` или без тега). */
  readonly show3dOverlap: boolean;
  /** Утеплитель между балками перекрытия (EPS и др.). */
  readonly show3dFloorInsulation: boolean;
  /** Вся расчётная крыша в 3D (подслои ниже — только если эта опция включена). */
  readonly show3dRoof: boolean;
  readonly show3dRoofMembrane: boolean;
  readonly show3dRoofBattens: boolean;
  readonly show3dRoofCovering: boolean;
  /** Подшивка свесов — заготовка (геометрия позже). */
  readonly show3dRoofSoffit: boolean;
  /**
   * ID слоёв проекта, скрытых только в 3D (панель «Видимость»).
   * Не совпадает с layer.isVisible (2D) и с visibleLayerIds.
   */
  readonly hidden3dProjectLayerIds: readonly string[];
  /**
   * Ключи групп панели «Видимость» (3D), которые свернуты.
   * Отсутствие id в списке = развёрнута; сохраняется в проекте.
   */
  readonly editor3dVisibilityCollapsedKeys: readonly string[];
  /**
   * После первого явного сворачивания/разворачивания в дереве — true.
   * Пока false и список свёрнутых пуст: все группы считаются свернутыми (компактный вид по умолчанию).
   * Когда true и список пуст: ни одна группа не свернута (всё развернуто).
   */
  readonly editor3dVisibilityCollapsePrimed: boolean;
  /** Стропила крыши в 3D (внутри общей видимости крыши). */
  readonly show3dRoofRafters: boolean;
  /** Прогон (обвязка конька) в 3D. */
  readonly show3dRoofPurlins: boolean;
  /** Стойки под прогоном в 3D. */
  readonly show3dRoofPosts: boolean;
  /** Подкосы в 3D. */
  readonly show3dRoofStruts: boolean;
}

/** Нормализация viewState из файла (старые проекты без поля). */
const VALID_TABS: readonly EditorTab[] = ["2d", "3d", "spec", "wall"];

export function normalizeViewState(
  input: Pick<ViewState, "activeTab" | "viewport2d" | "viewport3d"> & {
    readonly editor2dPlanScope?: Editor2dPlanScope;
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
    readonly show3dGrid?: boolean;
    readonly show3dFoundation?: boolean;
    readonly show3dPiles?: boolean;
    readonly show3dOverlap?: boolean;
    readonly show3dFloorInsulation?: boolean;
    readonly show3dRoof?: boolean;
    readonly show3dRoofMembrane?: boolean;
    readonly show3dRoofBattens?: boolean;
    readonly show3dRoofCovering?: boolean;
    readonly show3dRoofSoffit?: boolean;
    readonly hidden3dProjectLayerIds?: readonly string[];
    readonly editor3dVisibilityCollapsedKeys?: readonly string[];
    readonly editor3dVisibilityCollapsePrimed?: boolean;
    readonly show3dRoofRafters?: boolean;
    readonly show3dRoofPurlins?: boolean;
    readonly show3dRoofPosts?: boolean;
    readonly show3dRoofStruts?: boolean;
  },
): ViewState {
  const tab = VALID_TABS.includes(input.activeTab as EditorTab) ? input.activeTab : "2d";
  const rawScope = input.editor2dPlanScope;
  const scope: Editor2dPlanScope =
    rawScope === "floorStructure" || rawScope === "foundation" || rawScope === "roof" ? rawScope : "main";
  const hiddenRaw = input.hidden3dProjectLayerIds;
  const hidden3dProjectLayerIds: string[] = [];
  if (Array.isArray(hiddenRaw)) {
    const seen = new Set<string>();
    for (const x of hiddenRaw) {
      if (typeof x !== "string" || x.length === 0 || seen.has(x)) {
        continue;
      }
      seen.add(x);
      hidden3dProjectLayerIds.push(x);
    }
  }
  const collapsedRaw = input.editor3dVisibilityCollapsedKeys;
  const editor3dVisibilityCollapsedKeys: string[] = [];
  if (Array.isArray(collapsedRaw)) {
    const seenC = new Set<string>();
    for (const x of collapsedRaw) {
      if (typeof x !== "string" || x.length === 0 || seenC.has(x)) {
        continue;
      }
      seenC.add(x);
      editor3dVisibilityCollapsedKeys.push(x);
    }
  }
  return {
    activeTab: tab,
    editor2dPlanScope: scope,
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
    show3dGrid: input.show3dGrid !== false,
    show3dFoundation: input.show3dFoundation !== false,
    show3dPiles: input.show3dPiles !== false,
    show3dOverlap: input.show3dOverlap !== false,
    show3dFloorInsulation: input.show3dFloorInsulation !== false,
    show3dRoof: input.show3dRoof !== false,
    show3dRoofMembrane: input.show3dRoofMembrane !== false,
    show3dRoofBattens: input.show3dRoofBattens !== false,
    show3dRoofCovering: input.show3dRoofCovering !== false,
    show3dRoofSoffit: input.show3dRoofSoffit === true,
    hidden3dProjectLayerIds,
    editor3dVisibilityCollapsedKeys,
    editor3dVisibilityCollapsePrimed: input.editor3dVisibilityCollapsePrimed === true,
    show3dRoofRafters: input.show3dRoofRafters !== false,
    show3dRoofPurlins: input.show3dRoofPurlins !== false,
    show3dRoofPosts: input.show3dRoofPosts !== false,
    show3dRoofStruts: input.show3dRoofStruts !== false,
  };
}
