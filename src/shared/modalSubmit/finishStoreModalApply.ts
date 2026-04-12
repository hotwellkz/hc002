import type { ModalApplyResult } from "./useModalApplyClose";

/**
 * После синхронного вызова действия zustand: если флаг «модалка открыта» всё ещё true — считаем неуспех.
 * - модалка закрыта в store → успех (ничего не делаем, `onSuccessClose` для store-модалок обычно noop);
 * - модалка открыта и есть `lastError` → бросаем (покажется `applyError`);
 * - модалка открыта без текста ошибки → `false` (модалка остаётся без лишнего сообщения).
 */
export function finishStoreModalApply(modalStillOpen: boolean, lastError: string | null): ModalApplyResult {
  if (!modalStillOpen) {
    return;
  }
  if (lastError) {
    throw new Error(lastError);
  }
  return false;
}
