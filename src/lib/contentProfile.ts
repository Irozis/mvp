import type { AIContentAnalysis, ContentProfile, CreativeInput, Scene } from './types'

let aiContentAnalyzer: ((input: CreativeInput) => Promise<AIContentAnalysis>) | null = null

const textLen = (value?: string) => (value || '').trim().length

function normalizeText(value?: string) {
  return (value || '').trim().toLowerCase()
}

function hasAny(text: string, pattern: RegExp) {
  return pattern.test(text)
}

export function extractCreativeInput(scene: Scene): CreativeInput {
  return {
    headline: scene.title.text || '',
    subtitle: scene.subtitle.text || '',
    body: '',
    cta: scene.cta.text || '',
    badge: scene.badge.text || scene.chip || '',
    price: '',
  }
}

function detectMessageType(text: string): AIContentAnalysis['messageType'] {
  if (/\b(save|sale|discount|offer|limited|today|deal|free|shop)\b/.test(text)) return 'promo'
  if (/\b(product|launch|collection|sku|new drop|capsule|device|serum|kit)\b/.test(text)) return 'product'
  if (/\b(report|guide|insight|story|editorial|article|read)\b/.test(text)) return 'editorial'
  if (/\b(signature|crafted|atelier|private|collection|premium|refined|luxury)\b/.test(text)) return 'luxury'
  return 'corporate'
}

function detectTone(text: string): AIContentAnalysis['tone'] {
  if (/\b(now|limited|urgent|exclusive|save|off)\b/.test(text)) return 'aggressive'
  if (/\b(premium|crafted|refined|signature|elevate)\b/.test(text)) return 'premium'
  if (/\b(story|guide|journal|thoughtful|insight)\b/.test(text)) return 'soft'
  if (/\b(simple|clean|minimal|clarity|streamline)\b/.test(text)) return 'clean'
  return 'bold'
}

function detectHeadlineTone(text: string): AIContentAnalysis['headlineTone'] {
  if (/\b(save|buy|shop|join|start|launch)\b/.test(text)) return 'direct'
  if (/\b(luxury|premium|crafted|refined)\b/.test(text)) return 'premium'
  if (/\b(limited|urgent|exclusive|only today)\b/.test(text)) return 'aggressive'
  return 'soft'
}

function detectPrimaryConversionAction(
  text: string,
  fallbackMessageType: AIContentAnalysis['messageType']
): AIContentAnalysis['primaryConversionAction'] {
  if (/\b(install|download|get the app|use the app)\b/.test(text)) return 'install'
  if (/\b(register|sign up|join now|join today|book|reserve)\b/.test(text)) return 'register'
  if (/\b(claim|redeem|unlock|get yours|apply now)\b/.test(text)) return 'claim'
  if (/\b(learn|read more|see details|discover why|explore more)\b/.test(text)) return 'learn'
  if (/\b(browse|view|see collection|explore|discover|shop all)\b/.test(text)) return 'browse'
  if (/\b(shop|buy|order|add to cart|pick up)\b/.test(text)) return 'shop'
  return fallbackMessageType === 'editorial' ? 'learn' : 'shop'
}

function detectOfferStrength(text: string): AIContentAnalysis['offerStrength'] {
  const strongSignals =
    /\b\d+%|\b\d+\s?(off|sale|discount)\b|[$€₽]\s?\d+|\bfree\b|\bbogo\b|\bbuy one get one\b/i.test(text)
  const mediumSignals = /\b(save|sale|discount|offer|deal|bundle|special|launch offer)\b/.test(text)
  const weakSignals = /\b(new|launch|drop|introducing|available now)\b/.test(text)

  if (strongSignals) return 'strong'
  if (mediumSignals) return 'medium'
  if (weakSignals) return 'weak'
  return 'none'
}

function detectProofPresence(text: string): AIContentAnalysis['proofPresence'] {
  if (/\b(review|rating|rated|stars|trusted by|customers love|testimonial)\b/.test(text)) return 'review'
  if (/\b(feature|benefit|performance|quality|durable|results|clean|fast|lightweight)\b/.test(text)) return 'feature'
  if (/\b(guarantee|warranty|returns|money back|certified|verified)\b/.test(text)) return 'guarantee'
  if (/\b(official|since \d{4}|brand|signature|heritage)\b/.test(text)) return 'brand'
  return 'none'
}

