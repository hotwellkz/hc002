import { getAuth, type Auth } from "firebase/auth";

import { getFirebaseApp } from "./app";
import { isFirebaseConfigured } from "./config";

export function tryGetFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) {
    return null;
  }
  try {
    return getAuth(getFirebaseApp());
  } catch {
    return null;
  }
}
