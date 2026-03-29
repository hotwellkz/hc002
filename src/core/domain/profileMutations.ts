import { newEntityId } from "./ids";
import type { Profile, ProfileLayer } from "./profile";
import { sortProfileLayersByOrder } from "./profileOps";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";

function nowIso(): string {
  return new Date().toISOString();
}

export function addProfile(project: Project, profile: Profile): Project {
  return touchProjectMeta({
    ...project,
    profiles: [...project.profiles, profile],
  });
}

export function updateProfile(project: Project, profile: Profile): Project {
  const t = nowIso();
  const next: Profile = { ...profile, updatedAt: t };
  return touchProjectMeta({
    ...project,
    profiles: project.profiles.map((p) => (p.id === next.id ? next : p)),
  });
}

export function removeProfile(project: Project, profileId: string): Project {
  return touchProjectMeta({
    ...project,
    profiles: project.profiles.filter((p) => p.id !== profileId),
  });
}

export function duplicateProfile(project: Project, profileId: string): Project | null {
  const src = project.profiles.find((p) => p.id === profileId);
  if (!src) {
    return null;
  }
  const t = nowIso();
  const newId = newEntityId();
  const layerIdMap = new Map<string, string>();
  for (const l of src.layers) {
    layerIdMap.set(l.id, newEntityId());
  }
  const newLayers: ProfileLayer[] = sortProfileLayersByOrder([...src.layers]).map((l, i) => ({
    ...l,
    id: layerIdMap.get(l.id) ?? newEntityId(),
    orderIndex: i,
  }));
  const copy: Profile = {
    ...src,
    id: newId,
    name: `${src.name} (копия)`,
    layers: newLayers,
    createdAt: t,
    updatedAt: t,
  };
  return touchProjectMeta({
    ...project,
    profiles: [...project.profiles, copy],
  });
}

export function replaceProfiles(project: Project, profiles: readonly Profile[]): Project {
  return touchProjectMeta({
    ...project,
    profiles: [...profiles],
  });
}
