export type FormatKey =
  | 'social-square'
  | 'social-portrait'
  | 'story-vertical'
  | 'social-landscape'
  | 'display-mpu'
  | 'display-large-rect'
  | 'display-leaderboard'
  | 'display-skyscraper'
  | 'display-halfpage'
  | 'display-billboard'
  | 'marketplace-card'
  | 'marketplace-tile'
  | 'marketplace-highlight'
  | 'print-flyer-a5'
  | 'print-poster-a4'
  | 'print-billboard'
  | 'presentation-hero'
  | 'presentation-cover'
  | 'presentation-onepager'

export type LayoutFamily = 'landscape' | 'square' | 'portrait' | 'wide' | 'skyscraper' | 'printPortrait'
export type TemplateKey = 'promo' | 'product' | 'article'
export type GoalKey = 'stories-ads' | 'performance-banners' | 'retail-flyer' | 'promo-pack'
export type VisualSystemKey = 'minimal' | 'bold-promo' | 'editorial' | 'product-card' | 'luxury-clean'
export type ProductScopeStage = 'active' | 'legacy' | 'experimental'
export type PrimaryGenerationMode = 'template-assist-primary' | 'legacy-freeform' | 'experimental-freeform'
export type MarketplaceCardTemplateId =
  | 'text-first-promo'
  | 'header-panel-card'
  | 'product-support-card'
  | 'minimal-promo-card'

/** Deterministic slot-based marketplace layouts (card + tile); see `marketplaceLayoutV2.ts`. */
export type MarketplaceV2ArchetypeId =
  | 'v2-card-split-image-right'
  | 'v2-card-hero-shelf'
  | 'v2-card-text-focus'
  | 'v2-card-split-image-left'
  | 'v2-card-full-bleed-overlay'
  | 'v2-card-text-only'
  | 'v2-tile-split-balanced'
  | 'v2-tile-image-forward'
  | 'v2-tile-image-left'

export type MarketplaceTemplateVariant =
  | 'base'
  | 'commerce-lockup'
  | 'image-dominant-square'
  | 'proof-band'
  | 'comparison-lockup'

export type MarketplaceLayoutEngineMode = 'default' | 'v2-slot'
export type TemplateSupportLevel = 'preferred' | 'supported' | 'avoid'
export type TemplateContentBehavior = 'minimal' | 'balanced' | 'dense'
export type SellingAngle =
  | 'price-led'
  | 'benefit-led'
  | 'product-led'
  | 'urgency-led'
  | 'trust-led'
  | 'catalog-led'
  | 'comparison-led'
export type PrimaryConversionAction = 'shop' | 'learn' | 'claim' | 'browse' | 'install' | 'register'
export type OfferStrength = 'none' | 'weak' | 'medium' | 'strong'
export type ProofPresence = 'none' | 'review' | 'feature' | 'guarantee' | 'brand'
export type ProductVisualNeed = 'critical' | 'useful' | 'optional'
export type MessageCompressionNeed = 'low' | 'medium' | 'high'
export type MarketplaceCommercialPatternHint =
  | 'marketplace-price-punch'
  | 'marketplace-product-hero'
  | 'marketplace-benefit-stack'
  | 'marketplace-compact-offer'
  | 'marketplace-proof-led'
  | 'marketplace-catalog-tile'
export type TemplateReadingFlow =
  | 'header-to-message-to-cta'
  | 'message-to-support-to-cta'
  | 'product-to-message-to-cta'
  | 'message-to-cta'
export type TemplateZonePattern =
  | 'header-panel-top-content-bottom'
  | 'text-led-card-with-support-accent'
  | 'product-support-with-grounded-copy'
  | 'minimal-stack-with-quiet-support'
export type BrandTemplateKey = 'startup-blue' | 'retail-impact' | 'editorial-serene' | 'dark-premium'
export type UserRole = 'owner' | 'editor' | 'viewer'
export type SelectedElement = 'title' | 'subtitle' | 'cta' | 'badge' | 'logo' | 'image'
export type ImageProfile = 'ultraWide' | 'landscape' | 'square' | 'portrait' | 'tall'
export type CtaStyle = 'pill' | 'rounded' | 'sharp'
export type SafeZonePreset = 'compact' | 'balanced' | 'airy'
export type BlockKind = 'headline' | 'subtitle' | 'body' | 'cta' | 'logo' | 'image' | 'badge' | 'price'
export type LayoutElementKind = BlockKind
export type CompositionModelId =
  | 'square-hero-overlay'
  | 'square-balanced-card'
  | 'portrait-hero-overlay'
  | 'portrait-bottom-card'
  | 'landscape-hero-overlay'
  | 'landscape-balanced-split'
  | 'landscape-text-left-image-right'
  | 'display-rectangle-balanced'
  | 'display-rectangle-image-bg'
  | 'leaderboard-compact-horizontal'
  | 'leaderboard-image-accent'
  | 'skyscraper-image-top-stack'
  | 'skyscraper-split-vertical'
  | 'billboard-wide-hero'
  | 'billboard-wide-balanced'
  | 'presentation-clean-hero'
  | 'presentation-structured-cover'
export type LayoutIntentFamily =
  | 'square-hero-overlay'
  | 'square-image-top-text-bottom'
  | 'portrait-hero-overlay'
  | 'portrait-bottom-card'
  | 'landscape-balanced-split'
  | 'landscape-text-left-image-right'
  | 'landscape-image-dominant'
  | 'leaderboard-compact-horizontal'
  | 'display-rectangle-balanced'
  | 'display-rectangle-image-bg'
  | 'skyscraper-image-top-text-stack'
  | 'skyscraper-split-vertical'
  | 'billboard-wide-hero'
  | 'billboard-wide-balanced'
  | 'presentation-clean-hero'
  | 'presentation-structured-cover'

export type FormatFamily =
  | 'square'
  | 'portrait'
  | 'landscape'
  | 'display-rectangle'
  | 'display-skyscraper'
  | 'display-leaderboard'
  | 'billboard'
  | 'flyer'
  | 'poster'
  | 'presentation'

export type Rect = {
  x: number
  y: number
  w: number
  h: number
}

export type TextLayoutRole = 'headline' | 'subtitle' | 'body' | 'cta' | 'badge' | 'price'
export type TextAnchorMode = 'top-left' | 'baseline-left' | 'center'

export type TextLayoutBox = {
  role: TextLayoutRole
  text: string
  lines: string[]
  lineCount: number
  x: number
  y: number
  w: number
  h: number
  top: number
  baseline: number
  fontSize: number
  lineHeight: number
  charsPerLine: number
  maxLines: number
  anchorMode: TextAnchorMode
  rect: Rect
}

export type SceneTextGeometry = {
  headline: TextLayoutBox
  subtitle?: TextLayoutBox
  body?: TextLayoutBox
  cta?: TextLayoutBox
  badge?: TextLayoutBox
  price?: TextLayoutBox
}

export type LayoutBox = {
  id: string
  kind: LayoutElementKind
  rect: Rect
  padding?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  margin?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  zIndex?: number
  locked?: boolean
}

export type BoxCollision = {
  a: string
  b: string
  overlapX: number
  overlapY: number
  area: number
}

export type LayoutBoxMap = {
  boxes: LayoutBox[]
}

export type LayoutDebugOptions = {
  showBoxes: boolean
  showBoxLabels: boolean
  showCollisions: boolean
  showSafeArea?: boolean
}