function detectSellingAngle(input: {
  combined: string
  messageType: AIContentAnalysis['messageType']
  offerStrength: AIContentAnalysis['offerStrength']
  proofPresence: AIContentAnalysis['proofPresence']
}): AIContentAnalysis['sellingAngle'] {
  if (/\b(compare|comparison|versus|vs\b|better than|side by side)\b/.test(input.combined)) return 'comparison-led'
  if (/\b(catalog|assortment|range|sku|styles|shop all|browse all|lineup|variants)\b/.test(input.combined)) return 'catalog-led'
  if (input.offerStrength === 'strong' || /\b(price|deal|discount|sale|save)\b/.test(input.combined)) return 'price-led'
  if (input.messageType === 'product' || /\b(product|collection|kit|serum|device|set|formula)\b/.test(input.combined)) {
    return 'product-led'
  }
  if (/\b(limited|today|ends soon|last chance|hurry|while supplies last)\b/.test(input.combined)) return 'urgency-led'
  if (
    input.messageType !== 'luxury' &&
    (
      input.proofPresence === 'review' ||
      input.proofPresence === 'guarantee' ||
      /\b(trusted|verified|certified|top rated|best rated|proven)\b/.test(input.combined)
    )
  ) {
    return 'trust-led'
  }
  return 'benefit-led'
}

function detectProductVisualNeed(input: {
  sellingAngle: AIContentAnalysis['sellingAngle']
  messageType: AIContentAnalysis['messageType']
  proofPresence: AIContentAnalysis['proofPresence']
}): AIContentAnalysis['productVisualNeed'] {
  if (
    input.sellingAngle === 'product-led' ||
    input.sellingAngle === 'catalog-led' ||
    input.sellingAngle === 'comparison-led' ||
    input.messageType === 'product'
  ) {
    return 'critical'
  }
  if (input.sellingAngle === 'trust-led' || input.proofPresence === 'feature' || input.proofPresence === 'review') {
    return 'useful'
  }
  return 'optional'
}

function detectMessageCompressionNeed(input: {
  totalLength: number
  textDensity: AIContentAnalysis['textDensity']
  offerStrength: AIContentAnalysis['offerStrength']
  proofPresence: AIContentAnalysis['proofPresence']
  sellingAngle: AIContentAnalysis['sellingAngle']
}): AIContentAnalysis['messageCompressionNeed'] {
  if (
    input.textDensity === 'dense' ||
    input.totalLength > 220 ||
    input.sellingAngle === 'catalog-led' ||
    input.sellingAngle === 'comparison-led' ||
    (input.offerStrength === 'strong' && input.proofPresence !== 'none')
  ) {
    return 'high'
  }
  if (
    input.textDensity === 'balanced' ||
    input.totalLength > 120 ||
    input.offerStrength !== 'none' ||
    input.proofPresence !== 'none'
  ) {
    return 'medium'
  }
  return 'low'
}

function detectMarketplaceCommercialHint(input: {
  sellingAngle: AIContentAnalysis['sellingAngle']
  productVisualNeed: AIContentAnalysis['productVisualNeed']
  offerStrength: AIContentAnalysis['offerStrength']
  proofPresence: AIContentAnalysis['proofPresence']
  messageCompressionNeed: AIContentAnalysis['messageCompressionNeed']
}): AIContentAnalysis['marketplaceCommercialHint'] {
  if (input.sellingAngle === 'catalog-led' || input.sellingAngle === 'comparison-led') return 'marketplace-catalog-tile'
  if (input.productVisualNeed === 'critical' && input.sellingAngle === 'product-led') return 'marketplace-product-hero'
  if (
    input.sellingAngle === 'price-led' ||
    input.sellingAngle === 'urgency-led' ||
    input.offerStrength === 'strong'
  ) {
    return input.messageCompressionNeed === 'high' ? 'marketplace-compact-offer' : 'marketplace-price-punch'
  }
  if (input.proofPresence !== 'none' || input.sellingAngle === 'trust-led') return 'marketplace-proof-led'
  return 'marketplace-benefit-stack'
}

function baselineAIAnalysis(input: CreativeInput): AIContentAnalysis {
  const headline = normalizeText(input.headline)
  const subtitle = normalizeText(input.subtitle)
  const body = normalizeText(input.body)
  const cta = normalizeText(input.cta)
  const badge = normalizeText(input.badge)
  const price = normalizeText(input.price)
  const combined = `${headline} ${subtitle} ${body} ${cta} ${badge} ${price}`.trim()

  const offerDetected = hasAny(combined, /\b\d+%|\b\d+\s?(off|sale|discount)|[$€₽]\s?\d+|\bfree\b|\blimited\b/i)
  const messageType = detectMessageType(combined)
  const tone = detectTone(combined)
  const headlineTone = detectHeadlineTone(headline)
  const totalLength =
    textLen(input.headline) +
    textLen(input.subtitle) +
    textLen(input.body) +
    textLen(input.cta) +
    textLen(input.badge) +
    textLen(input.price)
  const textDensity = totalLength > 240 ? 'dense' : totalLength > 120 ? 'balanced' : 'light'
  const ctaImportance =
    offerDetected || hasAny(cta, /\b(shop|buy|order|book|get|start|learn|apply)\b/)
      ? 'high'
      : textLen(input.cta) > 0
        ? 'medium'
        : 'low'
  const promoIntensity =
    offerDetected || hasAny(combined, /\b(limited|exclusive|today|now)\b/)
      ? 'high'
      : hasAny(combined, /\b(new|launch|introducing|save)\b/)
        ? 'medium'
        : 'low'
  const offerStrength = detectOfferStrength(combined)
  const proofPresence = detectProofPresence(combined)
  const sellingAngle = detectSellingAngle({
    combined,
    messageType,
    offerStrength,
    proofPresence,
  })
  const primaryConversionAction = detectPrimaryConversionAction(`${cta} ${headline} ${subtitle}`, messageType)
  const productVisualNeed = detectProductVisualNeed({
    sellingAngle,
    messageType,
    proofPresence,
  })
  const messageCompressionNeed = detectMessageCompressionNeed({
    totalLength,
    textDensity,
    offerStrength,
    proofPresence,
    sellingAngle,
  })
  const marketplaceCommercialHint = detectMarketplaceCommercialHint({
    sellingAngle,
    productVisualNeed,
    offerStrength,
    proofPresence,
    messageCompressionNeed,
  })

  return {
    messageType,
    promoIntensity,
    tone,
    ctaImportance,
    textDensity,
    offerDetected,
    semanticType: messageType,
    headlineTone,
    needsStrongCTA: ctaImportance === 'high' || promoIntensity === 'high',
    needsOfferDominance: offerDetected || hasAny(`${badge} ${price}`, /\b\d+%|[$€₽]\s?\d+\b/),
    sellingAngle,
    primaryConversionAction,
    offerStrength,
    proofPresence,
    productVisualNeed,
    messageCompressionNeed,
    marketplaceCommercialHint,
  }
}

