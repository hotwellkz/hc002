import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import type { Firestore } from "firebase/firestore";

import type { Company, CompanyMember, UserProfile } from "@/core/company/orgTypes";
import { tryGetFirebaseAuth } from "@/firebase/authClient";
import { tryGetFirestoreDb } from "@/firebase/app";

import {
  createCompanyWorkspaceForNewUser,
  ensureGoogleUserHasWorkspace,
  loadCompany,
  loadCompanyMember,
  loadUserProfile,
} from "./firestoreOrgWrites";

export async function firebaseSignInEmailPassword(email: string, password: string): Promise<User> {
  const auth = tryGetFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Auth недоступен.");
  }
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function firebaseSignUpWithCompany(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<User> {
  const auth = tryGetFirebaseAuth();
  const db = tryGetFirestoreDb() as Firestore | null;
  if (!auth || !db) {
    throw new Error("Firebase недоступен.");
  }
  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  const user = cred.user;
  const display = input.name.trim();
  if (display.length > 0) {
    await updateProfile(user, { displayName: display });
  }
  try {
    await createCompanyWorkspaceForNewUser(db, user, input.name, input.companyName);
  } catch (e) {
    try {
      await user.delete();
    } catch {
      /* ignore */
    }
    throw e;
  }
  return user;
}

export async function firebaseSignOut(): Promise<void> {
  const auth = tryGetFirebaseAuth();
  if (!auth) {
    return;
  }
  await signOut(auth);
}

export function isGoogleSignInAvailable(): boolean {
  return tryGetFirebaseAuth() != null;
}

export async function firebaseSignInWithGoogle(): Promise<User> {
  const auth = tryGetFirebaseAuth();
  const db = tryGetFirestoreDb() as Firestore | null;
  if (!auth || !db) {
    throw new Error("Firebase недоступен.");
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  await ensureGoogleUserHasWorkspace(db, cred.user);
  return cred.user;
}

export async function fetchProfileAndCompanyForUser(user: User): Promise<{
  profile: UserProfile | null;
  company: Company | null;
  activeCompanyMember: CompanyMember | null;
}> {
  const db = tryGetFirestoreDb() as Firestore | null;
  if (!db) {
    return { profile: null, company: null, activeCompanyMember: null };
  }
  const profile = await loadUserProfile(db, user.uid);
  if (!profile?.activeCompanyId) {
    return { profile, company: null, activeCompanyMember: null };
  }
  const cid = profile.activeCompanyId;
  const [company, activeCompanyMember] = await Promise.all([
    loadCompany(db, cid),
    loadCompanyMember(db, cid, user.uid),
  ]);
  return { profile, company, activeCompanyMember };
}
