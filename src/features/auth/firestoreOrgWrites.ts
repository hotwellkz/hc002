import { type Firestore, collection, doc, getDoc, writeBatch } from "firebase/firestore";

import type { Company, CompanyMember, UserProfile } from "@/core/company/orgTypes";
import type { User } from "firebase/auth";

export const DEFAULT_COMPANY_NAME = "Моя компания";

export function resolvedCompanyName(raw: string): string {
  const t = raw.trim();
  return t.length > 0 ? t : DEFAULT_COMPANY_NAME;
}

/**
 * Создаёт Company, UserProfile, CompanyMember (owner) в одной транзакции записи.
 * Пути: users/{uid}, companies/{companyId}, companies/{companyId}/members/{uid}
 */
export async function createCompanyWorkspaceForNewUser(
  db: Firestore,
  user: User,
  displayName: string,
  companyName: string,
): Promise<{ companyId: string }> {
  const uid = user.uid;
  const email = user.email ?? "";
  const now = new Date().toISOString();
  const companyRef = doc(collection(db, "companies"));
  const companyId = companyRef.id;

  const company: Company = {
    id: companyId,
    name: resolvedCompanyName(companyName),
    ownerUserId: uid,
    createdAt: now,
    plan: "beta",
  };

  const member: CompanyMember = {
    id: `${companyId}_${uid}`,
    companyId,
    userId: uid,
    email,
    role: "owner",
    status: "active",
    createdAt: now,
    joinedAt: now,
    displayName: user.displayName?.trim() || undefined,
  };

  const profile: UserProfile = {
    id: uid,
    email,
    name: displayName.trim() || undefined,
    createdAt: now,
    activeCompanyId: companyId,
  };

  const batch = writeBatch(db);
  batch.set(companyRef, company);
  batch.set(doc(db, "users", uid), profile);
  batch.set(doc(db, "companies", companyId, "members", uid), member);
  await batch.commit();
  return { companyId };
}

export async function loadUserProfile(db: Firestore, uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    return null;
  }
  return snap.data() as UserProfile;
}

export async function loadCompany(db: Firestore, companyId: string): Promise<Company | null> {
  const snap = await getDoc(doc(db, "companies", companyId));
  if (!snap.exists()) {
    return null;
  }
  return snap.data() as Company;
}

export async function loadCompanyMember(db: Firestore, companyId: string, userId: string): Promise<CompanyMember | null> {
  const snap = await getDoc(doc(db, "companies", companyId, "members", userId));
  if (!snap.exists()) {
    return null;
  }
  return snap.data() as CompanyMember;
}

/**
 * Для пользователя с профилем без activeCompanyId: создаёт компанию и делает пользователя owner.
 */
export async function createCompanyWorkspaceForExistingUser(
  db: Firestore,
  user: User,
  companyName: string,
): Promise<{ companyId: string }> {
  const uid = user.uid;
  const email = user.email?.trim() ?? "";
  if (!email) {
    throw new Error("У аккаунта нет email — нельзя создать компанию.");
  }
  const profile = await loadUserProfile(db, uid);
  if (!profile) {
    throw new Error("Сначала обновите профиль.");
  }
  if (profile.activeCompanyId) {
    throw new Error("Рабочее пространство уже создано.");
  }
  const now = new Date().toISOString();
  const companyRef = doc(collection(db, "companies"));
  const companyId = companyRef.id;

  const company: Company = {
    id: companyId,
    name: resolvedCompanyName(companyName),
    ownerUserId: uid,
    createdAt: now,
    plan: "beta",
  };

  const member: CompanyMember = {
    id: `${companyId}_${uid}`,
    companyId,
    userId: uid,
    email,
    role: "owner",
    status: "active",
    createdAt: now,
    joinedAt: now,
    displayName: user.displayName?.trim() || profile.name,
  };

  const nextProfile: UserProfile = {
    ...profile,
    activeCompanyId: companyId,
  };

  const batch = writeBatch(db);
  batch.set(companyRef, company);
  batch.set(doc(db, "users", uid), nextProfile);
  batch.set(doc(db, "companies", companyId, "members", uid), member);
  await batch.commit();
  return { companyId };
}

/**
 * Первый вход через Google: если профиля нет — создаём рабочее пространство с именем по умолчанию.
 */
export async function ensureGoogleUserHasWorkspace(db: Firestore, user: User): Promise<void> {
  const existing = await loadUserProfile(db, user.uid);
  if (existing != null) {
    return;
  }
  const nameFromGoogle = user.displayName?.trim() || "";
  await createCompanyWorkspaceForNewUser(db, user, nameFromGoogle, DEFAULT_COMPANY_NAME);
}
