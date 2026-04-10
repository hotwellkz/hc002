import { useEffect, useState } from "react";

import type { EditorShortcutActionId } from "@/shared/editorToolShortcuts/editorShortcutActions";
import { EDITOR_SHORTCUT_ACTION_IDS, EDITOR_SHORTCUT_META } from "@/shared/editorToolShortcuts/editorShortcutActions";
import { formatShortcutCodeLabel, formatShortcutCodesList } from "@/shared/editorToolShortcuts/formatShortcutLabel";
import {
  findActionsBoundToCode,
  getResolvedShortcutCodes,
} from "@/shared/editorToolShortcuts/resolveEditorShortcutCodes";
import { useEditorShortcutsStore } from "@/store/useEditorShortcutsStore";

import "./editor-hotkeys-modal.css";

interface EditorHotkeysModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function EditorHotkeysModal({ open, onClose }: EditorHotkeysModalProps) {
  const customCodes = useEditorShortcutsStore((s) => s.customCodes);
  const setCustomShortcutCode = useEditorShortcutsStore((s) => s.setCustomShortcutCode);
  const clearCustomShortcut = useEditorShortcutsStore((s) => s.clearCustomShortcut);
  const resetShortcutsToDefaults = useEditorShortcutsStore((s) => s.resetShortcutsToDefaults);
  const setCaptureActive = useEditorShortcutsStore((s) => s.setShortcutRebindCaptureActive);

  const [capturingFor, setCapturingFor] = useState<EditorShortcutActionId | null>(null);

  useEffect(() => {
    if (!open) {
      setCapturingFor(null);
      setCaptureActive(false);
    }
  }, [open, setCaptureActive]);

  useEffect(() => {
    if (!open || capturingFor == null) {
      return;
    }
    const actionId = capturingFor;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.code === "Escape") {
        setCapturingFor(null);
        setCaptureActive(false);
        return;
      }
      const snap = useEditorShortcutsStore.getState().customCodes;
      const others = findActionsBoundToCode(e.code, snap).filter((id) => id !== actionId);
      if (others.length > 0) {
        const names = others.map((id) => EDITOR_SHORTCUT_META[id].label).join(", ");
        const ok = window.confirm(
          `Клавиша «${formatShortcutCodeLabel(e.code)}» уже назначена: ${names}. Переназначить на «${EDITOR_SHORTCUT_META[actionId].label}»?`,
        );
        if (!ok) {
          return;
        }
        for (const o of others) {
          useEditorShortcutsStore.getState().setCustomShortcutCode(o, null);
        }
      }
      setCustomShortcutCode(actionId, e.code);
      setCapturingFor(null);
      setCaptureActive(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, capturingFor, setCustomShortcutCode, setCaptureActive]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && capturingFor == null) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, capturingFor]);

  if (!open) {
    return null;
  }

  const startCapture = (id: EditorShortcutActionId): void => {
    if (!EDITOR_SHORTCUT_META[id].remappable) {
      return;
    }
    setCapturingFor(id);
    setCaptureActive(true);
  };

  const busy = capturingFor != null;

  return (
    <div
      className="ehm-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="ehm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ehm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="ehm-header">
          <h2 id="ehm-title" className="ehm-title">
            Горячие клавиши
          </h2>
          <button type="button" className="btn ehm-close" onClick={() => onClose()}>
            Закрыть
          </button>
        </header>
        <div className="ehm-body">
          <p className="ehm-intro">
            Сочетания привязаны к физическим клавишам (как на клавиатуре), поэтому работают одинаково при русской и
            английской раскладке. В полях ввода и открытых диалогах они отключены.
          </p>
          {capturingFor != null ? (
            <p className="ehm-capture-hint">
              Нажмите клавишу для «{EDITOR_SHORTCUT_META[capturingFor].label}». Esc — отменить захват.
            </p>
          ) : null}
          <table className="ehm-table">
            <thead>
              <tr>
                <th>Действие</th>
                <th>Клавиша</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {EDITOR_SHORTCUT_ACTION_IDS.map((id) => {
                const meta = EDITOR_SHORTCUT_META[id];
                const codes = getResolvedShortcutCodes(id, customCodes);
                return (
                  <tr key={id}>
                    <td>{meta.label}</td>
                    <td className="ehm-key-cell">{formatShortcutCodesList(codes)}</td>
                    <td className="ehm-actions">
                      {meta.remappable ? (
                        <>
                          <button type="button" className="btn" disabled={busy} onClick={() => startCapture(id)}>
                            Изменить
                          </button>
                          <button type="button" className="btn" disabled={busy} onClick={() => clearCustomShortcut(id)}>
                            По умолчанию
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busy}
                            onClick={() => setCustomShortcutCode(id, null)}
                          >
                            Выключить
                          </button>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="ehm-footer">
          <button type="button" className="btn" onClick={() => resetShortcutsToDefaults()} disabled={busy}>
            Сбросить всё по умолчанию
          </button>
        </footer>
      </div>
    </div>
  );
}
