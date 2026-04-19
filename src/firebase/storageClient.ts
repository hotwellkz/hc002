import { getStorage, type FirebaseStorage } from "firebase/storage";

import { getFirebaseApp } from "./app";
import { isFirebaseConfigured } from "./config";

export function tryGetFirebaseStorage(): FirebaseStorage | null {
  if (!isFirebaseConfigured()) {
    return null;
  }
  try {
    return getStorage(getFirebaseApp());
  } catch {
    return null;
  }
}
