import { tryGetFirebaseAuth } from "@/firebase/authClient";

import {
  firebaseSignInEmailPassword,
  firebaseSignInWithGoogle,
  firebaseSignOut,
  firebaseSignUpWithCompany,
  isGoogleSignInAvailable,
} from "./firebaseAuthOperations";
import { mockSignIn, mockSignOut, mockSignUpWithCompany } from "./mockAuthService";

export function getAuthMode(): "firebase" | "mock" {
  return tryGetFirebaseAuth() != null ? "firebase" : "mock";
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  if (tryGetFirebaseAuth()) {
    await firebaseSignInEmailPassword(email, password);
    return;
  }
  await mockSignIn(email, password);
}

export async function signUpWithCompany(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<void> {
  if (tryGetFirebaseAuth()) {
    await firebaseSignUpWithCompany(input);
    return;
  }
  await mockSignUpWithCompany(input);
}

export async function signOutEverywhere(): Promise<void> {
  if (tryGetFirebaseAuth()) {
    await firebaseSignOut();
    return;
  }
  await mockSignOut();
}

export function googleSignInSupported(): boolean {
  return isGoogleSignInAvailable();
}

export async function signInWithGoogle(): Promise<void> {
  await firebaseSignInWithGoogle();
}
