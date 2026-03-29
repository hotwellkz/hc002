import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import type { Project } from "../domain/project";
import { touchProjectMeta } from "../domain/projectFactory";

import { deserializeProject, serializeProject } from "./serialization";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

export async function saveProjectToFile(project: Project): Promise<void> {
  const path = await save({
    filters: [{ name: "SIP Project", extensions: ["sipproj", "json"] }],
    defaultPath: `${project.meta.name.replace(/[^\wа-яА-ЯёЁ\- ]/gu, "_")}.sipproj`,
  });
  if (path === null) {
    return;
  }
  const toWrite = touchProjectMeta(project);
  await writeTextFile(path, serializeProject(toWrite));
}

export async function loadProjectFromFile(): Promise<Project | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "SIP Project", extensions: ["sipproj", "json"] }],
  });
  if (path === null) {
    return null;
  }
  const single = Array.isArray(path) ? path[0] : path;
  if (!single) {
    return null;
  }
  const text = await readTextFile(single);
  return deserializeProject(text);
}

/** Скачивание JSON в браузере (без Tauri), чтобы не ломать отладку в чистом Vite. */
export function downloadProjectJson(project: Project, filename: string): void {
  const blob = new Blob([serializeProject(touchProjectMeta(project))], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function pickAndLoadProject(): Promise<Project | null> {
  if (isTauriRuntime()) {
    return loadProjectFromFile();
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.sipproj,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        try {
          resolve(deserializeProject(text));
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

export async function saveProjectWithFallback(project: Project): Promise<void> {
  if (isTauriRuntime()) {
    await saveProjectToFile(project);
    return;
  }
  downloadProjectJson(project, `${project.meta.name}.sipproj`);
}
