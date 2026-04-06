import type { Project, ProjectRepository, ProjectVersion, SavedProject } from './types'

const STORAGE_KEY = 'adaptive-graphics-saved-projects-v1'

function parseSavedProjects(raw: string | null): SavedProject[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as SavedProject[]) : []
  } catch {
    return []
  }
}

function createVersion(project: Project, name: string, note: string): ProjectVersion {
  return {
    id: crypto.randomUUID(),
    name,
    note,
    createdAt: new Date().toISOString(),
    project: structuredClone(project),
  }
}

export function loadSavedProjects() {
  return parseSavedProjects(localStorage.getItem(STORAGE_KEY))
}

export function saveProjectRecord(existingId: string | null, name: string, project: Project, note: string) {
  const saved = loadSavedProjects()
  const now = new Date().toISOString()
  const version = createVersion(project, name, note)

  if (existingId) {
    const next = saved.map((entry) =>
      entry.id === existingId
        ? {
            ...entry,
            name,
            updatedAt: now,
            project: structuredClone(project),
            versions: [version, ...entry.versions].slice(0, 20),
          }
        : entry
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  }

  const nextEntry: SavedProject = {
    id: crypto.randomUUID(),
    name,
    updatedAt: now,
    project: structuredClone(project),
    versions: [version],
  }

  const next = [nextEntry, ...saved]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function deleteProjectRecord(id: string) {
  const next = loadSavedProjects().filter((entry) => entry.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export const localProjectRepository: ProjectRepository = {
  loadAll: loadSavedProjects,
  save: saveProjectRecord,
  remove: deleteProjectRecord,
}
