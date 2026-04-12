import type { Layer } from "@/core/domain/layer";
import type { LayerDomain } from "@/core/domain/layerDomain";
import { LAYER_DOMAIN_LABELS } from "@/core/domain/layerDomain";
import type { ViewState } from "@/core/domain/viewState";

/** Ключи viewState, которыми управляет панель «Видимость» 3D (кроме hidden3dProjectLayerIds). */
export type View3dVisibilityFlagKey = keyof Pick<
  ViewState,
  | "show3dLayerOsb"
  | "show3dLayerEps"
  | "show3dLayerFrame"
  | "show3dLayerGypsum"
  | "show3dLayerWindows"
  | "show3dLayerDoors"
  | "show3dFoundation"
  | "show3dPiles"
  | "show3dOverlap"
  | "show3dFloorInsulation"
  | "show3dRoof"
  | "show3dRoofMembrane"
  | "show3dRoofBattens"
  | "show3dRoofCovering"
  | "show3dRoofSoffit"
  | "show3dRoofRafters"
  | "show3dRoofPurlins"
  | "show3dRoofPosts"
  | "show3dRoofStruts"
>;

export type VisBinding =
  | { readonly kind: "flag"; readonly key: View3dVisibilityFlagKey }
  | { readonly kind: "layer"; readonly layerId: string };

export type VisTriState = "checked" | "unchecked" | "indeterminate";

export type VisLeafNode = {
  readonly id: string;
  readonly type: "item";
  readonly title: string;
  readonly binding: VisBinding;
  /** Нельзя переключить (нет геометрии и т.п.). */
  readonly disabled?: boolean;
  readonly titleTooltip?: string;
  /** Не участвует в расчёте состояния родителя (заглушки). */
  readonly excludeFromParentAggregate?: boolean;
};

export type VisGroupNode = {
  readonly id: string;
  readonly type: "group";
  readonly title: string;
  readonly children: readonly VisNode[];
};

export type VisNode = VisGroupNode | VisLeafNode;

/** Все id групп в дереве (рекурсивно), для состояния свёрнутости. */
export function collectAllGroupIds(roots: readonly VisGroupNode[]): string[] {
  const out: string[] = [];
  const walk = (node: VisGroupNode): void => {
    out.push(node.id);
    for (const ch of node.children) {
      if (ch.type === "group") {
        walk(ch);
      }
    }
  };
  for (const r of roots) {
    walk(r);
  }
  return out;
}

/**
 * Какие группы считаются свернутыми: id присутствует в множестве → группа свернута.
 * Пока `collapsePrimed === false` и в проекте пустой список — все группы дерева считаются свернутыми (компактный вид).
 * После первого переключения `primed === true`; пустой список тогда означает «всё развернуто».
 */
export function resolveEditor3dVisibilityCollapsedKeySet(
  collapsePrimed: boolean,
  storedCollapsedKeys: readonly string[],
  allGroupIdsInTree: readonly string[],
): Set<string> {
  if (!collapsePrimed && storedCollapsedKeys.length === 0) {
    return new Set(allGroupIdsInTree);
  }
  return new Set(storedCollapsedKeys);
}

export function flagValueOn(vs: ViewState, key: View3dVisibilityFlagKey): boolean {
  if (key === "show3dRoofSoffit") {
    return vs.show3dRoofSoffit === true;
  }
  return vs[key] !== false;
}

export function layerVisibleIn3d(hiddenLayerIds: readonly string[], layerId: string): boolean {
  return !hiddenLayerIds.includes(layerId);
}

function childParticipatesInParentAggregate(c: VisNode): boolean {
  if (c.type === "group") {
    return true;
  }
  return !c.excludeFromParentAggregate;
}

/** Состояние чекбокса узла с учётом детей. */
export function computeNodeTriState(vs: ViewState, hiddenLayerIds: readonly string[], node: VisNode): VisTriState {
  if (node.type === "item") {
    if (node.binding.kind === "flag") {
      return flagValueOn(vs, node.binding.key) ? "checked" : "unchecked";
    }
    return layerVisibleIn3d(hiddenLayerIds, node.binding.layerId) ? "checked" : "unchecked";
  }
  const active = node.children.filter(childParticipatesInParentAggregate);
  if (active.length === 0) {
    return "checked";
  }
  const states = active.map((c) => computeNodeTriState(vs, hiddenLayerIds, c));
  const allChecked = states.every((s) => s === "checked");
  const allOff = states.every((s) => s === "unchecked");
  if (allChecked) {
    return "checked";
  }
  if (allOff) {
    return "unchecked";
  }
  return "indeterminate";
}