export type LayoutIssueCode =
  | 'box-collision'
  | 'insufficient-gap'
  | 'out-of-bounds'
  | 'outside-safe-area'

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export type SpacingScale = {
  xxxs: number
  xxs: number
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

export type TypographyRule = {
  minFontSize: number
  maxFontSize: number
  preferredFontSize: number
  minLineHeight: number
  maxLineHeight: number
  preferredLineHeight: number
  maxLines: number
  maxWidth: number
  weight?: number
  letterSpacing?: number
}

export type ElementRule = {
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  preferredW?: number
  preferredH?: number
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  allowedZones?: string[]
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-center' | 'center'
}

export type GridRule = {
  columns: number
  rows: number
  gutterX: number
  gutterY: number
  columnWidth?: number
  rowHeight?: number
}

export type ZoneRule = {
  id: string
  rect: Rect
  role:
    | 'image'
    | 'text'
    | 'cta'
    | 'logo'
    | 'badge'
    | 'price'
    | 'safe'
    | 'overlay'
}

export type BlockSlotRule = {
  block: LayoutElementKind
  required: boolean
  zoneId: string
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  preferredW?: number
  preferredH?: number
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-center' | 'center'
}

export type AllowedOverlapRule = {
  a: LayoutElementKind
  b: LayoutElementKind
  requiresSafeTextArea?: boolean
  protectSubject?: boolean
  minContrast?: number
  maxOverlapRatio?: number
  topCornerOnly?: boolean
}

export type CompositionModel = {
  id: CompositionModelId
  formatId: string
  family: FormatFamily
  description: string
  imageRole:
    | 'hero'
    | 'background'
    | 'framed'
    | 'split-left'
    | 'split-right'
    | 'accent'
  targetBalance: 'compact' | 'balanced' | 'spread'
  zones: ZoneRule[]
  slots: BlockSlotRule[]
  allowedOverlaps?: AllowedOverlapRule[]
  preferredSplitRatio?: [number, number]
  allowedTextAlignment: Array<'left' | 'center'>
  allowedCtaModes: Array<'quiet' | 'standard' | 'strong'>
  minImageCoverage: number
  maxImageCoverage: number
  minTextCoverage: number
  maxTextCoverage: number
}

export type FormatRuleSet = {
  id: string
  label: string
  family: FormatFamily
  width: number
  height: number
  safeArea: Rect
  outerMargins: {
    top: number
    right: number
    bottom: number
    left: number
  }
  spacing: SpacingScale
  grid: GridRule
  allowedLayoutFamilies: LayoutIntentFamily[]
  zones: ZoneRule[]
  typography: {
    headline: TypographyRule
    subtitle: TypographyRule
    body: TypographyRule
    cta: TypographyRule
    badge?: TypographyRule
    price?: TypographyRule
  }
  elements: {
    image: ElementRule
    headline: ElementRule
    subtitle: ElementRule
    body: ElementRule
    cta: ElementRule
    logo: ElementRule
    badge?: ElementRule
    price?: ElementRule
  }
  composition: {
    minImageCoverage: number
    maxImageCoverage: number
    minTextCoverage: number
    maxTextCoverage: number
    preferredSplitRatio?: [number, number]
    supportsOverlay: boolean
    supportsImageBackground: boolean
    supportsFramedImage: boolean
    supportsSplitLayout: boolean
    targetBalance: 'compact' | 'balanced' | 'spread'
  }
}

export type SceneElement = {
  x: number
  y: number
  w?: number
  h?: number
  rx?: number
  fit?: string
  focalX?: number
  focalY?: number
  fontSize?: number
  charsPerLine?: number
  maxLines?: number
  weight?: number
  /** When set, preview may prefer this over global brand font. */
  fontFamily?: string
  bg?: string
  fill?: string
  text?: string
  opacity?: number
  bgOpacity?: number
  measurementHint?: 'proof-dense'
  sourceTextLength?: number
  normalizedTextLength?: number
  realizationFallback?: 'proof-compact'
  /** Hero image zoom (>1) applied around bbox center after slice math (e.g. post AI review). */
  imageZoom?: number
  /** CSS color for image frame border in preview (e.g. rgba). */
  strokeColor?: string
}

export type Scene = {
  background: [string, string, string]
  accent: string
  chip?: string
  overlayStrength?: number
  title: SceneElement
  subtitle: SceneElement
  cta: SceneElement
  badge: SceneElement
  logo: SceneElement
  image: SceneElement
}

export type User = {
  id: string
  email: string
  displayName: string
  role: UserRole
  createdAt: string
}

export type ProjectAssetRole = 'main-image' | 'logo' | 'reference' | 'support-image' | 'icon'

export type ProjectAsset = {
  id: string
  role: ProjectAssetRole
  url: string
  mimeType?: string
  width?: number
  height?: number
  alt?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, string | number | boolean>
}

/**
 * Backend-facing domain records (future API/persistence layer).
 * These types are additive and do not change the existing UI `Project` model yet.
 */
export type UserRecord = {
  id: string
  email: string
  passwordHash: string
  createdAt: string
  updatedAt: string
}

export type ProjectRecord = {
  id: string
  userId: string
  name: string
  brandKitId?: string
  selectedFormatIds: string[]
  assetIds: string[]
  contentBlockIds: string[]
  activeVariantId?: string
  versionIds: string[]
  createdAt: string
  updatedAt: string
}

export type ProjectAssetRecord = {
  id: string
  projectId: string
  role: 'main-image' | 'logo' | 'secondary-image' | 'reference'
  mimeType: string
  width?: number
  height?: number
  sourceUrl: string
  analysisMetadata?: Record<string, unknown>
  createdAt: string
}

export type ContentBlockRecord = {
  id: string
  projectId: string
  role: 'headline' | 'subtitle' | 'body' | 'cta' | 'badge' | 'price'
  text: string
  createdAt: string
  updatedAt: string
}

export type BrandKitRecord = {
  id: string
  projectId?: string
  name: string
  primaryColor: string
  secondaryColor?: string
  accentColor?: string
  neutralDark?: string
  neutralLight?: string
  fontHeadline?: string
  fontBody?: string
  logoAssetId?: string
  ctaStyle?: 'quiet' | 'standard' | 'strong'
  tone?: 'clean' | 'bold' | 'premium' | 'editorial'
}

export type ContentBlockRole = 'headline' | 'subtitle' | 'body' | 'cta' | 'badge' | 'price'

export type ContentBlock = {
  id: string
  role: ContentBlockRole
  text: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type ManualBlockOverride = {
  x?: number
  y?: number
  w?: number
  h?: number
  fit?: string
  rx?: number
  fontSize?: number
  charsPerLine?: number
  maxLines?: number
  bg?: string
  fill?: string
  opacity?: number
  bgOpacity?: number
  strokeColor?: string
}

export type ImageRolePreset = 'hero' | 'background' | 'framed' | 'split-left' | 'split-right' | 'accent'

export type VariantManualOverride = {
  blocks?: Partial<Record<LayoutElementKind, ManualBlockOverride>> & {
    /** Convenience alias for `headline` (maps to scene `title`) */
    title?: ManualBlockOverride
  }
  selectedLayoutFamily?: LayoutIntentFamily
  imageRolePreset?: ImageRolePreset
  updatedAt: string
}

export type VariantManualOverrideItem = {
  blockId: string
  kind:
    | 'move'
    | 'resize'
    | 'text-edit'
    | 'crop'
    | 'role-change'
    | 'family-change'
    | 'model-change'
    | 'padding-change'
  payload: unknown
}

/** Output of `evaluateLayout` — pure metrics from scene geometry in percent space (0–100). */
export type LayoutEvaluation = {
  hierarchyClarity: number
  visualBalance: number
  readability: number
  structuralValidity: boolean
  overallScore: number
  issues: string[]
  /** Normalized visual weight per quadrant (sums to ~1). */
  quadrantWeights?: {
    topLeft: number
    topRight: number
    bottomLeft: number
    bottomRight: number
  }
}

export type Variant = {
  id: string
  formatKey: FormatKey
  formatFamily: FormatFamily
  scene: Scene
  layoutIntentFamily?: LayoutIntentFamily
  compositionModelId?: CompositionModelId
  layoutBoxes?: LayoutBoxMap
  analysis?: LayoutAnalysis
  fixSession?: FixSessionState
  manualOverride?: VariantManualOverride
  structuralState?: StructuralLayoutState
  updatedAt: string
  /** Populated when the variant scene was built via deterministic variant pipeline. */
  archetypeResolution?: ArchetypeResolution & {
    fallbackApplied?: boolean
    effectiveArchetypeId?: LayoutArchetypeId
  }
  /** From `evaluateLayout` on the final built scene (deterministic pipeline). */
  layoutEvaluation?: LayoutEvaluation
}

export type ExportJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export type ExportJob = {
  id: string
  projectId: string
  formatKeys: FormatKey[]
  kind: 'png' | 'jpg' | 'pdf' | 'zip'
  status: ExportJobStatus
  createdAt: string
  updatedAt: string
  outputName?: string
  error?: string
}

export type LayoutPreset = {
  id: string
  label: string
  family: LayoutFamily
  description: string
  featured: boolean
  styleBias?: VisualSystemKey[]
  elements: Partial<Record<SelectedElement, Partial<SceneElement>>>
}

export type FormatDefinition = {
  key: FormatKey
  name: string
  width: number
  height: number
  label: string
  category: 'social' | 'display' | 'marketplace' | 'print' | 'presentation'
  family: LayoutFamily
  packTags: GoalKey[]
  scopeStage: ProductScopeStage
  primaryGenerationMode: PrimaryGenerationMode
}

export type GoalPreset = {
  key: GoalKey
  label: string
  description: string
  includedFormats: FormatKey[]
  scopeStage?: ProductScopeStage
}

export type MarketplaceCardTemplateSuitability = {
  noImage: TemplateSupportLevel
  imageBacked: TemplateSupportLevel
  shortCopy: TemplateSupportLevel
  denseCopy: TemplateSupportLevel
  compactCtaFlow: TemplateSupportLevel
}

export type MarketplaceCardTemplateZoneIntent = {
  zoneId: string
  purpose:
    | 'support-panel'
    | 'product-support'
    | 'message-cluster'
    | 'cta-lane'
    | 'brand-anchor'
    | 'promo-chip'
  roles: Array<'headline' | 'subtitle' | 'cta' | 'logo' | 'badge' | 'image'>
  guidance: string
}

export type MarketplaceCardTemplateRuntimeHints = {
  family: LayoutIntentFamily
  structuralArchetype: StructuralArchetype
  balanceRegime: BalanceRegime
  occupancyMode: OccupancyMode
  imageMode: LayoutIntent['imageMode']
  textMode: LayoutIntent['textMode']
  balanceMode: LayoutIntent['balanceMode']
  mode: LayoutIntent['mode']
  fallbackArchetypes?: StructuralArchetype[]
}

export type MarketplaceCardTemplateDefinition = {
  id: MarketplaceCardTemplateId
  displayName: string
  description: string
  supportedFormats: Array<'marketplace-card'>
  solves: string
  bestFor: string
  suitability: MarketplaceCardTemplateSuitability
  primaryCompositionPattern: TemplateZonePattern
  visualHierarchy: string
  textImageRelationship: string
  ctaPolicy: {
    placement: 'message-footer' | 'message-inline' | 'bottom-lane'
    emphasis: 'quiet' | 'standard' | 'strong'
    notes: string
  }
  imagePolicy: {
    role: 'support-panel' | 'support-accent' | 'product-anchor' | 'optional-accent'
    notes: string
  }
  contentBehavior: TemplateContentBehavior
  readingFlow: TemplateReadingFlow
  commercialRole?: MarketplaceCommercialPatternHint
  supportedSellingAngles?: SellingAngle[]
  preferredCopyDensity?: Array<'short' | 'balanced' | 'dense'>
  preferredConversionActions?: PrimaryConversionAction[]
  proofRole?: ProofPresence[]
  heroElement?: 'headline' | 'image' | 'offer' | 'proof' | 'cta'
  demotionConditions?: string[]
  zones: MarketplaceCardTemplateZoneIntent[]
  runtimeHints: MarketplaceCardTemplateRuntimeHints
  visualIntentNotes?: string[]
  debugNotes?: string[]
}

export type MarketplaceCardTemplateSelectionReasonCode =
  | 'no-image'
  | 'image-backed'
  | 'short-copy'
  | 'dense-copy'
  | 'text-dominant-message'
  | 'product-support'
  | 'compact-cta-flow'
  | 'minimal-copy-fit'
  | 'promo-default'
  | 'selling-angle-match'
  | 'commercial-pattern-match'
  | 'strong-offer'
  | 'proof-led'
  | 'product-visual-critical'
  | 'high-compression'

export type MarketplaceCardTemplateSelectionInputProfile = {
  hasRealImage: boolean
  imageRegime: 'no-image' | 'image-backed'
  imageProfile?: ImageProfile
  copyDensity: 'short' | 'balanced' | 'dense'
  preferredMessageMode: ContentProfile['preferredMessageMode']
  messageType: ContentProfile['messageType']
  promoIntensity: ContentProfile['promoIntensity']
  sellingAngle: ContentProfile['sellingAngle']
  primaryConversionAction: ContentProfile['primaryConversionAction']
  offerStrength: ContentProfile['offerStrength']
  proofPresence: ContentProfile['proofPresence']
  productVisualNeed: ContentProfile['productVisualNeed']
  messageCompressionNeed: ContentProfile['messageCompressionNeed']
  marketplaceCommercialHint: ContentProfile['marketplaceCommercialHint']
  ctaFlow: 'none' | 'compact' | 'standard' | 'strong'
  subtitlePresent: boolean
  badgePresent: boolean
  logoPresent: boolean
  ctaPresent: boolean
}

export type MarketplaceCardTemplateSelectionResult = {
  selectedTemplateId: MarketplaceCardTemplateId
  alternativeTemplateIds: MarketplaceCardTemplateId[]
  reasonCodes: MarketplaceCardTemplateSelectionReasonCode[]
  decisionSummary: string
  inputProfile: MarketplaceCardTemplateSelectionInputProfile
  debug?: {
    rankedTemplates: Array<{
      templateId: MarketplaceCardTemplateId
      totalScore: number
      positiveFactors: string[]
      penalties: string[]
      reasonCodes: MarketplaceCardTemplateSelectionReasonCode[]
    }>
  }
}

export type MarketplaceCardTemplateZoneStructure = {
  image: Rect
  text: Rect
  cta: Rect
  logo: Rect
  badge: Rect
}

export type VisualSystem = {
  key: VisualSystemKey
  label: string
  description: string
  mood: string
  titleWeight: number
  subtitleOpacity: number
  imageTreatment: 'soft' | 'immersive' | 'clean'
}

export type BrandKit = {
  name: string
  primaryColor: string
  accentColor: string
  background: [string, string, string]
  fontFamily: string
  toneOfVoice: string
  ctaStyle: CtaStyle
  safeZone: SafeZonePreset
}

export type AssetHint = {
  imageProfile?: ImageProfile
  detectedContrast?: 'low' | 'medium' | 'high'
  focalSuggestion?: 'center' | 'top' | 'left' | 'right'
  enhancedImage?: EnhancedImageAnalysis
}

export type CreativeInput = {
  headline?: string
  subtitle?: string
  body?: string
  cta?: string
  badge?: string
  price?: string
}

export type ImageAsset = {
  url: string
  width?: number
  height?: number
}

export type AIContentAnalysis = {
  messageType: 'promo' | 'product' | 'editorial' | 'luxury' | 'corporate'
  promoIntensity: 'low' | 'medium' | 'high'
  tone: 'bold' | 'clean' | 'premium' | 'soft' | 'aggressive'
  ctaImportance: 'low' | 'medium' | 'high'
  textDensity: 'light' | 'balanced' | 'dense'
  offerDetected: boolean
  semanticType: 'promo' | 'product' | 'editorial' | 'luxury' | 'corporate'
  headlineTone: 'direct' | 'soft' | 'premium' | 'aggressive'
  needsStrongCTA: boolean
  needsOfferDominance: boolean
  sellingAngle: SellingAngle
  primaryConversionAction: PrimaryConversionAction
  offerStrength: OfferStrength
  proofPresence: ProofPresence
  productVisualNeed: ProductVisualNeed
  messageCompressionNeed: MessageCompressionNeed
  marketplaceCommercialHint: MarketplaceCommercialPatternHint
}

export type EnhancedImageArea = {
  x: number
  y: number
  w: number
  h: number
  score: number
}

export type EnhancedImageAnalysis = {
  focalPoint: { x: number; y: number }
  subjectBox?: { x: number; y: number; w: number; h: number }
  safeTextAreas: EnhancedImageArea[]
  visualMassCenter: { x: number; y: number }
  brightnessMap: Array<{ x: number; y: number; score: number }>
  contrastZones: EnhancedImageArea[]
  dominantColors: string[]
  mood: 'light' | 'dark' | 'neutral'
  cropRisk: 'low' | 'medium' | 'high'
  imageProfile: ImageProfile
  detectedContrast: 'low' | 'medium' | 'high'
  focalSuggestion: 'center' | 'top' | 'left' | 'right'
}

export type BrandTemplate = {
  key: BrandTemplateKey
  label: string
  description: string
  brandKit: BrandKit
}

export type ProjectVersion = {
  id: string
  name: string
  createdAt: string
  note: string
  project: Project
}

export type Project = {
  id?: string
  template: TemplateKey
  goal: GoalKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  master: Scene
  formats: Record<FormatKey, Scene>
  contentBlocks?: ContentBlock[]
  assets?: ProjectAsset[]
  variants?: Partial<Record<FormatKey, Variant>>
  activeVariantKey?: FormatKey
  manualOverrides?: Partial<Record<FormatKey, VariantManualOverride>>
  fixHistory?: Partial<Record<FormatKey, FixResult[]>>
  updatedAt?: string
  assetHint?: AssetHint
}

export type LayoutIssue = {
  code: string
  severity: IssueSeverity
  message: string
  suggestedFix?: string
  level?: 'ok' | 'warning' | 'error'
  text?: string
  meta?: Record<string, unknown>
}

export type StructuralLayoutStatus = 'valid' | 'degraded' | 'invalid'
export type StructuralInvariantName =
  | 'major-overlap'
  | 'minimum-spacing'
  | 'safe-area-compliance'
  | 'text-size-sanity'
  | 'image-dominance-sanity'
  | 'structural-occupancy'
  | 'role-placement'

export type StructuralInvariantSeverity = 'low' | 'medium' | 'high'

export type StructuralLayoutFinding = {
  name: StructuralInvariantName
  severity: StructuralInvariantSeverity
  message: string
  elements: LayoutElementKind[]
  metrics?: Record<string, number>
}

export type StructuralLayoutState = {
  status: StructuralLayoutStatus
  findings: StructuralLayoutFinding[]
  metrics: {
    overlapCount: number
    spacingViolationCount: number
    safeAreaViolationCount: number
    textClusterCoverage: number
    occupiedSafeArea: number
    imageCoverage: number
  }
}

export type VisualAssessmentBand = 'strong' | 'acceptable' | 'weak' | 'poor'

export type VisualAssessmentBreakdown = {
  focusHierarchy: number
  compositionBalance: number
  textImageHarmony: number
  ctaQuality: number
  negativeSpaceQuality: number
  coherence: number
}

export type VisualAssessment = {
  overallScore: number
  band: VisualAssessmentBand
  breakdown: VisualAssessmentBreakdown
  warnings: string[]
  strengths: string[]
  debug?: Record<string, unknown>
}

export type PerceptualSignals = {
  hasClearPrimary: boolean
  primaryElement: 'image' | 'headline' | 'cta' | 'none'
  clusterCohesion: number
  ctaIntegration: number
  visualBalance: number
  deadSpaceScore: number
  imageDominance: number
  textDominance: number
  readingFlowClarity: number
}

export type LayoutQualityMetrics = {
  readability: number
  contrast: number
  textHierarchy: number
  visualBalance: number
  spacingQuality: number
  ctaProminence: number
  logoPlacement: number
  imageTextHarmony: number
  negativeSpaceBalance: number
  clusterCohesion: number
  ratioSuitability: number
  overlayHeaviness: number
  textRhythm: number
  lineBreakQuality: number
  scaleToCanvas: number
}

export type FormatSpecificMetrics = {
  widthUsage?: number
  verticalBalance?: number
  horizontalSpread?: number
  printDiscipline?: number
  billboardScale?: number
  displayDensityControl?: number
  slideComposure?: number
}

export type LayoutAssessment = {
  score: number
  verdict: string
  issues: LayoutIssue[]
  recommendedFixes?: FixAction[]
  metrics?: LayoutQualityMetrics
  formatSpecificMetrics?: FormatSpecificMetrics
  formatFamily?: FormatFamily
  layoutAnalysis?: LayoutAnalysis
  layoutBoxes?: LayoutBoxMap
  collisions?: BoxCollision[]
  spacingViolations?: BoxCollision[]
  aiReview?: AILayoutReview
  compositionModelId?: CompositionModelId
  compositionZones?: ZoneRule[]
  structuralState?: StructuralLayoutState
  visual?: VisualAssessment
  perceptual?: PerceptualSignals
}

export type BaseBlockAnalysis = {
  blockId: string
  role: string
  score: number
  issues: string[]
  suggestedFixes: string[]
}

export type TextBlockAnalysis = BaseBlockAnalysis & {
  role: 'headline' | 'subtitle' | 'body' | 'badge' | 'price'
  metrics: {
    readability: number
    lineBreakQuality: number
    hierarchyStrength: number
    widthFit: number
    density: number
    breathingRoom: number
    scaleToFormat: number
  }
}

export type CtaAnalysis = BaseBlockAnalysis & {
  role: 'cta'
  metrics: {
    prominence: number
    readability: number
    spacing: number
    edgeSafety: number
    clusterIntegration: number
    actionClarity: number
  }
}

export type LogoAnalysis = BaseBlockAnalysis & {
  role: 'logo'
  metrics: {
    anchorStrength: number
    scaleFit: number
    spacing: number
    hierarchyInterference: number
    zoneValidity: number
  }
}

export type ImageBlockAnalysis = BaseBlockAnalysis & {
  role: 'image'
  metrics: {
    cropQuality: number
    focalPreservation: number
    footprintSuitability: number
    formatFit: number
    visualRoleStrength: number
    compositionIntegration: number
    shapeSuitability: number
  }
}

export type TextClusterAnalysis = {
  score: number
  issues: string[]
  suggestedFixes: string[]
  metrics: {
    cohesion: number
    rhythm: number
    hierarchy: number
    spacing: number
    verticalFlow: number
    horizontalFlow: number
  }
}

export type ImageTextRelationshipAnalysis = {
  score: number
  issues: string[]
  suggestedFixes: string[]
  metrics: {
    integration: number
    balance: number
    spacing: number
    dominanceFit: number
    splitQuality: number
    proximity: number
  }
}

export type GlobalLayoutAnalysis = {
  score: number
  issues: string[]
  suggestedFixes: string[]
  metrics: {
    visualBalance: number
    negativeSpaceUse: number
    formatSuitability: number
    scaleToCanvas: number
    campaignConsistency: number
    deadSpacePenalty: number
  }
}

export type LayoutAnalysis = {
  blocks: {
    headline?: TextBlockAnalysis
    subtitle?: TextBlockAnalysis
    body?: TextBlockAnalysis
    badge?: TextBlockAnalysis
    price?: TextBlockAnalysis
    cta?: CtaAnalysis
    logo?: LogoAnalysis
    image?: ImageBlockAnalysis
  }
  clusters: {
    textCluster?: TextClusterAnalysis
    imageText?: ImageTextRelationshipAnalysis
  }
  global: GlobalLayoutAnalysis
  overallScore: number
  effectiveScore: number
  prioritizedIssues: string[]
}

export type ScenarioKey =
  | 'short-promo'
  | 'text-heavy-ad'
  | 'luxury-minimal'
  | 'editorial-story'
  | 'bold-offer'
  | 'product-card'

export type EnhancedContentProfile = {
  headlineLength: number
  subtitleLength: number
  bodyLength: number
  ctaLength: number
  badgeLength: number
  priceLength: number
  density: 'light' | 'balanced' | 'dense'
  textWeight: number
  hasOffer: boolean
  offerWeight: number
  preferredMessageMode: 'image-first' | 'text-first' | 'balanced'
  messageType: AIContentAnalysis['messageType']
  promoIntensity: AIContentAnalysis['promoIntensity']
  tone: AIContentAnalysis['tone']
  ctaImportance: AIContentAnalysis['ctaImportance']
  semanticType: AIContentAnalysis['semanticType']
  headlineTone: AIContentAnalysis['headlineTone']
  needsStrongCTA: boolean
  needsOfferDominance: boolean
  sellingAngle: AIContentAnalysis['sellingAngle']
  primaryConversionAction: AIContentAnalysis['primaryConversionAction']
  offerStrength: AIContentAnalysis['offerStrength']
  proofPresence: AIContentAnalysis['proofPresence']
  productVisualNeed: AIContentAnalysis['productVisualNeed']
  messageCompressionNeed: AIContentAnalysis['messageCompressionNeed']
  marketplaceCommercialHint: AIContentAnalysis['marketplaceCommercialHint']
}

export type ContentProfile = EnhancedContentProfile

export type PalettePlan = {
  background: [string, string, string]
  surface: string
  textPrimary: string
  textSecondary: string
  accent: string
  ctaBackground: string
  ctaText: string
  badgeBackground: string
  badgeText: string
  overlayStrength: number
}

export type TypographyPlan = {
  titleSize: number
  titleWeight: number
  titleWidth: number
  titleCharsPerLine: number
  titleMaxLines: number
  subtitleSize: number
  subtitleWidth: number
  subtitleCharsPerLine: number
  subtitleMaxLines: number
  subtitleOpacity: number
  ctaSize: number
  badgeSize: number
  lineHeightTitle: number
  lineHeightSubtitle: number
  alignment: 'left' | 'center'
  bodySize?: number
  bodyWidth?: number
  targetTitleLines?: number
  targetSubtitleLines?: number
  overlayStrengthBias?: number
}

export type StructuralArchetype =
  | 'text-stack'
  | 'image-hero'
  | 'split-vertical'
  | 'split-horizontal'
  | 'overlay-balanced'
  | 'compact-minimal'
  | 'dense-information'

export type LayoutArchetypeId =
  | StructuralArchetype
  | MarketplaceV2ArchetypeId
  | MarketplaceTemplateVariant

export interface ArchetypeResolution {
  archetypeId: LayoutArchetypeId
  confidence: number
  reason: string
  fallback?: LayoutArchetypeId
  /** Deduction amounts per signal (populated by `resolveArchetype`). */
  confidenceBreakdown?: {
    archetypeSource: number
    scenarioAmbiguity: number
    missingImageData: number
    formatMismatch: number
  }
}

/** Archetype diagnostic block written on each variant when exporting a project as JSON. */
export type CreativeArchetypeExport = {
  id: string
  confidence: number | null
  fallbackUsed: boolean
  reason: string | null
  breakdown: NonNullable<ArchetypeResolution['confidenceBreakdown']> | null
}

export type BalanceRegime = 'text-first' | 'image-first' | 'balanced' | 'minimal-copy' | 'dense-copy'
export type OccupancyMode = 'spacious' | 'balanced' | 'compact' | 'text-safe' | 'visual-first'
export type StructuralFlowDirection = 'vertical' | 'horizontal' | 'overlay'

export type StructuralSignature = {
  archetype: StructuralArchetype
  flowDirection: StructuralFlowDirection
  textZone: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'overlay'
  imageZone: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'background'
  textWeight: number
  imageWeight: number
  overlay: boolean
  balanceRegime: BalanceRegime
  occupancyMode: OccupancyMode
}

export type LayoutIntent = {
  family: LayoutIntentFamily
  compositionModelId?: CompositionModelId
  /** When `v2-slot` and `VITE_MARKETPLACE_LAYOUT_V2=true`, card/tile use slot synthesis instead of pack/repair. */
  marketplaceLayoutEngine?: MarketplaceLayoutEngineMode
  marketplaceV2Archetype?: MarketplaceV2ArchetypeId
  marketplaceTemplateId?: MarketplaceCardTemplateId
  marketplaceTemplateVariant?: MarketplaceTemplateVariant
  marketplaceTemplateSelection?: MarketplaceCardTemplateSelectionResult
  marketplaceTemplateZones?: MarketplaceCardTemplateZoneStructure
  marketplaceTemplateSummary?: string
  imageMode: 'background' | 'hero' | 'split-right' | 'split-left' | 'framed'
  textMode: 'cluster-left' | 'cluster-bottom' | 'overlay' | 'centered'
  balanceMode: 'image-dominant' | 'balanced' | 'text-dominant'
  tension: 'calm' | 'promo' | 'editorial' | 'premium'
  sourceFamily?: LayoutFamily
  presetId?: string
  mode: 'image-first' | 'text-first' | 'split' | 'framed' | 'overlay'
  structuralArchetype?: StructuralArchetype
  balanceRegime?: BalanceRegime
  occupancyMode?: OccupancyMode
}

export type LayoutStrategy = LayoutIntent

export type LayoutBlock = {
  id: string
  kind: BlockKind
  priority: number
  intrinsicSize: {
    minW: number
    minH: number
    idealW?: number
    idealH?: number
  }
  contentLength?: number
  region?: { x: number; y: number; w: number; h: number }
  anchorPreference?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-center' | 'center'
  canOverlayImage?: boolean
  keepAwayFrom?: BlockKind[]
}

export type AILayoutReview = {
  score: number
  issues: string[]
  recommendations: string[]
  likelyRootCauses?: string[]
  likelyRootCause?: string[]
}

export type AIFixStrategy = {
  changeLayoutFamily?: boolean
  suggestedFamily?: LayoutIntentFamily
  increaseHeadlineProminence?: boolean
  strengthenCTA?: boolean
  reduceOverlay?: boolean
  rebalanceImageText?: boolean
  widenTextContainer?: boolean
  increaseImagePresence?: boolean
  reduceDeadSpace?: boolean
  moveTextCluster?: 'up' | 'left' | 'center'
  reflowHeadline?: boolean
  improveLogoAnchoring?: boolean
}

export type BlockFixSuggestion = {
  target:
    | 'headline'
    | 'subtitle'
    | 'body'
    | 'cta'
    | 'logo'
    | 'badge'
    | 'price'
    | 'image'
    | 'textCluster'
    | 'imageText'
    | 'global'
  actions: string[]
  priority: number
}

export type LayoutFixPlan = {
  blockFixes: BlockFixSuggestion[]
  requiresStructuralRebuild: boolean
  suggestedLayoutFamily?: string
}

export type FixAction =
  | 'increase-headline-size'
  | 'reduce-headline-size'
  | 'reflow-headline'
  | 'rebalance-text-cluster'
  | 'increase-cta-prominence'
  | 'move-cta-closer-to-text'
  | 'increase-image-presence'
  | 'reduce-image-presence'
  | 'recompute-image-crop'
  | 'change-image-anchor'
  | 'change-image-shape'
  | 'switch-image-role'
  | 'reduce-dead-space'
  | 'change-layout-family'
  | 'lighten-overlay'
  | 'darken-overlay'
  | 'widen-text-container'
  | 'narrow-text-container'
  | 'move-logo-to-anchor'
  | 'increase-cluster-padding'
  | 'improve-line-breaks'
  | 'switch-to-text-first'
  | 'switch-to-image-first'
  | 'raise-text-cluster'
  | 'rebalance-split-ratio'
  | 'expand-text-region'
  | 'compress-text-region'
  | 'increase-scale-to-canvas'
  | 'boost-contrast'
  | 'expand-spacing'
  | 'expand-title'
  | 'compress-title'
  | 'compress-subtitle'
  | 'promote-cta'
  | 'promote-offer'
  | 'switch-layout'
  | 'reduce-image-dominance'
  | 'increase-image-dominance'

export type FixCandidate = {
  scene: Scene
  plan?: LayoutFixPlan
  analysis?: LayoutAnalysis
  actions: FixAction[]
  deterministicScore: number
  aiReviewScore?: number
  effectiveScore: number
  issues: LayoutIssue[]
  strategyLabel: string
  assessment?: LayoutAssessment
  scoreTrust?: ScoreTrust
  criticalIssueCount?: number
  highIssueCount?: number
  collisionArea?: number
  repairEvaluation?: RepairCandidateEvaluation
}

export type FixActionRule = {
  action: FixAction
  allowedWhen?: string[]
  forbiddenWhen?: string[]
  requiresReflow?: boolean
  requiresRegionRebuild?: boolean
  requiresCropRecompute?: boolean
  requiresRelationshipRebuild?: boolean
}

export type RejectedFixAction = {
  action: FixAction
  reason: string
}

export type FixSessionState = {
  iteration: number
  previousScores: number[]
  effectiveScores: number[]
  unresolvedBlockIssues: string[]
  unresolvedClusterIssues: string[]
  unresolvedGlobalIssues: string[]
  actionsApplied: FixAction[]
  failedStrategies: string[]
  rejectedActions?: RejectedFixAction[]
  unresolvedIssues: string[]
  converged: boolean
  canFixAgain: boolean
  currentFormatFamily: FormatFamily
  failedAttemptSignatures?: string[]
  recentOutcomeSignatures?: string[]
  lastSceneSignature?: string
}

export type ScoreTrust = {
  deterministicScore: number
  aiReviewScore: number
  disagreement: number
  effectiveScore: number
  needsHumanAttention: boolean
}

export type RepairCandidateKind =
  | 'baseline'
  | 'local-structural-repair'
  | 'stronger-local-structural-repair'
  | 'perceptual-rebalance-repair'
  | 'spacing-recovery-repair'
  | 'image-balance-repair'
  | 'combined-repair'
  | 'guided-regeneration-repair'
  | 'validated-run-autofix'

export type RepairAspectMode = 'square' | 'landscape' | 'portrait'

export type RepairObjectiveWeights = {
  structuralValidity: number
  perceptualQuality: number
  commercialStrength: number
  familyFidelity: number
  sideEffectCost: number
}

export type RepairPerceptualSubweights = {
  cluster: number
  cta: number
  balance: number
  deadSpaceQuality: number
  readingFlow: number
  overall: number
}

export type RepairSideEffectSubweights = {
  disagreement: number
  deadSpace: number
  unresolved: number
  high: number
  critical: number
  geometry: number
  clusterRegression: number
  balanceRegression: number
  readingFlowRegression: number
  ctaDisconnectRegression: number
  verticalSeparationRegression: number
  inactiveSideRegression: number
}

export type RepairObjectiveProfile = {
  weights: RepairObjectiveWeights
  perceptualWeights: RepairPerceptualSubweights
  sideEffectWeights: RepairSideEffectSubweights
}

export type RepairObjectiveProfileOverride = {
  weights?: Partial<RepairObjectiveWeights>
  perceptualWeights?: Partial<RepairPerceptualSubweights>
  sideEffectWeights?: Partial<RepairSideEffectSubweights>
}

export type RepairObjectiveThresholds = {
  minAggregateGain: number
  maxConfidenceRegression: number
  maxSpacingViolationIncrease: number
  maxSpacingGapDeficitIncrease: number
  allowRolePlacement: boolean
  softPlacementPenalty: {
    mild: number
    moderate: number
    severe: number
  }
  softPlacementPassMaxSeverity: 'mild' | 'moderate'
}

export type RepairSearchConfig = {
  candidateBudget: number
  combinationBudget: number
  enableLandscapeTextHeightNearMissOverride: boolean
  thresholds: RepairObjectiveThresholds
  profiles: Record<RepairAspectMode, RepairObjectiveProfile>
  familyProfiles: Partial<Record<FormatFamily, RepairObjectiveProfileOverride>>
}

export type RepairSearchConfigOverride = {
  candidateBudget?: number
  combinationBudget?: number
  enableLandscapeTextHeightNearMissOverride?: boolean
  thresholds?: Partial<RepairObjectiveThresholds>
  profiles?: Partial<Record<RepairAspectMode, RepairObjectiveProfileOverride>>
  familyProfiles?: Partial<Record<FormatFamily, RepairObjectiveProfileOverride>>
}

export type RepairObjectiveBreakdown = {
  structuralValidity: number
  perceptualQuality: number
  commercialStrength: number
  familyFidelity: number
  sideEffectCost: number
  aggregateScore: number
  weights: RepairObjectiveWeights
}

export type PlacementViolationSeverity = 'none' | 'mild' | 'moderate' | 'severe'

export type PlacementViolationRole =
  | 'text'
  | 'cta'
  | 'image'
  | 'logo'
  | 'badge'
  | 'price'
  | 'multiple'
  | 'unknown'

export type PlacementViolationDiagnostics = {
  role: PlacementViolationRole
  violatingRoles: PlacementViolationRole[]
  preferredZoneDistance: number
  allowedZoneDistance: number
  avgAllowedDistance: number
  avgPreferredDistance: number
  clusterIntegrity: number
  visualHierarchyPreserved: boolean
  likelyIntentional: boolean
  badgeSemanticallyActive: boolean
  badgeVisuallyCritical: boolean
  badgeAffectsCoreReadingFlow: boolean
  badgeLikelyOptional: boolean
  severity: PlacementViolationSeverity
  reasons: string[]
  perRole: Array<{
    role: PlacementViolationRole
    eligible: boolean
    eligibilityReason: string | null
    allowedDistance: number
    preferredDistance: number
    rect: Rect | null
    allowedZones: Rect[]
    preferredZones: Rect[]
    allowedZonesCount: number
    preferredZonesCount: number
    zonePaddingApplied: number
  }>
  skippedRoles: Array<{
    role: PlacementViolationRole
    reason: string
  }>
  textBoxes: {
    titleRect: Rect
    subtitleRect: Rect
    combinedBoundsRect: Rect
  }
  textCluster?: {
    titlePlacementDistance: number
    titlePreferredDistance: number
    combinedAllowedDistance: number
    combinedPreferredDistance: number
    rawCtaToCombinedTextDistance: number
    adjustedCtaToCombinedTextDistance: number
    subtitleAttachmentDistance: number
    subtitleAttachmentQuality: number
    combinedClusterFootprint: number
    subtitleInflationContribution: number
    titlePrimaryAnchorWeight: number
    subtitleSecondaryMassWeight: number
    titleDominatesMainTextPlacement: boolean
    subtitleDetached: boolean
    ctaCollisionPersistsAfterSubtitleAdjustment: boolean
    severeDrivenByCombinedClusterOnly: boolean
    wouldBecomeMilderUnderAttachmentAwarePolicy: boolean
    wouldBecomeMilderUnderSquareSubtitleCtaPolicy: boolean
    adjustedTextRect: Rect
    adjustedAllowedDistance: number
    adjustedPreferredDistance: number
  }
  landscapeTextCluster?: {
      titlePlacementDistance: number
      titlePreferredDistance: number
      combinedAllowedDistance: number
      combinedPreferredDistance: number
      rawCombinedMessageAllowedDistance: number
      rawCombinedMessagePreferredDistance: number
      adjustedAllowedDistance: number
      adjustedPreferredDistance: number
      adjustedCtaAllowedDistance: number
      adjustedCtaPreferredDistance: number
      subtitleAttachmentDistance: number
      ctaAttachmentDistance: number
      ctaAnchorDistance: number
      ctaAnchorVerticalGap: number
      ctaAnchorHorizontalOffset: number
      ctaAttachmentSeverity: PlacementViolationSeverity
      ctaWithinSplitLayoutTolerance: boolean
      ctaReadingFlowContinuity: number
      ctaMessageAssociationScore: number
      ctaAnchorWouldBecomeMilder: boolean
      disconnectDrivenPrimarilyByGap: boolean
      disconnectDrivenPrimarilyByHorizontalOffset: boolean
      clusterFootprint: number
      messageClusterHeight: number
      messageClusterWidth: number
      subtitleInflationContribution: number
      subtitleInflatesMainly: boolean
      titlePrimaryAnchorWeight: number
      subtitleSecondaryMassWeight: number
      titleDominatesMainTextPlacement: boolean
      subtitleDetached: boolean
      ctaDetached: boolean
      textImageSplitCoherent: boolean
      messageClusterTooTall: boolean
      messageClusterTooWide: boolean
      severeDrivenByCombinedClusterOnly: boolean
      severeDrivenBySubtitleInflationOnly: boolean
      wouldBecomeMilderUnderAttachmentAwarePolicy: boolean
      wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy: boolean
      wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy: boolean
      titleSubtitleVerticalGap: number
      titleSubtitleHorizontalOffset: number
      titleCtaDistance: number
      subtitleCtaDistance: number
      fullClusterCoherent: boolean
    }
  imagePlacement?: {
    rawAllowedDistance: number
    rawPreferredDistance: number
    adjustedAllowedDistance: number
    adjustedPreferredDistance: number
    splitSideOccupancy: number
    supportsReadingFlow: boolean
    matchesLandscapeSplitPattern: boolean
    structurallyAcceptableFootprint: boolean
    wouldBecomeMilderUnderLandscapeImagePolicy: boolean
  }
}

export type RepairRejectionReason =
  | 'repeat-suppressed'
  | 'legacy-safety-rejection'
  | 'hard-structural-invalidity'
  | 'role-placement-out-of-zone'
  | 'spacing-threshold-exceeded'
  | 'confidence-collapse'
  | 'aggregate-below-baseline'
  | 'no-net-gain'

export type RepairCandidateGateDiagnostics = {
  repeatSuppressed: boolean
  legacySafetyRejected: boolean
  hardStructuralInvalidity: boolean
  rolePlacementOutOfZone: boolean
  spacingThresholdExceeded: boolean
  confidenceCollapse: boolean
  aggregateBelowBaseline: boolean
  noNetGain: boolean
  nearMissOverrideEligible: boolean
  nearMissOverrideBlockedReasons: string[]
  nearMissOverrideSafeguardsSatisfied: boolean
  wouldWinUnderNearMissOverride: boolean
  landscapeTextHeightNearMissEligible: boolean
  landscapeTextHeightNearMissApplied: boolean
  landscapeTextHeightNearMissBlockedReasons: string[]
  landscapeTextHeightNearMissSafeguardsSatisfied: boolean
  landscapeTextHeightNearMissSafeguardResults: LandscapeTextHeightNearMissSafeguardResults
  wouldWinUnderLandscapeTextHeightNearMissOverride: boolean
}

export type LandscapeTextHeightNearMissSafeguardResults = {
  featureEnabled: boolean
  landscapeDisplay: boolean
  bestRejectedCandidate: boolean
  blockerFamilyMatch: boolean
  mildSeverity: boolean
  positiveAggregateDelta: boolean
  nonNegativeConfidenceDelta: boolean
  titleOnlyWouldPass: boolean
  messageClusterWouldPass: boolean
  remainingBlockerWouldBecomeMilder: boolean
  primaryBlockerRolePlacement: boolean
  onlyBlockedByOneGate: boolean
  noLegacySafetyRejection: boolean
  noHardStructuralInvalidity: boolean
  noSpacingCollapse: boolean
  noCriticalOverlap: boolean
  noRoleLoss: boolean
}

export type RepairConfidenceDiagnostics = {
  effectiveScore: number
  disagreement: number
  needsHumanAttention: boolean
}

export type RepairCandidateEvaluation = {
  candidateId: string
  strategyLabel: string
  candidateKind: RepairCandidateKind
  structuralStatus: StructuralLayoutStatus
  effectiveScore: number
  aggregateScore: number
  aggregateDelta: number
  accepted: boolean
  rejectionReasons: RepairRejectionReason[]
  gateOutcomes: RepairCandidateGateDiagnostics
  summaryTags: string[]
  penaltyTags: string[]
  objective: RepairObjectiveBreakdown
  confidence: RepairConfidenceDiagnostics
  confidenceDelta: number
  structuralFindingDelta: number
  placementSeverity: PlacementViolationSeverity
  placementDiagnostics: PlacementViolationDiagnostics
  softPlacementPenalty: number
  adjustedAggregateScore: number
  wouldPassWithSoftPlacement: boolean
  wouldBeatBaselineWithSoftPlacement: boolean
  nearMissOverrideEligible: boolean
  nearMissOverrideReason: string | null
  wouldWinUnderNearMissOverride: boolean
  landscapeTextHeightNearMissEligible: boolean
  landscapeTextHeightNearMissApplied: boolean
  landscapeTextHeightNearMissReason: string | null
  landscapeTextHeightNearMissSafeguardResults: LandscapeTextHeightNearMissSafeguardResults
  landscapeTextHeightNearMissBlockerFamily: string | null
  landscapeTextHeightNearMissBlockerSubtype: string | null
  finalWinnerChangedByOverride: boolean
}

export type RepairTelemetryCandidate = {
  candidateId: string
  strategyLabel: string
  candidateKind: RepairCandidateKind
  structuralStatus: StructuralLayoutStatus
  aggregateScore: number
  aggregateDelta: number
  accepted: boolean
  rejectionReasons: RepairRejectionReason[]
  gateOutcomes: RepairCandidateGateDiagnostics
  summaryTags: string[]
  penaltyTags: string[]
  confidence: RepairConfidenceDiagnostics
  confidenceDelta: number
  placementSeverity: PlacementViolationSeverity
  placementDiagnostics: PlacementViolationDiagnostics
  softPlacementPenalty: number
  adjustedAggregateScore: number
  wouldPassWithSoftPlacement: boolean
  wouldBeatBaselineWithSoftPlacement: boolean
  nearMissOverrideEligible: boolean
  nearMissOverrideReason: string | null
  wouldWinUnderNearMissOverride: boolean
  landscapeTextHeightNearMissEligible: boolean
  landscapeTextHeightNearMissApplied: boolean
  landscapeTextHeightNearMissReason: string | null
  landscapeTextHeightNearMissSafeguardResults: LandscapeTextHeightNearMissSafeguardResults
  landscapeTextHeightNearMissBlockerFamily: string | null
  landscapeTextHeightNearMissBlockerSubtype: string | null
  finalWinnerChangedByOverride: boolean
}

export type RepairSearchTelemetry = {
  formatKey: FormatKey
  formatFamily: FormatFamily
  aspectMode: RepairAspectMode
  baselineCandidateId: string
  baselineAggregateScore: number
  baselineConfidence: RepairConfidenceDiagnostics
  winnerCandidateId: string
  winnerCandidateKind: RepairCandidateKind
  winnerStrategyLabel: string
  winnerAggregateScore: number
  winnerDeltaVsBaseline: number
  winnerConfidence: RepairConfidenceDiagnostics
  winnerConfidenceDelta: number
  baselineWon: boolean
  candidateBudgetUsage: {
    configured: number
    nonBaselineEvaluated: number
    totalEvaluated: number
    remaining: number
    combinationConfigured: number
    combinationEvaluated: number
  }
  dominantTags: string[]
  dominantPenalties: string[]
  candidates: RepairTelemetryCandidate[]
  landscapeTextHeightNearMissExperiment?: {
    enabled: boolean
    eligibleCandidateCount: number
    eligibleCaseCount: number
    appliedOverrideCount: number
    flippedCaseIds: string[]
  }
}

export type RepairCalibrationSnapshot = {
  formatKey: FormatKey
  formatFamily: FormatFamily
  aspectMode: RepairAspectMode
  thresholds: RepairObjectiveThresholds
  objectiveProfile: RepairObjectiveProfile
  baseline: RepairCandidateEvaluation
  winner: RepairCandidateEvaluation
  candidateComparisons: RepairCandidateEvaluation[]
}

export type RepairSelectionDiagnostics = {
  candidateBudget: number
  retainedBaseline: boolean
  baselineCandidateId: string
  winnerCandidateId: string
  winnerStrategyLabel: string
  aspectMode: RepairAspectMode
  thresholds: RepairObjectiveThresholds
  objectiveProfile: RepairObjectiveProfile
  telemetry: RepairSearchTelemetry
  calibration: RepairCalibrationSnapshot
  candidates: RepairCandidateEvaluation[]
}

export type RepairSearchResult = {
  baselineCandidateId: string
  selectedCandidateId: string
  selectedStrategyLabel: string
  retainedBaseline: boolean
  candidates: RepairCandidateEvaluation[]
}

export type RepairFailureType =
  | 'overlap-dominant'
  | 'spacing-dominant'
  | 'safe-area-dominant'
  | 'text-size-dominant'
  | 'image-dominance-dominant'
  | 'occupancy-dominant'
  | 'mixed'

export type FailureClassification = {
  dominantType: RepairFailureType
  weightedFindings: Record<RepairFailureType, number>
  topInvariantNames: StructuralInvariantName[]
  findingCount: number
  highSeverityFindingCount: number
  mixed: boolean
}

export type RepairStrategy = {
  kind: 'local-structural' | 'structural-regeneration'
  candidateKind?: RepairCandidateKind
  label: string
  reason: string
  actions?: FixAction[]
  fixStage?: 'local' | 'regional' | 'structural'
  overrideIntent?: Partial<LayoutIntent>
}

export type RepairResult = {
  accepted: boolean
  strategy: RepairStrategy
  classification: FailureClassification
  beforeStructuralStatus: StructuralLayoutStatus
  afterStructuralStatus: StructuralLayoutStatus
  beforeEffectiveScore: number
  afterEffectiveScore: number
  scoreDelta: number
  findingDelta: number
  rejectionReason?: string
  noOp?: boolean
  suppressedAsRepeat?: boolean
  repeatedWeakOutcome?: boolean
  noOpReasons?: string[]
  attemptSignature?: string
}

export type FixResult = {
  beforeScore: number
  afterScore: number
  effectiveBeforeScore: number
  effectiveAfterScore: number
  actionsApplied: FixAction[]
  actionsRejected: RejectedFixAction[]
  resolvedIssues: string[]
  remainingIssues: string[]
  canFixAgain: boolean
  session: FixSessionState
  scoreTrust: ScoreTrust
  repair?: RepairResult
  /** Set when Fix layout intentionally skipped legacy repair to preserve marketplace V2 slot synthesis. */
  v2SlotLayoutPreserved?: boolean
}

export type SavedProject = {
  id: string
  name: string
  updatedAt: string
  project: Project
  versions: ProjectVersion[]
}

export type ProjectRepository = {
  loadAll: () => SavedProject[]
  save: (existingId: string | null, name: string, project: Project, note: string) => SavedProject[]
  remove: (id: string) => SavedProject[]
}

/** Per-variant layout metrics included in JSON project export. */
export type CreativeEvaluationExport = {
  overallScore: number | null
  structuralValidity: boolean | null
  readability: number | null
  hierarchyClarity: number | null
  visualBalance: number | null
  quadrantWeights: LayoutEvaluation['quadrantWeights'] | null
  issues: string[]
}

/**
 * Shape of the project payload written by JSON export (`buildCreativeExportJSON`).
 * Mirrors `Project` with each variant carrying `archetype` and `evaluation` summaries.
 */
export type CreativeExportJSON = Omit<Project, 'variants'> & {
  variants?: Partial<
    Record<FormatKey, Variant & { archetype: CreativeArchetypeExport; evaluation: CreativeEvaluationExport }>
  >
}
