/** Модели организации и проектов HouseKit Pro (Firestore / будущее облако). */

export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly createdAt: string;
  readonly activeCompanyId?: string;
}

export interface Company {
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly createdAt: string;
  readonly plan: "beta" | "pro" | "team";
}

export interface CompanyMember {
  readonly id: string;
  readonly companyId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: "owner" | "admin" | "designer" | "viewer";
  readonly status: "active" | "invited";
  readonly createdAt: string;
}

export interface CompanyInvite {
  readonly id: string;
  readonly companyId: string;
  readonly email: string;
  readonly role: "admin" | "designer" | "viewer";
  readonly token: string;
  readonly status: "pending" | "accepted" | "expired";
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** Метаданные облачного проекта (Firestore companies/{companyId}/projects/{projectId}). */
export interface ProjectMeta {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly previewImageUrl?: string;
  /** Путь к project.json в Firebase Storage, если используется Storage. */
  readonly storagePath?: string;
  /** Версия обёртки cloud JSON (см. cloudProjectPayload). */
  readonly schemaVersion?: number;
}
