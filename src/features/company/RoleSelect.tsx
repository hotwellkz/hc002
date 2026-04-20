import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "./roleSelect.css";

export interface RoleOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

/**
 * Тёмный glass-dropdown для выбора роли.
 *
 * Заменяет нативный <select> — тот в dark-теме выглядит инородно (светлые
 * системные option-ы). Даёт одинаковый UX во всех браузерах, корректно
 * отображает русские названия ролей и поддерживает базовую клавиатурную
 * навигацию (Enter/Space — открыть, ArrowUp/Down, Home/End, Esc — закрыть).
 */
export function RoleSelect<V extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
  ariaLabel,
  size = "md",
  align = "start",
}: {
  readonly value: V;
  readonly options: ReadonlyArray<RoleOption<V>>;
  readonly onChange: (next: V) => void;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly size?: "sm" | "md";
  readonly align?: "start" | "end";
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 0 });

  const current = options.find((o) => o.value === value) ?? options[0];

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const a = btn.getBoundingClientRect();
    const minW = Math.max(a.width, 180);
    const h = menu.offsetHeight;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - a.bottom - 8;
    const spaceAbove = a.top - 8;
    const placeAbove = spaceBelow < h && spaceAbove > spaceBelow;
    const top = placeAbove ? Math.max(8, a.top - h - 6) : Math.min(vh - h - 8, a.bottom + 6);
    const left = align === "end"
      ? Math.min(Math.max(8, a.right - minW), vw - minW - 8)
      : Math.min(Math.max(8, a.left), vw - minW - 8);
    setPos({ left, top, width: minW });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition, options.length]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => reposition();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[activeIdx];
    if (el) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
  }, [open, activeIdx]);

  const commit = (v: V) => {
    if (v !== value) {
      onChange(v);
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (delta: number) => {
    setActiveIdx((prev) => {
      const n = options.length;
      if (n === 0) return prev;
      let next = prev;
      for (let i = 0; i < n; i++) {
        next = (next + delta + n) % n;
        if (!options[next]!.disabled) return next;
      }
      return prev;
    });
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const idx = Math.max(0, options.findIndex((o) => o.value === value));
      setActiveIdx(idx);
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(options.findIndex((o) => !o.disabled));
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i]!.disabled) {
          setActiveIdx(i);
          break;
        }
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt && !opt.disabled) {
        commit(opt.value);
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      {label ? <span className="role-select-label">{label}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        className={`role-select-trigger role-select-trigger--${size}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="role-select-trigger-value">{current?.label ?? value}</span>
        <svg className="role-select-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel ?? label ?? "Выбор роли"}
              className="role-select-menu"
              style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
              onKeyDown={onMenuKeyDown}
            >
              {options.map((opt, idx) => {
                const selected = opt.value === value;
                const active = idx === activeIdx;
                const cls = [
                  "role-select-option",
                  selected ? "role-select-option--selected" : null,
                  active ? "role-select-option--active" : null,
                  opt.disabled ? "role-select-option--disabled" : null,
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={opt.value}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cls}
                    disabled={opt.disabled}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => !opt.disabled && commit(opt.value)}
                  >
                    <span className="role-select-option-main">
                      <span className="role-select-option-label">{opt.label}</span>
                      {opt.description ? (
                        <span className="role-select-option-desc">{opt.description}</span>
                      ) : null}
                    </span>
                    {selected ? (
                      <svg className="role-select-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                        <path
                          d="M2 7.5 L6 11 L12 3.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
