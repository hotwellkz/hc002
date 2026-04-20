/**
 * Команда компании и приглашения: Firestore + mock (localStorage).
 */

import {
  type Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import type { CompanyInvite, CompanyMember } from "@/core/company/orgTypes";
import { newEntityId } from "@/core/domain/ids";
import { tryGetFirestoreDb } from "@/firebase/app";

import { mockJoinInvitedCompany } from "@/features/auth/mockAuthService";

export type AcceptInviteUserContext = {
  readonly uid: string;
  readonly email: string;
  readonly displayName?: string | null;
};

const MOCK_TEAM_PREFIX = "housekit.mock.team.v1.";

function useFirebase(): boolean {
  return tryGetFirestoreDb() != null;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canManageTeam(role: CompanyMember["role"] | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canInviteEmployees(role: CompanyMember["role"] | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canEditCloudProjects(role: CompanyMember["role"] | undefined): boolean {
  return role === "owner" || role === "admin" || role === "designer";
}

/**
 * Кодирует пару (companyId, inviteId) в один url-safe токен.
 * Используется для коротких приглашений вида /register?invite=<token>.
 */
export function encodeInviteToken(companyId: string, inviteId: string): string {
  const raw = `${companyId}:${inviteId}`;
  if (typeof btoa === "function") {
    return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(raw, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeInviteToken(token: string): { readonly companyId: string; readonly inviteId: string } | null {
  if (!token) {
    return null;
  }
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (token.length % 4)) % 4);
    const decoded =
      typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf-8");
    const idx = decoded.indexOf(":");
    if (idx <= 0 || idx === decoded.length - 1) {
      return null;
    }
    return { companyId: decoded.slice(0, idx), inviteId: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

export function buildInviteRegistrationUrl(origin: string, companyId: string, inviteId: string): string {
  const token = encodeInviteToken(companyId, inviteId);
  return `${origin}/register?invite=${token}`;
}

export function inviteRoleAllowedForActor(
  actorRole: CompanyMember["role"],
  targetRole: CompanyInvite["role"],
): boolean {
  if (actorRole === "owner") {
    return true;
  }
  if (actorRole === "admin") {
    return targetRole === "designer" || targetRole === "viewer";
  }
  return false;
}

// ——— Mock ———

type MockTeamBucket = {
  readonly members: CompanyMember[];
  readonly invites: CompanyInvite[];
};

function mockReadBucket(companyId: string): MockTeamBucket {
  try {
    const raw = localStorage.getItem(MOCK_TEAM_PREFIX + companyId);
    if (!raw) {
      return { members: [], invites: [] };
    }
    const p = JSON.parse(raw) as MockTeamBucket;
    return {
      members: Array.isArray(p.members) ? p.members : [],
      invites: Array.isArray(p.invites) ? p.invites : [],
    };
  } catch {
    return { members: [], invites: [] };
  }
}

function mockWriteBucket(companyId: string, b: MockTeamBucket): void {
  localStorage.setItem(MOCK_TEAM_PREFIX + companyId, JSON.stringify(b));
}

// ——— API ———

export async function listCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  if (!useFirebase()) {
    return mockReadBucket(companyId).members.slice().sort((a, b) => (a.joinedAt ?? a.createdAt).localeCompare(b.joinedAt ?? b.createdAt));
  }
  const db = tryGetFirestoreDb() as Firestore;
  const snap = await getDocs(collection(db, "companies", companyId, "members"));
  const list = snap.docs.map((d) => d.data() as CompanyMember);
  return list.sort((a, b) => (a.joinedAt ?? a.createdAt).localeCompare(b.joinedAt ?? b.createdAt));
}

export async function listCompanyInvites(companyId: string): Promise<CompanyInvite[]> {
  if (!useFirebase()) {
    return mockReadBucket(companyId).invites.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const db = tryGetFirestoreDb() as Firestore;
  const snap = await getDocs(collection(db, "companies", companyId, "invites"));
  return snap.docs.map((d) => ({ ...(d.data() as CompanyInvite), id: d.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCompanyInvite(companyId: string, inviteId: string): Promise<CompanyInvite | null> {
  if (!useFirebase()) {
    const inv = mockReadBucket(companyId).invites.find((i) => i.id === inviteId);
    return inv ?? null;
  }
  const db = tryGetFirestoreDb() as Firestore;
  const snap = await getDoc(doc(db, "companies", companyId, "invites", inviteId));
  if (!snap.exists()) {
    return null;
  }
  return { ...(snap.data() as CompanyInvite), id: snap.id };
}

export async function createCompanyInvite(
  companyId: string,
  invitedByUid: string,
  email: string,
  role: CompanyInvite["role"],
): Promise<CompanyInvite> {
  const em = normalizeInviteEmail(email);
  if (!em.includes("@")) {
    throw new Error("Введите корректный email.");
  }
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (!useFirebase()) {
    const bucket = mockReadBucket(companyId);
    if (bucket.invites.some((i) => i.email === em && i.status === "pending")) {
      throw new Error("Для этого email уже есть активное приглашение.");
    }
    if (bucket.members.some((m) => m.email === em)) {
      throw new Error("Этот пользователь уже в команде.");
    }
    const inviteId = newEntityId();
    const row: CompanyInvite = {
      id: inviteId,
      companyId,
      email: em,
      role,
      status: "pending",
      invitedBy: invitedByUid,
      createdAt: now,
      expiresAt,
    };
    mockWriteBucket(companyId, { ...bucket, invites: [...bucket.invites, row] });
    return row;
  }

  const db = tryGetFirestoreDb() as Firestore;
  const inviteRef = doc(collection(db, "companies", companyId, "invites"));
  const inviteId = inviteRef.id;
  const row: CompanyInvite = {
    id: inviteId,
    companyId,
    email: em,
    role,
    status: "pending",
    invitedBy: invitedByUid,
    createdAt: now,
    expiresAt,
  };
  await setDoc(inviteRef, row);
  return row;
}

export async function cancelCompanyInvite(companyId: string, inviteId: string): Promise<void> {
  if (!useFirebase()) {
    const bucket = mockReadBucket(companyId);
    mockWriteBucket(companyId, {
      ...bucket,
      invites: bucket.invites.map((i) => (i.id === inviteId ? { ...i, status: "cancelled" as const } : i)),
    });
    return;
  }
  const db = tryGetFirestoreDb() as Firestore;
  await updateDoc(doc(db, "companies", companyId, "invites", inviteId), {
    status: "cancelled",
  });
}

export async function acceptCompanyInvite(
  companyId: string,
  inviteId: string,
  currentUser: AcceptInviteUserContext,
): Promise<void> {
  const email = normalizeInviteEmail(currentUser.email);
  if (!email) {
    throw new Error("У аккаунта нет email — нельзя принять приглашение.");
  }
  const uid = currentUser.uid;

  if (!useFirebase()) {
    const bucket = mockReadBucket(companyId);
    const inv = bucket.invites.find((i) => i.id === inviteId);
    if (!inv || inv.companyId !== companyId) {
      throw new Error("Приглашение не найдено.");
    }
    if (normalizeInviteEmail(inv.email) !== email) {
      throw new Error("Это приглашение создано для другого email.");
    }
    if (inv.status !== "pending") {
      throw new Error("Приглашение уже недействительно.");
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new Error("Срок приглашения истёк.");
    }
    const now = new Date().toISOString();
    const member: CompanyMember = {
      id: `${companyId}_${uid}`,
      companyId,
      userId: uid,
      email,
      role: inv.role,
      status: "active",
      createdAt: now,
      joinedAt: now,
      displayName: currentUser.displayName?.trim() || undefined,
      invitedBy: inv.invitedBy,
      inviteId,
    };
    const nextInvites = bucket.invites.map((i) =>
      i.id === inviteId
        ? {
            ...i,
            status: "accepted" as const,
            acceptedBy: uid,
            acceptedAt: now,
          }
        : i,
    );
    const nextMembers = [...bucket.members.filter((m) => m.userId !== uid), member];
    mockWriteBucket(companyId, { members: nextMembers, invites: nextInvites });
    mockJoinInvitedCompany(email, companyId);
    return;
  }

  const db = tryGetFirestoreDb() as Firestore;
  const inviteRef = doc(db, "companies", companyId, "invites", inviteId);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(inviteRef);
    if (!invSnap.exists()) {
      throw new Error("Приглашение не найдено.");
    }
    const inv = invSnap.data() as CompanyInvite;
    if (normalizeInviteEmail(inv.email) !== email) {
      throw new Error("Это приглашение создано для другого email.");
    }
    if (inv.status !== "pending") {
      throw new Error("Приглашение уже недействительно.");
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new Error("Срок приглашения истёк.");
    }
    const profileSnap = await tx.get(userRef);
    const now = new Date().toISOString();
    const member: CompanyMember = {
      id: `${companyId}_${uid}`,
      companyId,
      userId: uid,
      email,
      role: inv.role,
      status: "active",
      createdAt: now,
      joinedAt: now,
      displayName: currentUser.displayName?.trim() || undefined,
      invitedBy: inv.invitedBy,
      inviteId,
    };
    const memberRef = doc(db, "companies", companyId, "members", uid);
    tx.set(memberRef, member);
    if (!profileSnap.exists()) {
      throw new Error("Профиль пользователя не найден.");
    }
    tx.update(userRef, { activeCompanyId: companyId });
    tx.update(inviteRef, {
      status: "accepted",
      acceptedBy: uid,
      acceptedAt: now,
    });
  });
}

export async function updateMemberRole(companyId: string, targetUid: string, role: CompanyMember["role"]): Promise<void> {
  if (role === "owner") {
    throw new Error("Нельзя назначить роль владельца через это действие.");
  }
  const members = await listCompanyMembers(companyId);
  const target = members.find((m) => m.userId === targetUid);
  if (!target) {
    throw new Error("Участник не найден.");
  }
  if (target.role === "owner") {
    const owners = members.filter((m) => m.role === "owner");
    if (owners.length <= 1) {
      throw new Error("Нельзя снять последнего владельца.");
    }
  }

  if (!useFirebase()) {
    const bucket = mockReadBucket(companyId);
    mockWriteBucket(companyId, {
      ...bucket,
      members: bucket.members.map((m) => (m.userId === targetUid ? { ...m, role } : m)),
    });
    return;
  }
  const db = tryGetFirestoreDb() as Firestore;
  await updateDoc(doc(db, "companies", companyId, "members", targetUid), { role });
}

export async function removeCompanyMember(companyId: string, targetUid: string): Promise<void> {
  const members = await listCompanyMembers(companyId);
  const target = members.find((m) => m.userId === targetUid);
  if (!target) {
    return;
  }
  if (target.role === "owner") {
    throw new Error("Нельзя удалить владельца компании.");
  }

  if (!useFirebase()) {
    const bucket = mockReadBucket(companyId);
    mockWriteBucket(companyId, {
      ...bucket,
      members: bucket.members.filter((m) => m.userId !== targetUid),
    });
    return;
  }
  const db = tryGetFirestoreDb() as Firestore;
  await deleteDoc(doc(db, "companies", companyId, "members", targetUid));
}
