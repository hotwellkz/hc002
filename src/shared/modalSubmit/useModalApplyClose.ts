import { useCallback, useRef, useState } from "react";

/**
 * Результат действия «Применить»:
 * - `true` или `undefined` — успех, можно закрыть модалку;
 * - `false` — отмена (валидация, бизнес-правило), модалка остаётся;
 * - `throw` — неожиданная ошибка, модалка остаётся, текст можно показать через applyError.
 */
export type ModalApplyResult = boolean | void;

/**
 * Единый паттерн: успешное применение → вызов onSuccessClose(); ошибка → окно открыто.
 * Защита от повторного submit, опционально состояние «идёт сохранение» для UI.
 */
export function useModalApplyClose(onSuccessClose: () => void) {
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const clearApplyError = useCallback(() => setApplyError(null), []);

  const runApply = useCallback(
    async (fn: () => ModalApplyResult | Promise<ModalApplyResult>) => {
      if (submittingRef.current) {
        return;
      }
      submittingRef.current = true;
      setApplyError(null);
      setIsSubmitting(true);
      try {
        const result = await fn();
        if (result === false) {
          return;
        }
        onSuccessClose();
      } catch (e) {
        setApplyError(e instanceof Error ? e.message : String(e));
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [onSuccessClose],
  );

  return {
    runApply,
    isSubmitting,
    applyError,
    clearApplyError,
  };
}

/** Пустой колбэк для `useModalApplyClose`, когда закрытие делает только zustand (без двойного close). */
export function storeModalApplyNoop(): void {}
