const KEY = "sip-house-designer:lastOpenedProjectId";

export function getLastOpenedProjectId(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const v = localStorage.getItem(KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setLastOpenedProjectId(id: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}
