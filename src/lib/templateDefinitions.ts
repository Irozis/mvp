import type {
  MarketplaceCardTemplateDefinition,
  MarketplaceCardTemplateId,
} from './types'

// Explicit template source of truth for the narrowed diploma scope.
// Marketplace-card is the first active format to receive template-assisted
// composition classes. Runtime selection/adaptation will plug into this
// registry in follow-up steps; for now these definitions provide the
// architectural vocabulary and mapping back into the existing layout engine.

export const MARKETPLACE_CARD_TEMPLATES: MarketplaceCardTemplateDefinition[] = [
  {
    id: 'text-first-promo',
    displayName: 'Text-first Promo',
    description:
      'A message-led marketplace card where headline and offer rhythm carry the composition, while the visual region acts as supporting context rather than a fake hero.',
    supportedFormats: ['marketplace-card'],
    solves:
      'Prevents weak pseudo-image layouts in no-image or light-asset scenarios by making the promo message the true primary focus.',
    bestFor:
      'No-image or low-image inputs with short promo copy, offer-led messaging, and a CTA that should feel integrated into the copy flow.',
    suitability: {
      noImage: 'supported',
      imageBacked: 'supported',
      shortCopy: 'supported',
      denseCopy: 'supported',
      compactCtaFlow: 'supported',
    },
    primaryCompositionPattern: 'text-led-card-with-support-accent',
    visualHierarchy: 'Headline first, CTA second, support image/panel third, brand accents last.',
    textImageRelationship:
      'Text cluster drives the composition while the image behaves like a compact support accent that reinforces the message without pretending to be a dominant hero.',
    ctaPolicy: {
      placement: 'message-inline',
      emphasis: 'standard',
      notes: 'CTA should sit close to the headline/subtitle cluster and read as the natural completion of the promo message.',
    },
    imagePolicy: {
      role: 'support-accent',
      notes: 'Image remains secondary and can compress into a compact support block or panel when a strong asset is unavailable.',
    },
    contentBehavior: 'balanced',
    readingFlow: 'message-to-support-to-cta',
    commercialRole: 'marketplace-proof-led',
    supportedSellingAngles: ['trust-led', 'benefit-led', 'comparison-led'],
    preferredCopyDensity: ['dense', 'balanced'],
    preferredConversionActions: ['learn', 'shop', 'claim'],
    proofRole: ['feature', 'review', 'guarantee'],
    heroElement: 'headline',
    demotionConditions: ['product-visual-critical', 'catalog-led', 'default-no-image-balanced'],
    zones: [
      {
        zoneId: 'message-cluster',
        purpose: 'message-cluster',
        roles: ['headline', 'subtitle'],
        guidance: 'Keep the headline high enough to establish the card as text-led, with subtitle directly supporting it.',
      },
      {
        zoneId: 'support-accent',
        purpose: 'support-panel',
        roles: ['image'],
        guidance: 'Use a compact framed support region that feels related to the text cluster instead of floating as a thin ribbon.',
      },
      {
        zoneId: 'cta-lane',
        purpose: 'cta-lane',
        roles: ['cta'],
        guidance: 'Place CTA immediately after the core message so it feels intentional and conversion-oriented.',
      },
      {
        zoneId: 'brand-topline',
        purpose: 'brand-anchor',
        roles: ['logo', 'badge'],
        guidance: 'Keep brand and promo chip lightweight so they do not compete with the text-led hierarchy.',
      },
    ],
    runtimeHints: {
      family: 'square-image-top-text-bottom',
      structuralArchetype: 'dense-information',
      balanceRegime: 'text-first',
      occupancyMode: 'text-safe',
      imageMode: 'framed',
      textMode: 'cluster-bottom',
      balanceMode: 'text-dominant',
      mode: 'text-first',
      fallbackArchetypes: ['split-vertical', 'compact-minimal'],
    },
    visualIntentNotes: [
      'Should read like a promo card with a decisive message block.',
      'Avoid fake-hero image treatment when the image is weak or absent.',
    ],
    debugNotes: ['Bridges directly to the existing no-image dense-information marketplace-card regime.'],
  },
  {
    id: 'header-panel-card',
    displayName: 'Header Panel Card',
    description:
      'A card with a real upper support panel and a grounded lower content block, designed to create stronger top-to-bottom rhythm than a decorative top strip.',
    supportedFormats: ['marketplace-card'],
    solves:
      'Replaces bland strip-first fallbacks with a clearer support-header to message-body structure, especially for default marketplace-card outputs.',
    bestFor:
      'Fresh default marketplace-card generation, no-image/placeholder cases, and promo cards that need a deliberate support region without pretending to be image-led.',
    suitability: {
      noImage: 'preferred',
      imageBacked: 'supported',
      shortCopy: 'preferred',
      denseCopy: 'supported',
      compactCtaFlow: 'preferred',
    },
    primaryCompositionPattern: 'header-panel-top-content-bottom',
    visualHierarchy: 'Support header first as framing element, message cluster second, CTA third, brand accents last.',
    textImageRelationship:
      'Image or support fill belongs inside the upper panel and exists to frame the card, while the lower text block carries the selling message.',
    ctaPolicy: {
      placement: 'message-footer',
      emphasis: 'standard',
      notes: 'CTA should anchor the lower content block and finish the reading flow, not float as a detached button.',
    },
    imagePolicy: {
      role: 'support-panel',
      notes: 'Top region should behave as a purposeful header panel even when no real product image is available.',
    },
    contentBehavior: 'balanced',
    readingFlow: 'header-to-message-to-cta',
    commercialRole: 'marketplace-benefit-stack',
    supportedSellingAngles: ['benefit-led', 'price-led', 'urgency-led', 'trust-led'],
    preferredCopyDensity: ['balanced', 'short'],
    preferredConversionActions: ['shop', 'claim', 'browse'],
    proofRole: ['brand', 'guarantee', 'feature'],
    heroElement: 'headline',
    demotionConditions: ['comparison-led-heavy', 'product-visual-critical-image-backed'],
    zones: [
      {
        zoneId: 'header-panel',
        purpose: 'support-panel',
        roles: ['image', 'logo', 'badge'],
        guidance: 'Use a meaningful upper panel footprint that supports the card rather than reading as a decorative ribbon.',
      },
      {
        zoneId: 'message-cluster',
        purpose: 'message-cluster',
        roles: ['headline', 'subtitle'],
        guidance: 'Start the text block close enough to the panel to preserve rhythm and avoid dead middle space.',
      },
      {
        zoneId: 'cta-footer',
        purpose: 'cta-lane',
        roles: ['cta'],
        guidance: 'Keep CTA in the lower content zone so it feels like the final action inside the card.',
      },
    ],
    runtimeHints: {
      family: 'square-image-top-text-bottom',
      structuralArchetype: 'split-horizontal',
      balanceRegime: 'text-first',
      occupancyMode: 'balanced',
      imageMode: 'framed',
      textMode: 'cluster-bottom',
      balanceMode: 'balanced',
      mode: 'split',
      fallbackArchetypes: ['dense-information', 'split-vertical'],
    },
    visualIntentNotes: [
      'Upper panel should frame the card, not impersonate a strong product hero.',
      'Lower block should feel like one coherent message-and-action zone.',
    ],
    debugNotes: ['Aligns with the current no-image header-panel pivot and will become the primary default template candidate.'],
  },
  {
    id: 'product-support-card',
    displayName: 'Product Support Card',
    description:
      'An image-backed marketplace card where the product region is the primary commercial anchor, while copy and CTA stay tightly coupled as the conversion block.',
    supportedFormats: ['marketplace-card'],
    solves:
      'Provides a controlled product-dominant marketplace layout that avoids both weak support strips and generic promo cards when the asset genuinely needs to carry the sell.',
    bestFor:
      'Image-backed marketplace-card cases with a usable product asset, product-benefit messaging, and a need for strong product-to-message continuity without collapsing into a bland header panel.',
    suitability: {
      noImage: 'avoid',
      imageBacked: 'preferred',
      shortCopy: 'supported',
      denseCopy: 'supported',
      compactCtaFlow: 'supported',
    },
    primaryCompositionPattern: 'product-support-with-grounded-copy',
    visualHierarchy: 'Product support image first, headline second, CTA third, subtitle/brand support last.',
    textImageRelationship:
      'Image acts as a real structural product anchor and should visibly support the message, not float independently from it.',
    ctaPolicy: {
      placement: 'message-footer',
      emphasis: 'standard',
      notes: 'CTA belongs inside the copy zone and should feel supported by both the product anchor and the message block.',
    },
    imagePolicy: {
      role: 'product-anchor',
      notes: 'Use a framed product support region with enough weight to justify image-backed marketplace behavior.',
    },
    contentBehavior: 'balanced',
    readingFlow: 'product-to-message-to-cta',
    commercialRole: 'marketplace-product-hero',
    supportedSellingAngles: ['product-led', 'benefit-led', 'catalog-led', 'comparison-led'],
    preferredCopyDensity: ['balanced', 'short'],
    preferredConversionActions: ['shop', 'browse'],
    proofRole: ['feature', 'review', 'brand'],
    heroElement: 'image',
    demotionConditions: ['no-image', 'offer-without-product-support', 'trust-proof-without-product-focus'],
    zones: [
      {
        zoneId: 'product-support',
        purpose: 'product-support',
        roles: ['image'],
        guidance: 'Give the product image a real footprint on one side of the card so it behaves as a commercial anchor instead of a generic framed accent.',
      },
      {
        zoneId: 'message-cluster',
        purpose: 'message-cluster',
        roles: ['headline', 'subtitle'],
        guidance: 'Keep copy visually coupled to the product region as a sidecar block so the card reads as product first, message second.',
      },
      {
        zoneId: 'cta-lane',
        purpose: 'cta-lane',
        roles: ['cta'],
        guidance: 'CTA should sit beneath the main message and remain grounded in the same content zone.',
      },
      {
        zoneId: 'brand-topline',
        purpose: 'brand-anchor',
        roles: ['logo', 'badge'],
        guidance: 'Brand elements should support the product framing without disrupting the central retail hierarchy.',
      },
    ],
    runtimeHints: {
      family: 'square-image-top-text-bottom',
      structuralArchetype: 'split-horizontal',
      balanceRegime: 'image-first',
      occupancyMode: 'balanced',
      imageMode: 'split-right',
      textMode: 'cluster-left',
      balanceMode: 'image-dominant',
      mode: 'split',
      fallbackArchetypes: ['split-vertical', 'dense-information'],
    },
    visualIntentNotes: [
      'Product support should be visually dominant enough to justify image-backed marketplace behavior.',
      'Message and CTA should feel like one grounded commercial block beside the product anchor.',
    ],
  },
  {
    id: 'minimal-promo-card',
    displayName: 'Minimal Promo Card',
    description:
      'A reduced marketplace card with disciplined whitespace, fewer emphasized roles, and a restrained promo message for cleaner systems.',
    supportedFormats: ['marketplace-card'],
    solves:
      'Offers a simpler card class for short-copy cases where too many competing elements would hurt clarity.',
    bestFor:
      'Short-copy offers, cleaner visual systems, and lighter promo cards where the goal is composure rather than density.',
    suitability: {
      noImage: 'supported',
      imageBacked: 'supported',
      shortCopy: 'preferred',
      denseCopy: 'avoid',
      compactCtaFlow: 'preferred',
    },
    primaryCompositionPattern: 'minimal-stack-with-quiet-support',
    visualHierarchy: 'Headline first, CTA second, image/support accent third, optional subtitle/brand details last.',
    textImageRelationship:
      'Text remains primary, while image or support accent stays intentionally quiet and should never dominate the card.',
    ctaPolicy: {
      placement: 'bottom-lane',
      emphasis: 'quiet',
      notes: 'CTA should remain visible but clean, acting as a calm conversion endpoint rather than a loud promotional block.',
    },
    imagePolicy: {
      role: 'optional-accent',
      notes: 'Image is optional support only; template still needs to hold together when the visual payload is minimal.',
    },
    contentBehavior: 'minimal',
    readingFlow: 'message-to-cta',
    commercialRole: 'marketplace-compact-offer',
    supportedSellingAngles: ['price-led', 'urgency-led'],
    preferredCopyDensity: ['short'],
    preferredConversionActions: ['shop', 'browse', 'claim'],
    proofRole: ['brand'],
    heroElement: 'headline',
    demotionConditions: ['dense-copy', 'product-visual-critical', 'proof-heavy'],
    zones: [
      {
        zoneId: 'message-cluster',
        purpose: 'message-cluster',
        roles: ['headline', 'subtitle'],
        guidance: 'Keep copy compact and vertically disciplined so the card feels intentional rather than empty.',
      },
      {
        zoneId: 'quiet-support',
        purpose: 'support-panel',
        roles: ['image'],
        guidance: 'Use only enough visual support to keep the card from feeling bare.',
      },
      {
        zoneId: 'cta-lane',
        purpose: 'cta-lane',
        roles: ['cta'],
        guidance: 'CTA should finish the reading flow cleanly without overpowering the minimal card structure.',
      },
      {
        zoneId: 'brand-topline',
        purpose: 'brand-anchor',
        roles: ['logo', 'badge'],
        guidance: 'Brand accents stay subtle and secondary in the minimal layout.',
      },
    ],
    runtimeHints: {
      family: 'square-image-top-text-bottom',
      structuralArchetype: 'compact-minimal',
      balanceRegime: 'minimal-copy',
      occupancyMode: 'spacious',
      imageMode: 'framed',
      textMode: 'cluster-bottom',
      balanceMode: 'text-dominant',
      mode: 'text-first',
      fallbackArchetypes: ['dense-information'],
    },
    visualIntentNotes: [
      'Whitespace should feel intentional, not like missing composition.',
      'Use this only when copy is light enough for a reduced card to stay convincing.',
    ],
  },
]

export const MARKETPLACE_CARD_TEMPLATE_MAP: Record<MarketplaceCardTemplateId, MarketplaceCardTemplateDefinition> =
  Object.fromEntries(
    MARKETPLACE_CARD_TEMPLATES.map((template) => [template.id, template])
  ) as Record<MarketplaceCardTemplateId, MarketplaceCardTemplateDefinition>

export function getMarketplaceCardTemplates() {
  return MARKETPLACE_CARD_TEMPLATES
}

export function getMarketplaceCardTemplateById(templateId: MarketplaceCardTemplateId) {
  return MARKETPLACE_CARD_TEMPLATE_MAP[templateId]
}

export function filterMarketplaceCardTemplatesForNoImage() {
  return MARKETPLACE_CARD_TEMPLATES.filter((template) => template.suitability.noImage !== 'avoid')
}

export function filterMarketplaceCardTemplatesForImageBacked() {
  return MARKETPLACE_CARD_TEMPLATES.filter((template) => template.suitability.imageBacked !== 'avoid')
}
