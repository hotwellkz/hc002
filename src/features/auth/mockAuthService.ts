/**
 * Локальная имитация Auth + профиля без Firebase (для разработки и офлайн).
 * НЕ для production: пароли хранятся в localStorage в открытом виде.
 * TODO: удалить или защитить, когда везде используется Firebase.
 */

import type { Company, CompanyMember, UserProfile } from "@/core/company/orgTypes";

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

export function mockGetSession(): { profile: UserProfile; company: Company | null } | null {
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
  // Промежуточное состояние: пользователь зарегистрирован по приглашению,
  // но accept ещё не выставил активную компанию.
  if (!rec.profile.activeCompanyId || !rec.company.id) {
    return { profile: rec.profile, company: null };
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
  try {
    localStorage.setItem(`hk_mock_company_${companyId}`, JSON.stringify(company));
    const ownerMember: CompanyMember = {
      id: `${companyId}_${uid}`,
      companyId,
      userId: uid,
      email,
      role: "owner",
      status: "active",
      createdAt: now,
      joinedAt: now,
      displayName: profile.name,
    };
    localStorage.setItem(`housekit.mock.team.v1.${companyId}`, JSON.stringify({ members: [ownerMember], invites: [] }));
  } catch {
    /* ignore quota */
  }
  sessionStorage.setItem("hk_mock_session_uid", email);
  emit();
}

/**
 * Регистрация без создания компании — для приглашённых пользователей.
 * Компанию подключит mockJoinInvitedCompany через acceptCompanyInvite.
 */
export async function mockSignUpInvitedUser(input: {
  name: string;
  email: string;
  password: string;
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
    // Не создаём заново — просто переходим в режим логина для существующего пользователя.
    sessionStorage.setItem("hk_mock_session_uid", email);
    emit();
    return;
  }
  const uid = crypto.randomUUID();
  const now = new Date().toISOString();
  const profile: UserProfile = {
    id: uid,
    email,
    name: input.name.trim() || undefined,
    createdAt: now,
  };
  // У приглашённого пользователя компании ещё нет — заполним заглушку, accept выставит активную.
  const placeholderCompany: Company = {
    id: "",
    name: "",
    ownerUserId: uid,
    createdAt: now,
    plan: "beta",
  };
  store.users[email] = {
    password: input.password,
    profile,
    company: placeholderCompany,
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

/** Пользователь уже в сессии, но без activeCompanyId (редкий случай). */
export async function mockCreateCompanyForLoggedInUser(companyName: string): Promise<void> {
  const raw = sessionStorage.getItem("hk_mock_session_uid");
  if (!raw) {
    throw new Error("Сначала войдите в аккаунт.");
  }
  const store = readStore();
  const rec = store.users[raw];
  if (!rec) {
    throw new Error("Сессия недействительна.");
  }
  if (rec.profile.activeCompanyId) {
    throw new Error("Рабочее пространство уже создано.");
  }
  const uid = rec.profile.id;
  const email = rec.profile.email;
  const now = new Date().toISOString();
  const companyId = crypto.randomUUID();
  const company: Company = {
    id: companyId,
    name: resolvedCompanyName(companyName),
    ownerUserId: uid,
    createdAt: now,
    plan: "beta",
  };
  const profile: UserProfile = {
    ...rec.profile,
    activeCompanyId: companyId,
  };
  store.users[raw] = {
    ...rec,
    profile,
    company,
  };
  writeStore(store);
  try {
    localStorage.setItem(`hk_mock_company_${companyId}`, JSON.stringify(company));
    const ownerMember: CompanyMember = {
      id: `${companyId}_${uid}`,
      companyId,
      userId: uid,
      email,
      role: "owner",
      status: "active",
      createdAt: now,
      joinedAt: now,
      displayName: profile.name,
    };
    localStorage.setItem(`housekit.mock.team.v1.${companyId}`, JSON.stringify({ members: [ownerMember], invites: [] }));
  } catch {
    /* ignore */
  }
  emit();
}

export function mockDefaultCompanyNameForRegister(): string {
  return DEFAULT_COMPANY_NAME;
}

/** Синхронизировано с companyTeamService mock-хранилищем `housekit.mock.team.v1.{companyId}`. */
export function mockJoinInvitedCompany(userEmail: string, companyId: string): void {
  const key = userEmail.trim().toLowerCase();
  const companyRaw = localStorage.getItem(`hk_mock_company_${companyId}`);
  if (!companyRaw) {
    throw new Error("Компания не найдена (mock). Пересоздайте приглашение.");
  }
  const company = JSON.parse(companyRaw) as Company;
  const store = readStore();
  const rec = store.users[key];
  if (!rec) {
    throw new Error("Пользователь не найден в mock-хранилище.");
  }
  store.users[key] = {
    ...rec,
    profile: { ...rec.profile, activeCompanyId: companyId },
    company,
  };
  writeStore(store);
  sessionStorage.setItem("hk_mock_session_uid", key);
  emit();
}

export function mockGetActiveCompanyMember(profile: UserProfile, company: Company): CompanyMember {
  if (profile.activeCompanyId !== company.id) {
    throw new Error("mockGetActiveCompanyMember: компания не совпадает с профилем.");
  }
  const raw = localStorage.getItem(`housekit.mock.team.v1.${company.id}`);
  if (raw) {
    try {
      const p = JSON.parse(raw) as { members?: CompanyMember[] };
      const m = p.members?.find((x) => x.userId === profile.id);
      if (m) {
        return m;
      }
    } catch {
      /* ignore */
    }
  }
  const now = profile.createdAt;
  return {
    id: `${company.id}_${profile.id}`,
    companyId: company.id,
    userId: profile.id,
    email: profile.email,
    role: company.ownerUserId === profile.id ? "owner" : "designer",
    status: "active",
    createdAt: now,
    joinedAt: now,
    displayName: profile.name,
  };
}
