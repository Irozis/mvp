import type {
  CreativeArchetypeExport,
  CreativeEvaluationExport,
  CreativeExportJSON,
  FormatKey,
  Project,
} from './types'

/** Builds the JSON-serializable project payload including per-variant `archetype` diagnostics. */
export function buildCreativeExportJSON(project: Project): CreativeExportJSON {
  const base = project.variants
  if (!base) {
    return { ...project } as CreativeExportJSON
  }
  const nextVariants: CreativeExportJSON['variants'] = {}
  for (const fk of Object.keys(base) as FormatKey[]) {
    const v = base[fk]
    if (!v) continue
    const ar = v.archetypeResolution
    const le = v.layoutEvaluation
    const archetype: CreativeArchetypeExport = {
      id: ar?.effectiveArchetypeId ?? ar?.archetypeId ?? 'unknown',
      confidence: ar?.confidence ?? null,
      fallbackUsed: ar?.fallbackApplied ?? false,
      reason: ar?.reason ?? null,
      breakdown: ar?.confidenceBreakdown ?? null,
    }
    const evaluation: CreativeEvaluationExport = {
      overallScore: le?.overallScore ?? null,
      structuralValidity: le?.structuralValidity ?? null,
      readability: le?.readability ?? null,
      hierarchyClarity: le?.hierarchyClarity ?? null,
      visualBalance: le?.visualBalance ?? null,
      quadrantWeights: le?.quadrantWeights ?? null,
      issues: le?.issues ?? [],
    }
    nextVariants[fk] = { ...v, archetype, evaluation }
  }
  return { ...project, variants: nextVariants }
}
