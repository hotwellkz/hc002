import { type Firestore, getFirestore } from "firebase/firestore";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";

import { getFirebaseWebConfig, isFirebaseConfigured } from "./config";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase не сконфигурирован");
  }
  if (!app) {
    const cfg = getFirebaseWebConfig();
    app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

export function tryGetFirestoreDb(): Firestore | null {
  if (!isFirebaseConfigured()) {
    return null;
  }
  try {
    return getFirestoreDb();
  } catch {
    return null;
  }
}
