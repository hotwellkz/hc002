import { tryGetFirestoreDb } from "@/firebase/app";
import { tryGetFirebaseAuth } from "@/firebase/authClient";

import { acceptCompanyInvite } from "@/features/company/companyTeamService";

import {
  firebaseSignInEmailPassword,
  firebaseSignInWithGoogle,
  firebaseSignOut,
  firebaseSignUpInvitedUser,
  firebaseSignUpWithCompany,
  isGoogleSignInAvailable,
} from "./firebaseAuthOperations";
import { createCompanyWorkspaceForExistingUser } from "./firestoreOrgWrites";
import {
  mockGetSession,
  mockSignIn,
  mockSignOut,
  mockSignUpInvitedUser,
  mockSignUpWithCompany,
  mockCreateCompanyForLoggedInUser,
} from "./mockAuthService";

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

/**
 * Регистрация по приглашению: создаёт пользователя без новой компании и
 * сразу же присоединяет его к существующей компании из invite.
 */
export async function signUpAndJoinByInvite(input: {
  name: string;
  email: string;
  password: string;
  companyId: string;
  inviteId: string;
}): Promise<void> {
  const auth = tryGetFirebaseAuth();
  if (auth) {
    const user = await firebaseSignUpInvitedUser({
      name: input.name,
      email: input.email,
      password: input.password,
    });
    await acceptCompanyInvite(input.companyId, input.inviteId, {
      uid: user.uid,
      email: user.email ?? input.email,
      displayName: user.displayName ?? input.name,
    });
    return;
  }
  await mockSignUpInvitedUser({ name: input.name, email: input.email, password: input.password });
  const session = mockGetSession();
  const uid = session?.profile.id;
  const email = session?.profile.email ?? input.email.trim().toLowerCase();
  if (!uid) {
    throw new Error("Не удалось создать сессию приглашённого пользователя.");
  }
  await acceptCompanyInvite(input.companyId, input.inviteId, {
    uid,
    email,
    displayName: input.name,
  });
}

/**
 * Принимает приглашение от уже вошедшего пользователя (для /login?invite=...).
 */
export async function acceptInviteForCurrentSession(input: {
  companyId: string;
  inviteId: string;
}): Promise<void> {
  const auth = tryGetFirebaseAuth();
  if (auth) {
    const u = auth.currentUser;
    if (!u) {
      throw new Error("Сессия не активна.");
    }
    await acceptCompanyInvite(input.companyId, input.inviteId, {
      uid: u.uid,
      email: u.email ?? "",
      displayName: u.displayName ?? "",
    });
    return;
  }
  const session = mockGetSession();
  if (!session) {
    throw new Error("Сначала войдите в аккаунт.");
  }
  await acceptCompanyInvite(input.companyId, input.inviteId, {
    uid: session.profile.id,
    email: session.profile.email,
    displayName: session.profile.name ?? "",
  });
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

export async function createWorkspaceForLoggedInUser(companyName: string): Promise<void> {
  const auth = tryGetFirebaseAuth();
  const db = tryGetFirestoreDb();
  if (auth?.currentUser && db) {
    await createCompanyWorkspaceForExistingUser(db, auth.currentUser, companyName);
    return;
  }
  await mockCreateCompanyForLoggedInUser(companyName);
}
