import { Link } from "react-router-dom";

import "./AuthStubPages.css";

/**
 * TODO: Firebase Auth (register) + создание документа Company в Firestore.
 * TODO: модели Company, CompanyMember, CompanyInvite и роли owner/admin/designer/viewer.
 * TODO: приглашения сотрудников и управление доступом к проектам.
 */
export function RegisterCompanyPage() {
  return (
    <div className="auth-stub-page">
      <div className="auth-stub-inner">
        <article className="auth-stub-card">
          <h1>Создать компанию</h1>
          <p className="auth-stub-byline">Облачная работа команд — в разработке</p>
          <p className="auth-stub-note">
            Регистрация компании и приглашение сотрудников будут доступны после подключения Firebase Auth и
            схемы организаций. Сейчас проекты можно вести локально в редакторе.
          </p>
          <div className="auth-stub-fields">
            <label>
              Название компании
              <input type="text" autoComplete="organization" placeholder="ТОО «Пример»" disabled />
            </label>
            <label>
              Рабочий email
              <input type="email" autoComplete="email" placeholder="office@company.kz" disabled />
            </label>
          </div>
          <div className="auth-stub-actions">
            <button type="button" className="auth-stub-btn" disabled>
              Создать компанию
            </button>
            <Link className="auth-stub-link" to="/login">
              Уже есть аккаунт — войти
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
