/** Модели организации и проектов HouseKit Pro (Firestore / облако). */

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

/** Участник компании (документ companies/{companyId}/members/{uid}). */
export interface CompanyMember {
  readonly id: string;
  readonly companyId: string;
  /** Совпадает с id документа (Firebase Auth uid). */
  readonly userId: string;
  readonly email: string;
  readonly role: "owner" | "admin" | "designer" | "viewer";
  readonly status: "active" | "invited";
  readonly createdAt: string;
  /** Дата вступления (для новых записей; иначе = createdAt). */
  readonly joinedAt?: string;
  readonly displayName?: string;
  readonly invitedBy?: string;
  /** Заполняется при принятии приглашения — для проверки в Firestore rules. */
  readonly inviteId?: string;
}

export interface CompanyInvite {
  readonly id: string;
  readonly companyId: string;
  readonly email: string;
  readonly role: "admin" | "designer" | "viewer";
  readonly status: "pending" | "accepted" | "cancelled" | "expired";
  readonly invitedBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly acceptedBy?: string;
  readonly acceptedAt?: string;
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
