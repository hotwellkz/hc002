import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

import type { Company, CompanyMember, UserProfile } from "@/core/company/orgTypes";
import { tryGetFirebaseAuth } from "@/firebase/authClient";

import { fetchProfileAndCompanyForUser } from "./firebaseAuthOperations";
import { mockGetActiveCompanyMember, mockGetSession, subscribeMockAuth } from "./mockAuthService";

export type AuthStatus = "loading" | "ready";

export type AuthContextValue = {
  readonly status: AuthStatus;
  readonly mode: "firebase" | "mock";
  readonly user: FirebaseUser | null;
  readonly profile: UserProfile | null;
  readonly activeCompany: Company | null;
  /** Участник текущей компании (роль для UI и прав). */
  readonly activeCompanyMember: CompanyMember | null;
  /** Есть ли сессия (Firebase user или mock-профиль). */
  readonly isAuthenticated: boolean;
  readonly refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [bundle, setBundle] = useState<{
    status: AuthStatus;
    user: FirebaseUser | null;
    profile: UserProfile | null;
    company: Company | null;
    activeCompanyMember: CompanyMember | null;
  }>({ status: "loading", user: null, profile: null, company: null, activeCompanyMember: null });

  useEffect(() => {
    const auth = tryGetFirebaseAuth();
    if (auth) {
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setBundle({ status: "ready", user: null, profile: null, company: null, activeCompanyMember: null });
          return;
        }
        const { profile, company, activeCompanyMember } = await fetchProfileAndCompanyForUser(user);
        setBundle({ status: "ready", user, profile, company, activeCompanyMember });
      });
      return () => unsub();
    }

    const refresh = () => {
      const s = mockGetSession();
      if (!s) {
        setBundle({ status: "ready", user: null, profile: null, company: null, activeCompanyMember: null });
      } else {
        const activeCompanyMember = mockGetActiveCompanyMember(s.profile, s.company);
        setBundle({
          status: "ready",
          user: null,
          profile: s.profile,
          company: s.company,
          activeCompanyMember,
        });
      }
    };
    refresh();
    return subscribeMockAuth(refresh);
  }, []);

  const refreshSession = useCallback(async () => {
    const auth = tryGetFirebaseAuth();
    if (auth) {
      const u = auth.currentUser;
      if (!u) {
        setBundle({ status: "ready", user: null, profile: null, company: null, activeCompanyMember: null });
        return;
      }
      const { profile, company, activeCompanyMember } = await fetchProfileAndCompanyForUser(u);
      setBundle({ status: "ready", user: u, profile, company, activeCompanyMember });
      return;
    }
    const s = mockGetSession();
    if (!s) {
      setBundle({ status: "ready", user: null, profile: null, company: null, activeCompanyMember: null });
    } else {
      const activeCompanyMember = mockGetActiveCompanyMember(s.profile, s.company);
      setBundle({
        status: "ready",
        user: null,
        profile: s.profile,
        company: s.company,
        activeCompanyMember,
      });
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const mode: "firebase" | "mock" = tryGetFirebaseAuth() != null ? "firebase" : "mock";
    const isAuthenticated = bundle.user != null || bundle.profile != null;
    return {
      status: bundle.status,
      mode,
      user: bundle.user,
      profile: bundle.profile,
      activeCompany: bundle.company,
      activeCompanyMember: bundle.activeCompanyMember,
      isAuthenticated,
      refreshSession,
    };
  }, [bundle, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth вне AuthProvider");
  }
  return ctx;
}

export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
