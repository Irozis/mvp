import { describe, expect, it } from 'vitest'

import { classifyMarketplaceCardSemanticRuntimeAlignment } from './marketplaceCardAlignmentAudit'
import type {
  MarketplaceCardTemplateSelectionResult,
  VisualAssessmentBand,
} from './types'

function createSelection(
  selectedTemplateId: MarketplaceCardTemplateSelectionResult['selectedTemplateId']
): MarketplaceCardTemplateSelectionResult {
  return {
    selectedTemplateId,
    alternativeTemplateIds: ['header-panel-card', 'text-first-promo', 'product-support-card', 'minimal-promo-card']
      .filter((templateId) => templateId !== selectedTemplateId)
      .slice(0, 3) as MarketplaceCardTemplateSelectionResult['alternativeTemplateIds'],
    reasonCodes: ['selling-angle-match'],
    decisionSummary: 'test selection',
    inputProfile: {
      hasRealImage: false,
      imageRegime: 'no-image',
      imageProfile: undefined,
      copyDensity: 'balanced',
      preferredMessageMode: 'balanced',
      messageType: 'promo',
      promoIntensity: 'medium',
      sellingAngle: 'benefit-led',
      primaryConversionAction: 'shop',
      offerStrength: 'medium',
      proofPresence: 'none',
      productVisualNeed: 'optional',
      messageCompressionNeed: 'medium',
      marketplaceCommercialHint: 'marketplace-benefit-stack',
      ctaFlow: 'strong',
      subtitlePresent: true,
      badgePresent: false,
      logoPresent: false,
      ctaPresent: true,
    },
    debug: {
      rankedTemplates: [
        {
          templateId: selectedTemplateId,
          totalScore: 30,
          positiveFactors: ['+7 selling angle'],
          penalties: [],
          reasonCodes: ['selling-angle-match'],
        },
        {
          templateId: 'header-panel-card',
          totalScore: 28,
          positiveFactors: ['+12 no-image regime fit'],
          penalties: [],
          reasonCodes: ['no-image'],
        },
      ],
    },
  }
}

function candidate(input: {
  templateId: 'header-panel-card' | 'text-first-promo' | 'product-support-card' | 'minimal-promo-card' | 'n/a'
  structuralStatus?: 'valid' | 'degraded' | 'invalid'
  effectiveScore?: number
  visualScore?: number
  visualBand?: VisualAssessmentBand
  highStructuralFindingCount?: number
  criticalIssueCount?: number
  highIssueCount?: number
  issueCount?: number
}) {
  return {
    templateId: input.templateId,
    strategyLabel: `template-${input.templateId}`,
    structuralStatus: input.structuralStatus || 'valid',
    effectiveScore: input.effectiveScore || 20,
    visualScore: input.visualScore || 60,
    visualBand: input.visualBand || 'weak',
    highStructuralFindingCount: input.highStructuralFindingCount || 0,
    criticalIssueCount: input.criticalIssueCount || 0,
    highIssueCount: input.highIssueCount || 0,
    issueCount: input.issueCount || 0,
  }
}

describe('marketplace-card semantic/runtime alignment audit', () => {
  it('marks matching semantic and runtime templates as aligned', () => {
    const selection = createSelection('header-panel-card')
    const runtimeWinner = candidate({ templateId: 'header-panel-card' })

    const result = classifyMarketplaceCardSemanticRuntimeAlignment({
      selection,
      runtimeWinner,
      runtimeCandidates: [runtimeWinner],
    })

    expect(result.status).toBe('aligned')
    expect(result.reasons).toEqual([])
  })

  it('classifies safer runtime override as acceptable drift', () => {
    const selection = createSelection('text-first-promo')
    const semanticCandidate = candidate({
      templateId: 'text-first-promo',
      structuralStatus: 'invalid',
      effectiveScore: 6,
      visualScore: 58,
      highStructuralFindingCount: 2,
      highIssueCount: 2,
    })
    const runtimeWinner = candidate({
      templateId: 'header-panel-card',
      structuralStatus: 'valid',
      effectiveScore: 24,
      visualScore: 64,
    })

    const result = classifyMarketplaceCardSemanticRuntimeAlignment({
      selection,
      runtimeWinner,
      runtimeCandidates: [semanticCandidate, runtimeWinner],
    })

    expect(result.status).toBe('acceptable-drift')
    expect(result.reasons).toContain('structural-safety-override')
  })

  it('classifies near-tie semantic drift as acceptable boundary drift', () => {
    const selection = createSelection('text-first-promo')
    selection.debug = {
      rankedTemplates: [
        {
          templateId: 'text-first-promo',
          totalScore: 30,
          positiveFactors: ['+7 selling angle'],
          penalties: [],
          reasonCodes: ['selling-angle-match'],
        },
        {
          templateId: 'header-panel-card',
          totalScore: 29,
          positiveFactors: ['+12 no-image regime fit'],
          penalties: [],
          reasonCodes: ['no-image'],
        },
      ],
    }

    const semanticCandidate = candidate({
      templateId: 'text-first-promo',
      structuralStatus: 'valid',
      effectiveScore: 22,
      visualScore: 60,
    })
    const runtimeWinner = candidate({
      templateId: 'header-panel-card',
      structuralStatus: 'valid',
      effectiveScore: 23,
      visualScore: 61,
    })

    const result = classifyMarketplaceCardSemanticRuntimeAlignment({
      selection,
      runtimeWinner,
      runtimeCandidates: [semanticCandidate, runtimeWinner],
    })

    expect(result.status).toBe('acceptable-drift')
    expect(result.reasons).toContain('weak-template-boundary')
  })

  it('treats near-equal runtime losses as acceptable boundary drift', () => {
    const selection = createSelection('product-support-card')
    selection.inputProfile.imageRegime = 'image-backed'
    selection.inputProfile.productVisualNeed = 'critical'
    selection.debug = {
      rankedTemplates: [
        {
          templateId: 'product-support-card',
          totalScore: 60,
          positiveFactors: ['+10 critical product visual need'],
          penalties: [],
          reasonCodes: ['product-visual-critical'],
        },
        {
          templateId: 'header-panel-card',
          totalScore: -1,
          positiveFactors: [],
          penalties: ['-10 critical product visual need mismatch'],
          reasonCodes: ['image-backed'],
        },
      ],
    }

    const semanticCandidate = candidate({
      templateId: 'product-support-card',
      structuralStatus: 'valid',
      effectiveScore: 11,
      visualScore: 61,
      criticalIssueCount: 3,
      highIssueCount: 1,
    })
    const runtimeWinner = candidate({
      templateId: 'header-panel-card',
      structuralStatus: 'valid',
      effectiveScore: 13,
      visualScore: 63,
      criticalIssueCount: 2,
      highIssueCount: 1,
    })

    const result = classifyMarketplaceCardSemanticRuntimeAlignment({
      selection,
      runtimeWinner,
      runtimeCandidates: [semanticCandidate, runtimeWinner],
    })

    expect(result.status).toBe('acceptable-drift')
    expect(result.reasons).toContain('near-equal-runtime-boundary')
  })
})
