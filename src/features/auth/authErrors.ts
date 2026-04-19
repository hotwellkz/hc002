/** Сообщение для UI: Firebase по коду, иначе текст Error (mock и свои ошибки). */
export function friendlyAuthError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code ?? "");
    if (code === "permission-denied") {
      return "Недостаточно прав для записи в облако. Проверьте правила Firestore или войдите снова.";
    }
    if (code.startsWith("auth/")) {
      return mapAuthErrorToRu(err);
    }
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return mapAuthErrorToRu(err);
}

/**
 * Человекочитаемые сообщения вместо сырых кодов Firebase Auth.
 * TODO: при необходимости расширить под OAuth и кастомные ошибки бэкенда.
 */
export function mapAuthErrorToRu(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code ?? "");
    switch (code) {
      case "auth/email-already-in-use":
        return "Пользователь с таким email уже зарегистрирован.";
      case "auth/invalid-email":
        return "Введите корректный адрес email.";
      case "auth/weak-password":
        return "Пароль слишком слабый. Используйте не менее 6 символов.";
      case "auth/user-disabled":
        return "Аккаунт отключён. Обратитесь в поддержку.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Неверный email или пароль.";
      case "auth/too-many-requests":
        return "Слишком много попыток. Подождите немного и попробуйте снова.";
      case "auth/network-request-failed":
        return "Нет соединения с сервером. Проверьте интернет.";
      case "auth/popup-closed-by-user":
        return "Вход через Google отменён.";
      case "auth/account-exists-with-different-credential":
        return "Этот email уже используется с другим способом входа.";
      default:
        break;
    }
  }
  if (err instanceof Error && err.message) {
    if (err.message.includes("Firebase не сконфигурирован")) {
      return "Сервер авторизации не настроен. Используйте локальный режим или задайте переменные VITE_FIREBASE_*.";
    }
  }
  return "Не удалось выполнить операцию. Попробуйте ещё раз.";
}
