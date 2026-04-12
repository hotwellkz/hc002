import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";

import type { ViewState } from "@/core/domain/viewState";
import { LucideToolIcon } from "@/shared/ui/LucideToolIcon";

import {
  buildLeafPatch,
  buildVisibilityPatchForSubtree,
  computeNodeTriState,
  type VisGroupNode,
  type VisLeafNode,
  type VisNode,
  type VisTriState,
} from "./editor3dVisibilityTreeModel";

export type Editor3dVisibilityTreeProps = {
  readonly idBase: string;
  readonly roots: readonly VisGroupNode[];
  readonly vs: ViewState;
  readonly hiddenLayerIds: readonly string[];
  readonly collapsedKeys: ReadonlySet<string>;
  readonly onToggleCollapsed: (groupId: string) => void;
  readonly onApplyPatch: (patch: Partial<ViewState>) => void;
};

function triToChecked(t: VisTriState): boolean {
  return t === "checked";
}

function VisCheckbox({
  id,
  tri,
  disabled,
  onCommit,
}: {
  readonly id: string;
  readonly tri: VisTriState;
  readonly disabled?: boolean;
  readonly onCommit: (next: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.indeterminate = tri === "indeterminate";
  }, [tri]);

  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      disabled={disabled}
      checked={triToChecked(tri)}
      onChange={(e) => {
        const next = e.target.checked;
        if (tri === "indeterminate") {
          onCommit(true);
        } else {
          onCommit(next);
        }
      }}
    />
  );
}

function TreeLeafRow({
  idBase,
  depth,
  leaf,
  vs,
  hiddenLayerIds,
  onApplyPatch,
}: {
  readonly idBase: string;
  readonly depth: number;
  readonly leaf: VisLeafNode;
  readonly vs: ViewState;
  readonly hiddenLayerIds: readonly string[];
  readonly onApplyPatch: (patch: Partial<ViewState>) => void;
}) {
  const tri = computeNodeTriState(vs, hiddenLayerIds, leaf);
  const inputId = `${idBase}-${leaf.id}`;
  const disabled = leaf.disabled === true;

  return (
    <div
      className={`ed3-vis-tree-row ed3-vis-tree-row--leaf${disabled ? " ed3-vis-tree-row--disabled" : ""}`}
      style={{ "--ed3-vis-depth": depth } as CSSProperties}
      title={leaf.titleTooltip}
    >
      <span className="ed3-vis-tree-spacer" aria-hidden />
      <VisCheckbox
        id={inputId}
        tri={tri}
        disabled={disabled}
        onCommit={(next) => {
          if (disabled) {
            return;
          }
          onApplyPatch(buildLeafPatch(leaf.binding, vs, next));
        }}
      />
      <label className="ed3-vis-tree-label" htmlFor={inputId}>
        {leaf.title}
      </label>
    </div>
  );
}

function TreeGroup({
  idBase,
  depth,
  node,
  vs,
  hiddenLayerIds,
  collapsedKeys,
  onToggleCollapsed,
  onApplyPatch,
}: {
  readonly idBase: string;
  readonly depth: number;
  readonly node: VisGroupNode;
  readonly vs: ViewState;
  readonly hiddenLayerIds: readonly string[];
  readonly collapsedKeys: ReadonlySet<string>;
  readonly onToggleCollapsed: (groupId: string) => void;
  readonly onApplyPatch: (patch: Partial<ViewState>) => void;
}) {
  const expanded = !collapsedKeys.has(node.id);
  const tri = computeNodeTriState(vs, hiddenLayerIds, node);
  const inputId = `${idBase}-g-${node.id}`;

  return (
    <div className="ed3-vis-tree-branch">
      <div
        className="ed3-vis-tree-row ed3-vis-tree-row--group"
        style={{ "--ed3-vis-depth": depth } as CSSProperties}
      >
        <button
          type="button"
          className="ed3-vis-tree-toggle"
          aria-expanded={expanded}
          aria-controls={`${idBase}-sub-${node.id}`}
          onClick={() => onToggleCollapsed(node.id)}
        >
          <LucideToolIcon
            icon={ChevronRight}
            className={`ed3-vis-tree-chevron${expanded ? " ed3-vis-tree-chevron--open" : ""}`}
          />
        </button>
        <VisCheckbox
          id={inputId}
          tri={tri}
          onCommit={(next) => {
            onApplyPatch(buildVisibilityPatchForSubtree(node, vs, next));
          }}
        />
        <label className="ed3-vis-tree-label ed3-vis-tree-label--group" htmlFor={inputId}>
          {node.title}
        </label>
      </div>
      {expanded ? (
        <div id={`${idBase}-sub-${node.id}`} className="ed3-vis-tree-children">
          {node.children.map((ch) => (
            <TreeNode
              key={ch.id}
              idBase={idBase}
              depth={depth + 1}
              node={ch}
              vs={vs}
              hiddenLayerIds={hiddenLayerIds}
              collapsedKeys={collapsedKeys}
              onToggleCollapsed={onToggleCollapsed}
              onApplyPatch={onApplyPatch}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TreeNode(props: {
  readonly idBase: string;
  readonly depth: number;
  readonly node: VisNode;
  readonly vs: ViewState;
  readonly hiddenLayerIds: readonly string[];
  readonly collapsedKeys: ReadonlySet<string>;
  readonly onToggleCollapsed: (groupId: string) => void;
  readonly onApplyPatch: (patch: Partial<ViewState>) => void;
}) {
  const { idBase, depth, node, vs, hiddenLayerIds, collapsedKeys, onToggleCollapsed, onApplyPatch } = props;
  if (node.type === "group") {
    return (
      <TreeGroup
        idBase={idBase}
        depth={depth}
        node={node}
        vs={vs}
        hiddenLayerIds={hiddenLayerIds}
        collapsedKeys={collapsedKeys}
        onToggleCollapsed={onToggleCollapsed}
        onApplyPatch={onApplyPatch}
      />
    );
  }
  return (
    <TreeLeafRow
      idBase={idBase}
      depth={depth}
      leaf={node}
      vs={vs}
      hiddenLayerIds={hiddenLayerIds}
      onApplyPatch={onApplyPatch}
    />
  );
}

export function Editor3dVisibilityTree({
  idBase,
  roots,
  vs,
  hiddenLayerIds,
  collapsedKeys,
  onToggleCollapsed,
  onApplyPatch,
}: Editor3dVisibilityTreeProps) {
  return (
    <div className="ed3-vis-tree" role="tree">
      {roots.map((r) => (
        <TreeNode
          key={r.id}
          idBase={idBase}
          depth={0}
          node={r}
          vs={vs}
          hiddenLayerIds={hiddenLayerIds}
          collapsedKeys={collapsedKeys}
          onToggleCollapsed={onToggleCollapsed}
          onApplyPatch={onApplyPatch}
        />
      ))}
    </div>
  );
}
