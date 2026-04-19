/**
 * Локальная имитация Auth + профиля без Firebase (для разработки и офлайн).
 * НЕ для production: пароли хранятся в localStorage в открытом виде.
 * TODO: удалить или защитить, когда везде используется Firebase.
 */

import type { Company, UserProfile } from "@/core/company/orgTypes";

import { DEFAULT_COMPANY_NAME, resolvedCompanyName } from "./firestoreOrgWrites";

const STORAGE_KEY = "hk_mock_auth_v1";

type MockRecord = {
  readonly password: string;
  readonly profile: UserProfile;
  readonly company: Company;
};

type MockStore = {
  readonly users: Record<string, MockRecord>;
};

function readStore(): MockStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { users: {} };
    }
    const p = JSON.parse(raw) as MockStore;
    return p && typeof p === "object" && p.users && typeof p.users === "object" ? p : { users: {} };
  } catch {
    return { users: {} };
  }
}

function writeStore(s: MockStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const listeners = new Set<() => void>();

export function subscribeMockAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  listeners.forEach((l) => l());
}

export function mockGetSession(): { profile: UserProfile; company: Company } | null {
  const raw = sessionStorage.getItem("hk_mock_session_uid");
  if (!raw) {
    return null;
  }
  const store = readStore();
  const rec = store.users[raw];
  if (!rec) {
    sessionStorage.removeItem("hk_mock_session_uid");
    return null;
  }
  return { profile: rec.profile, company: rec.company };
}

export async function mockSignUpWithCompany(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    throw new Error("Заполните email и пароль.");
  }
  if (input.password.length < 6) {
    throw new Error("Пароль слишком слабый. Используйте не менее 6 символов.");
  }
  const store = readStore();
  if (store.users[email]) {
    throw new Error("Пользователь с таким email уже зарегистрирован.");
  }
  const uid = crypto.randomUUID();
  const now = new Date().toISOString();
  const companyId = crypto.randomUUID();
  const company: Company = {
    id: companyId,
    name: resolvedCompanyName(input.companyName),
    ownerUserId: uid,
    createdAt: now,
    plan: "beta",
  };
  const profile: UserProfile = {
    id: uid,
    email,
    name: input.name.trim() || undefined,
    createdAt: now,
    activeCompanyId: companyId,
  };
  store.users[email] = {
    password: input.password,
    profile: { ...profile, id: uid },
    company,
  };
  writeStore(store);
  sessionStorage.setItem("hk_mock_session_uid", email);
  emit();
}

export async function mockSignIn(email: string, password: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const store = readStore();
  const rec = store.users[key];
  if (!rec || rec.password !== password) {
    throw new Error("Неверный email или пароль.");
  }
  sessionStorage.setItem("hk_mock_session_uid", key);
  emit();
}

export async function mockSignOut(): Promise<void> {
  sessionStorage.removeItem("hk_mock_session_uid");
  emit();
}

export function mockDefaultCompanyNameForRegister(): string {
  return DEFAULT_COMPANY_NAME;
}