export function setAIContentAnalyzer(analyzer: ((input: CreativeInput) => Promise<AIContentAnalysis>) | null) {
  aiContentAnalyzer = analyzer
}

export async function aiAnalyzeContent(input: CreativeInput): Promise<AIContentAnalysis> {
  const baseline = baselineAIAnalysis(input)
  if (!aiContentAnalyzer) return baseline

  try {
    const refined = await aiContentAnalyzer(input)
    return { ...baseline, ...refined }
  } catch {
    return baseline
  }
}

export function analyzeContentBaseline(input: CreativeInput): AIContentAnalysis {
  return baselineAIAnalysis(input)
}

export function buildEnhancedContentProfile(input: CreativeInput, analysis?: AIContentAnalysis): ContentProfile {
  const semantic = analysis || baselineAIAnalysis(input)
  const headlineLength = textLen(input.headline)
  const subtitleLength = textLen(input.subtitle)
  const bodyLength = textLen(input.body)
  const ctaLength = textLen(input.cta)
  const badgeLength = textLen(input.badge)
  const priceLength = textLen(input.price)

  let preferredMessageMode: ContentProfile['preferredMessageMode'] = 'balanced'
  if (semantic.productVisualNeed === 'critical' && semantic.messageCompressionNeed !== 'high') preferredMessageMode = 'image-first'
  if (
    semantic.textDensity === 'light' &&
    semantic.promoIntensity !== 'low' &&
    semantic.productVisualNeed !== 'optional'
  ) {
    preferredMessageMode = 'image-first'
  }
  if (
    semantic.textDensity === 'dense' ||
    subtitleLength + bodyLength > 150 ||
    semantic.proofPresence !== 'none' ||
    semantic.marketplaceCommercialHint === 'marketplace-benefit-stack'
  ) {
    preferredMessageMode = 'text-first'
  }

  return {
    headlineLength,
    subtitleLength,
    bodyLength,
    ctaLength,
    badgeLength,
    priceLength,
    density: semantic.textDensity,
    textWeight:
      headlineLength * 1.25 +
      subtitleLength * 0.8 +
      bodyLength * 0.65 +
      ctaLength * 0.5 +
      badgeLength * 0.55 +
      priceLength * 0.75,
    hasOffer: semantic.offerDetected,
    offerWeight: semantic.offerDetected ? Math.max(22, badgeLength + ctaLength + priceLength) : 0,
    preferredMessageMode,
    messageType: semantic.messageType,
    promoIntensity: semantic.promoIntensity,
    tone: semantic.tone,
    ctaImportance: semantic.ctaImportance,
    semanticType: semantic.semanticType,
    headlineTone: semantic.headlineTone,
    needsStrongCTA: semantic.needsStrongCTA,
    needsOfferDominance: semantic.needsOfferDominance,
    sellingAngle: semantic.sellingAngle,
    primaryConversionAction: semantic.primaryConversionAction,
    offerStrength: semantic.offerStrength,
    proofPresence: semantic.proofPresence,
    productVisualNeed: semantic.productVisualNeed,
    messageCompressionNeed: semantic.messageCompressionNeed,
    marketplaceCommercialHint: semantic.marketplaceCommercialHint,
  }
}

export async function profileContentWithAI(scene: Scene): Promise<ContentProfile> {
  const input = extractCreativeInput(scene)
  const analysis = await aiAnalyzeContent(input)
  return buildEnhancedContentProfile(input, analysis)
}

export function profileContent(scene: Scene): ContentProfile {
  return buildEnhancedContentProfile(extractCreativeInput(scene))
}
