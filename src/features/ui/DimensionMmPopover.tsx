import { useEffect, useId, useRef } from "react";

import "./dimension-mm-popover.css";

export interface DimensionMmPopoverProps {
  readonly open: boolean;
  readonly leftPx: number;
  readonly topPx: number;
  readonly valueStr: string;
  readonly error: string | null;
  readonly onChange: (next: string) => void;
  readonly onApply: () => void;
  readonly onCancel: () => void;
}

/**
 * Компактный редактор размера в мм (popover): число, Применить/Отмена, Enter/Esc.
 */
export function DimensionMmPopover(props: DimensionMmPopoverProps): JSX.Element | null {
  const { open, leftPx, topPx, valueStr, error, onChange, onApply, onCancel } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    if (!open) {
      return;
    }
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onApply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onApply, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="dim-mm-popover"
      style={{ left: leftPx, top: topPx }}
      role="dialog"
      aria-labelledby={`${uid}-title`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div id={`${uid}-title`} className="dim-mm-popover__title">
        Размер, мм
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="dim-mm-popover__input"
        value={valueStr}
        aria-invalid={error != null}
        aria-describedby={error ? `${uid}-err` : undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      {error ? (
        <div id={`${uid}-err`} className="dim-mm-popover__err">
          {error}
        </div>
      ) : null}
      <div className="dim-mm-popover__actions">
        <button type="button" className="dim-mm-popover__btn dim-mm-popover__btn--primary" onClick={onApply}>
          Применить
        </button>
        <button type="button" className="dim-mm-popover__btn" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