function collectBindings(node: VisNode, out: VisBinding[]): void {
  if (node.type === "item") {
    out.push(node.binding);
    return;
  }
  for (const c of node.children) {
    collectBindings(c, out);
  }
}

/** Патч viewState для включения/выключения всех привязок под деревом группы. */
export function buildVisibilityPatchForSubtree(root: VisGroupNode, vs: ViewState, on: boolean): Partial<ViewState> {
  const bindings: VisBinding[] = [];
  collectBindings(root, bindings);
  const hiddenSet = new Set(vs.hidden3dProjectLayerIds);
  for (const b of bindings) {
    if (b.kind === "layer") {
      if (on) {
        hiddenSet.delete(b.layerId);
      } else {
        hiddenSet.add(b.layerId);
      }
    }
  }
  const patch: Partial<ViewState> = { hidden3dProjectLayerIds: [...hiddenSet] };
  for (const b of bindings) {
    if (b.kind === "flag") {
      (patch as Record<string, boolean>)[b.key] = on;
    }
  }
  return patch;
}

export function buildLeafPatch(binding: VisBinding, vs: ViewState, on: boolean): Partial<ViewState> {
  if (binding.kind === "layer") {
    const hiddenSet = new Set(vs.hidden3dProjectLayerIds);
    if (on) {
      hiddenSet.delete(binding.layerId);
    } else {
      hiddenSet.add(binding.layerId);
    }
    return { hidden3dProjectLayerIds: [...hiddenSet] };
  }
  return { [binding.key]: on } as Partial<ViewState>;
}

const LAYER_DOMAIN_ORDER: readonly LayerDomain[] = ["floorPlan", "slab", "foundation", "roof"];

export function groupLayersByDomain(layers: readonly Layer[]): ReadonlyMap<LayerDomain, Layer[]> {
  const m = new Map<LayerDomain, Layer[]>();
  for (const d of LAYER_DOMAIN_ORDER) {
    m.set(d, []);
  }
  for (const layer of layers) {
    const list = m.get(layer.domain);
    if (list) {
      list.push(layer);
    }
  }
  return m;
}

export type Editor3dVisibilityTreeContext = {
  readonly windowsReady: boolean;
  readonly doorsReady: boolean;
  readonly hasRoofAssembly3d: boolean;
};

function withRoofAssemblyGate(leaf: VisLeafNode, hasRoof: boolean): VisLeafNode {
  if (!hasRoof && leaf.binding.kind === "flag") {
    const k = leaf.binding.key;
    if (
      k === "show3dRoof" ||
      k === "show3dRoofCovering" ||
      k === "show3dRoofBattens" ||
      k === "show3dRoofMembrane" ||
      k === "show3dRoofRafters" ||
      k === "show3dRoofPurlins" ||
      k === "show3dRoofPosts" ||
      k === "show3dRoofStruts"
    ) {
      return { ...leaf, disabled: true, titleTooltip: "Сначала выполните расчёт крыши" };
    }
  }
  return leaf;
}

