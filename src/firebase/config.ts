/**
 * Конфигурация Firebase из переменных окружения Vite (VITE_*).
 * Секреты не хранятся в коде — задаются в .env / CI.
 */

export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
}

function readEnv(key: string): string | undefined {
  const v = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export function isFirebaseConfigured(): boolean {
  return (
    !!readEnv("VITE_FIREBASE_API_KEY") &&
    !!readEnv("VITE_FIREBASE_AUTH_DOMAIN") &&
    !!readEnv("VITE_FIREBASE_PROJECT_ID") &&
    !!readEnv("VITE_FIREBASE_STORAGE_BUCKET") &&
    !!readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID") &&
    !!readEnv("VITE_FIREBASE_APP_ID")
  );
}

export function getFirebaseWebConfig(): FirebaseWebConfig {
  const apiKey = readEnv("VITE_FIREBASE_API_KEY");
  const authDomain = readEnv("VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = readEnv("VITE_FIREBASE_PROJECT_ID");
  const storageBucket = readEnv("VITE_FIREBASE_STORAGE_BUCKET");
  const messagingSenderId = readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID");
  const appId = readEnv("VITE_FIREBASE_APP_ID");
  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    throw new Error("Firebase: не заданы переменные VITE_FIREBASE_*");
  }
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}
