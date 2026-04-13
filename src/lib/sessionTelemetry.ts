import type { Project } from './types'

export const SESSION_TELEMETRY_STORAGE_KEY = 'adaptive-graphics-session-telemetry-v1'

export interface ArchetypeRecord {
  archetypeId: string
  count: number
  totalScore: number
  fallbacks: number
  lowConfidence: number
}

export interface SessionTelemetry {
  exportCount: number
  variantCount: number
  archetypes: Record<string, ArchetypeRecord>
  avgOverallScore: number
  totalIssues: number
  fallbackRate: number
  lastExportedAt: string
  sessionStartedAt: string
}

export function loadTelemetry(): SessionTelemetry | null {
  try {
    const raw = localStorage.getItem(SESSION_TELEMETRY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as SessionTelemetry
  } catch {
    return null
  }
}

export function saveTelemetry(data: SessionTelemetry): void {
  try {
    localStorage.setItem(SESSION_TELEMETRY_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full or disabled
  }
}

export function resetTelemetry(): void {
  try {
    localStorage.removeItem(SESSION_TELEMETRY_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function emptyTelemetry(sessionStartedAt: string): SessionTelemetry {
  return {
    exportCount: 0,
    variantCount: 0,
    archetypes: {},
    avgOverallScore: 0,
    totalIssues: 0,
    fallbackRate: 0,
    lastExportedAt: '',
    sessionStartedAt,
  }
}

export function recordExport(project: Project): SessionTelemetry {
  const existing = loadTelemetry()
  const now = new Date().toISOString()
  const t: SessionTelemetry = existing
    ? { ...existing, archetypes: { ...existing.archetypes } }
    : emptyTelemetry(now)

  if (!existing) {
    t.sessionStartedAt = now
  }

  const variants = project.variants ? Object.values(project.variants).filter((v): v is NonNullable<typeof v> => Boolean(v)) : []

  let batchScoreSum = 0
  let batchVariantCount = 0
  let batchIssuesSum = 0

  for (const variant of variants) {
    const ar = variant.archetypeResolution
    const le = variant.layoutEvaluation
    if (!ar || !le) continue

    const archetypeIdRaw = ar.effectiveArchetypeId ?? ar.archetypeId ?? 'unknown'
    const archetypeId = String(archetypeIdRaw)
    const confidence = ar.confidence
    const fallbackApplied = ar.fallbackApplied === true
    const lowConf = confidence < 0.65

    const prev = t.archetypes[archetypeId] ?? {
      archetypeId,
      count: 0,
      totalScore: 0,
      fallbacks: 0,
      lowConfidence: 0,
    }

    t.archetypes[archetypeId] = {
      archetypeId,
      count: prev.count + 1,
      totalScore: prev.totalScore + le.overallScore,
      fallbacks: prev.fallbacks + (fallbackApplied ? 1 : 0),
      lowConfidence: prev.lowConfidence + (lowConf ? 1 : 0),
    }

    batchScoreSum += le.overallScore
    batchVariantCount += 1
    batchIssuesSum += le.issues.length
  }

  const prevVariantCount = existing?.variantCount ?? 0
  const prevAvg = existing?.avgOverallScore ?? 0
  const newVariantCount = prevVariantCount + batchVariantCount
  const newScoreSum = prevAvg * prevVariantCount + batchScoreSum

  t.exportCount += 1
  t.variantCount = newVariantCount
  t.avgOverallScore = newVariantCount > 0 ? newScoreSum / newVariantCount : 0
  t.totalIssues += batchIssuesSum
  t.lastExportedAt = now

  let totalFallbackEvents = 0
  for (const rec of Object.values(t.archetypes)) {
    totalFallbackEvents += rec.fallbacks
  }
  t.fallbackRate = t.variantCount > 0 ? totalFallbackEvents / t.variantCount : 0

  saveTelemetry(t)
  return t
}
