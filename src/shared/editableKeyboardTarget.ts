/**
 * true, если событие клавиатуры пришло из поля ввода / редактируемой области —
 * в этом случае Delete/Backspace не должны трогать сцену.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined") {
    return false;
  }
  if (!(target instanceof Element)) {
    return false;
  }
  const el = target as HTMLElement;
  if (el.isContentEditable) {
    return true;
  }
  if (el.closest("input, textarea, select, [contenteditable='true']")) {
    return true;
  }
  if (el.closest('[role="textbox"]')) {
    return true;
  }
  return false;
}