export function buildEditor3dVisibilityTree(
  layersSorted: readonly Layer[],
  ctx: Editor3dVisibilityTreeContext,
): VisGroupNode[] {
  const byDomain = groupLayersByDomain(layersSorted);
  const layerChildren: VisNode[] = [];
  for (const domain of LAYER_DOMAIN_ORDER) {
    const list = byDomain.get(domain);
    if (!list || list.length === 0) {
      continue;
    }
    const domainLeaves: VisLeafNode[] = list.map((layer) => ({
      id: `layer:${layer.id}`,
      type: "item",
      title: layer.name,
      binding: { kind: "layer", layerId: layer.id },
    }));
    layerChildren.push({
      id: `grp:layers:${domain}`,
      type: "group",
      title: LAYER_DOMAIN_LABELS[domain],
      children: domainLeaves,
    });
  }

  const matChildren: VisLeafNode[] = [
    {
      id: "leaf:osb",
      type: "item",
      title: "OSB",
      binding: { kind: "flag", key: "show3dLayerOsb" },
    },
    {
      id: "leaf:eps",
      type: "item",
      title: "Пенополистирол",
      binding: { kind: "flag", key: "show3dLayerEps" },
    },
    {
      id: "leaf:frame",
      type: "item",
      title: "Каркас",
      binding: { kind: "flag", key: "show3dLayerFrame" },
    },
    {
      id: "leaf:gypsum",
      type: "item",
      title: "Гипсокартон",
      binding: { kind: "flag", key: "show3dLayerGypsum" },
    },
    {
      id: "leaf:windows",
      type: "item",
      title: "Окна",
      binding: { kind: "flag", key: "show3dLayerWindows" },
      disabled: !ctx.windowsReady,
      titleTooltip: !ctx.windowsReady ? "Скоро" : undefined,
    },
    {
      id: "leaf:doors",
      type: "item",
      title: "Двери",
      binding: { kind: "flag", key: "show3dLayerDoors" },
      disabled: !ctx.doorsReady,
      titleTooltip: !ctx.doorsReady ? "Скоро" : undefined,
    },
  ];

  const roofChildrenRaw: VisLeafNode[] = [
    {
      id: "leaf:roof",
      type: "item",
      title: "Крыша целиком",
      binding: { kind: "flag", key: "show3dRoof" },
    },
    {
      id: "leaf:roofCover",
      type: "item",
      title: "Покрытие крыши",
      binding: { kind: "flag", key: "show3dRoofCovering" },
    },
    {
      id: "leaf:roofBatten",
      type: "item",
      title: "Обрешётка",
      binding: { kind: "flag", key: "show3dRoofBattens" },
    },
    {
      id: "leaf:roofMem",
      type: "item",
      title: "Мембрана / ветрозащита",
      binding: { kind: "flag", key: "show3dRoofMembrane" },
    },
    {
      id: "leaf:roofSoffit",
      type: "item",
      title: "Подшивка свесов",
      binding: { kind: "flag", key: "show3dRoofSoffit" },
      disabled: true,
      titleTooltip: "Геометрия будет добавлена позже",
      excludeFromParentAggregate: true,
    },
    {
      id: "leaf:roofRafters",
      type: "item",
      title: "Стропила",
      binding: { kind: "flag", key: "show3dRoofRafters" },
    },
    {
      id: "leaf:roofPurlin",
      type: "item",
      title: "Прогон",
      binding: { kind: "flag", key: "show3dRoofPurlins" },
    },
    {
      id: "leaf:roofPosts",
      type: "item",
      title: "Стойки",
      binding: { kind: "flag", key: "show3dRoofPosts" },
    },
    {
      id: "leaf:roofStruts",
      type: "item",
      title: "Подкосы",
      binding: { kind: "flag", key: "show3dRoofStruts" },
    },
  ];
  const roofChildren = roofChildrenRaw.map((l) => withRoofAssemblyGate(l, ctx.hasRoofAssembly3d));

  const roots: VisGroupNode[] = [
    {
      id: "grp:layers",
      type: "group",
      title: "Слои проекта",
      children: layerChildren,
    },
    {
      id: "grp:materials",
      type: "group",
      title: "Материалы и элементы",
      children: matChildren,
    },
    {
      id: "grp:struct",
      type: "group",
      title: "Фундамент и перекрытие",
      children: [
        {
          id: "leaf:foundation",
          type: "item",
          title: "Фундамент",
          binding: { kind: "flag", key: "show3dFoundation" },
        },
        {
          id: "leaf:piles",
          type: "item",
          title: "Сваи",
          binding: { kind: "flag", key: "show3dPiles" },
        },
        {
          id: "leaf:overlap",
          type: "item",
          title: "Перекрытие",
          binding: { kind: "flag", key: "show3dOverlap" },
        },
        {
          id: "leaf:floorIns",
          type: "item",
          title: "Утеплитель перекрытия (EPS)",
          binding: { kind: "flag", key: "show3dFloorInsulation" },
        },
      ],
    },
    {
      id: "grp:roof",
      type: "group",
      title: "Крыша",
      children: roofChildren,
    },
  ];

  return roots;
}

/** Все флаги панели — для «показать всё» / «скрыть всё». */
export const VIEW3D_VISIBILITY_FLAG_KEYS: readonly View3dVisibilityFlagKey[] = [
  "show3dLayerOsb",
  "show3dLayerEps",
  "show3dLayerFrame",
  "show3dLayerGypsum",
  "show3dLayerWindows",
  "show3dLayerDoors",
  "show3dFoundation",
  "show3dPiles",
  "show3dOverlap",
  "show3dFloorInsulation",
  "show3dRoof",
  "show3dRoofMembrane",
  "show3dRoofBattens",
  "show3dRoofCovering",
  "show3dRoofSoffit",
  "show3dRoofRafters",
  "show3dRoofPurlins",
  "show3dRoofPosts",
  "show3dRoofStruts",
];

export function viewStateAll3dVisibilityOn(): Partial<ViewState> {
  const patch: Partial<ViewState> = {};
  for (const key of VIEW3D_VISIBILITY_FLAG_KEYS) {
    (patch as Record<string, boolean>)[key] = true;
  }
  return patch;
}

export function viewStateAll3dVisibilityOff(): Partial<ViewState> {
  const patch: Partial<ViewState> = {};
  for (const key of VIEW3D_VISIBILITY_FLAG_KEYS) {
    (patch as Record<string, boolean>)[key] = false;
  }
  return patch;
}
