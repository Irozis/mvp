import { getFormatRuleSet } from './formatRules'
import { getOverlaySafetyPolicy } from './overlayPolicies'
import { FORMAT_MAP } from './presets'
import type {
  AllowedOverlapRule,
  BlockSlotRule,
  CompositionModel,
  CompositionModelId,
  FormatDefinition,
  FormatKey,
  LayoutElementKind,
  LayoutIntentFamily,
} from './types'

function overlapLimit(formatKey: FormatKey, modelId: CompositionModelId, kind: LayoutElementKind, fallback: number) {
  return getOverlaySafetyPolicy(FORMAT_MAP[formatKey], { id: modelId }).maxOverlapByKind[kind] ?? fallback
}

type SlotInput = Omit<BlockSlotRule, 'block' | 'zoneId'> & {
  block: LayoutElementKind
  zoneId: string
}

type ModelSpec = {
  id: CompositionModelId
  description: string
  imageRole: CompositionModel['imageRole']
  targetBalance: CompositionModel['targetBalance']
  zoneIds: string[]
  slots: SlotInput[]
  allowedOverlaps?: AllowedOverlapRule[]
  preferredSplitRatio?: [number, number]
  allowedTextAlignment: Array<'left' | 'center'>
  allowedCtaModes: Array<'quiet' | 'standard' | 'strong'>
  minImageCoverage: number
  maxImageCoverage: number
  minTextCoverage: number
  maxTextCoverage: number
}

export const MODEL_LAYOUT_FAMILY_MAP: Record<CompositionModelId, LayoutIntentFamily> = {
  'square-hero-overlay': 'square-hero-overlay',
  'square-balanced-card': 'square-image-top-text-bottom',
  'portrait-hero-overlay': 'portrait-hero-overlay',
  'portrait-bottom-card': 'portrait-bottom-card',
  'landscape-hero-overlay': 'landscape-image-dominant',
  'landscape-balanced-split': 'landscape-balanced-split',
  'landscape-text-left-image-right': 'landscape-text-left-image-right',
  'display-rectangle-balanced': 'display-rectangle-balanced',
  'display-rectangle-image-bg': 'display-rectangle-image-bg',
  'leaderboard-compact-horizontal': 'leaderboard-compact-horizontal',
  'leaderboard-image-accent': 'leaderboard-compact-horizontal',
  'skyscraper-image-top-stack': 'skyscraper-image-top-text-stack',
  'skyscraper-split-vertical': 'skyscraper-split-vertical',
  'billboard-wide-hero': 'billboard-wide-hero',
  'billboard-wide-balanced': 'billboard-wide-balanced',
  'presentation-clean-hero': 'presentation-clean-hero',
  'presentation-structured-cover': 'presentation-structured-cover',
}

const MODEL_SPECS: Partial<Record<FormatKey, ModelSpec[]>> = {
  'social-square': [
    {
      id: 'square-hero-overlay',
      description: 'Hero square with lower centered overlay cluster and CTA inside the same mass.',
      imageRole: 'hero',
      targetBalance: 'compact',
      zoneIds: ['logo-top-left', 'logo-top-right', 'image-hero-overlay', 'text-overlay-lower-left', 'cta-bottom', 'badge-top-right', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-hero-overlay', required: true, minW: 860, minH: 680, preferredW: 936, preferredH: 748, anchor: 'center' },
        { block: 'headline', zoneId: 'text-overlay-lower-left', required: true, minW: 420, preferredW: 520, maxW: 620, anchor: 'bottom-left' },
        { block: 'subtitle', zoneId: 'text-overlay-lower-left', required: false, minW: 340, preferredW: 500, maxW: 600, anchor: 'bottom-left' },
        { block: 'body', zoneId: 'text-overlay-lower-left', required: false, minW: 320, preferredW: 460, maxW: 560, anchor: 'bottom-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 200, minH: 64, preferredW: 260, preferredH: 72, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 124, minH: 42, preferredW: 154, preferredH: 54, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-right', required: false, minW: 104, minH: 42, preferredW: 140, preferredH: 56, anchor: 'top-right' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 120, minH: 56, preferredW: 160, preferredH: 76, anchor: 'top-right' },
      ],
      allowedOverlaps: [
        { a: 'headline', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('social-square', 'square-hero-overlay', 'headline', 0.24) },
        { a: 'subtitle', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('social-square', 'square-hero-overlay', 'subtitle', 0.22) },
        { a: 'logo', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('social-square', 'square-hero-overlay', 'logo', 0.06) },
        { a: 'badge', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('social-square', 'square-hero-overlay', 'badge', 0.08) },
      ],
      preferredSplitRatio: [60, 40],
      allowedTextAlignment: ['left', 'center'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.5,
      maxImageCoverage: 0.7,
      minTextCoverage: 0.2,
      maxTextCoverage: 0.35,
    },
    {
      id: 'square-balanced-card',
      description: 'Balanced square with framed image and compact left text card.',
      imageRole: 'framed',
      targetBalance: 'compact',
      zoneIds: ['logo-top-left', 'text-bottom-left', 'cta-bottom', 'image-framed', 'badge-top-right', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-framed', required: true, minW: 320, minH: 360, preferredW: 360, preferredH: 420, anchor: 'center' },
        { block: 'headline', zoneId: 'text-bottom-left', required: true, minW: 360, preferredW: 460, maxW: 560, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-bottom-left', required: false, minW: 320, preferredW: 440, maxW: 520, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-bottom-left', required: false, minW: 320, preferredW: 420, maxW: 500, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 200, minH: 64, preferredW: 240, preferredH: 72, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 124, minH: 42, preferredW: 154, preferredH: 54, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-right', required: false, minW: 104, minH: 42, preferredW: 140, preferredH: 56, anchor: 'top-right' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 120, minH: 56, preferredW: 160, preferredH: 76, anchor: 'top-right' },
      ],
      preferredSplitRatio: [48, 52],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.42,
      maxImageCoverage: 0.62,
      minTextCoverage: 0.22,
      maxTextCoverage: 0.34,
    },
  ],
  'social-portrait': [
    {
      id: 'portrait-hero-overlay',
      description: 'Hero portrait with lower-middle cluster and light overlay feel.',
      imageRole: 'hero',
      targetBalance: 'balanced',
      zoneIds: ['logo-top-left', 'text-overlay-lower', 'cta-lower', 'image-hero-overlay', 'badge-top-right', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-hero-overlay', required: true, minW: 820, minH: 860, preferredW: 912, preferredH: 980, anchor: 'center' },
        { block: 'headline', zoneId: 'text-overlay-lower', required: true, minW: 520, preferredW: 620, maxW: 700, anchor: 'bottom-left' },
        { block: 'subtitle', zoneId: 'text-overlay-lower', required: false, minW: 420, preferredW: 580, maxW: 660, anchor: 'bottom-left' },
        { block: 'body', zoneId: 'text-overlay-lower', required: false, minW: 380, preferredW: 540, maxW: 620, anchor: 'bottom-left' },
        { block: 'cta', zoneId: 'cta-lower', required: true, minW: 220, minH: 68, preferredW: 284, preferredH: 76, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 126, minH: 42, preferredW: 154, preferredH: 52, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-right', required: false, minW: 108, minH: 42, preferredW: 146, preferredH: 56, anchor: 'top-right' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 120, minH: 56, preferredW: 164, preferredH: 78, anchor: 'top-right' },
      ],
      allowedOverlaps: [
        { a: 'headline', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('social-portrait', 'portrait-hero-overlay', 'headline', 0.22) },
        { a: 'subtitle', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('social-portrait', 'portrait-hero-overlay', 'subtitle', 0.2) },
        { a: 'logo', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('social-portrait', 'portrait-hero-overlay', 'logo', 0.06) },
        { a: 'badge', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('social-portrait', 'portrait-hero-overlay', 'badge', 0.08) },
      ],
      preferredSplitRatio: [62, 38],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.52,
      maxImageCoverage: 0.68,
      minTextCoverage: 0.18,
      maxTextCoverage: 0.3,
    },
    {
      id: 'portrait-bottom-card',
      description: 'Top-heavy portrait image with clean card-like text section below.',
      imageRole: 'framed',
      targetBalance: 'balanced',
      zoneIds: ['logo-top-left', 'text-lower', 'cta-lower', 'image-hero', 'badge-top-right', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-hero', required: true, minW: 760, minH: 620, preferredW: 912, preferredH: 700, anchor: 'center' },
        { block: 'headline', zoneId: 'text-lower', required: true, minW: 560, preferredW: 660, maxW: 760, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-lower', required: false, minW: 440, preferredW: 620, maxW: 720, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-lower', required: false, minW: 420, preferredW: 600, maxW: 700, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-lower', required: true, minW: 220, minH: 68, preferredW: 284, preferredH: 76, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 126, minH: 42, preferredW: 154, preferredH: 52, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-right', required: false, minW: 108, minH: 42, preferredW: 146, preferredH: 56, anchor: 'top-right' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 120, minH: 56, preferredW: 164, preferredH: 78, anchor: 'top-right' },
      ],
      preferredSplitRatio: [58, 42],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.5,
      maxImageCoverage: 0.7,
      minTextCoverage: 0.2,
      maxTextCoverage: 0.34,
    },
  ],
  'story-vertical': [
    {
      id: 'portrait-hero-overlay',
      description: 'Story hero background with lower-middle safe text zone.',
      imageRole: 'background',
      targetBalance: 'balanced',
      zoneIds: ['logo-top-left', 'text-middle-lower', 'cta-bottom', 'image-hero', 'badge-top-right', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-hero', required: true, minW: 760, minH: 980, preferredW: 936, preferredH: 1060, anchor: 'center' },
        { block: 'headline', zoneId: 'text-middle-lower', required: true, minW: 520, preferredW: 660, maxW: 720, anchor: 'bottom-left' },
        { block: 'subtitle', zoneId: 'text-middle-lower', required: false, minW: 420, preferredW: 620, maxW: 700, anchor: 'bottom-left' },
        { block: 'body', zoneId: 'text-middle-lower', required: false, minW: 380, preferredW: 620, maxW: 700, anchor: 'bottom-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 228, minH: 70, preferredW: 300, preferredH: 84, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 132, minH: 44, preferredW: 164, preferredH: 56, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-right', required: false, minW: 118, minH: 48, preferredW: 156, preferredH: 62, anchor: 'top-right' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 136, minH: 58, preferredW: 176, preferredH: 82, anchor: 'top-right' },
      ],
      preferredSplitRatio: [66, 34],
      allowedOverlaps: [
        { a: 'headline', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: 0.35 },
        { a: 'subtitle', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: 0.35 },
        { a: 'logo', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: 0.08 },
        { a: 'badge', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: 0.1 },
      ],
      allowedTextAlignment: ['left', 'center'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.6,
      maxImageCoverage: 0.74,
      minTextCoverage: 0.16,
      maxTextCoverage: 0.3,
    },
    {
      id: 'portrait-bottom-card',
      description: 'Dense-text vertical composition with image above and structured lower card.',
      imageRole: 'framed',
      targetBalance: 'balanced',
      zoneIds: ['logo-top-left', 'text-middle-lower', 'cta-bottom', 'image-hero', 'badge-top-right', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-hero', required: true, minW: 760, minH: 760, preferredW: 888, preferredH: 860, anchor: 'center' },
        { block: 'headline', zoneId: 'text-middle-lower', required: true, minW: 560, preferredW: 680, maxW: 760, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-middle-lower', required: false, minW: 440, preferredW: 640, maxW: 720, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-middle-lower', required: false, minW: 420, preferredW: 620, maxW: 700, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 228, minH: 70, preferredW: 292, preferredH: 82, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 132, minH: 44, preferredW: 164, preferredH: 56, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-right', required: false, minW: 118, minH: 48, preferredW: 150, preferredH: 60, anchor: 'top-right' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 136, minH: 58, preferredW: 172, preferredH: 80, anchor: 'top-right' },
      ],
      preferredSplitRatio: [54, 46],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.52,
      maxImageCoverage: 0.68,
      minTextCoverage: 0.22,
      maxTextCoverage: 0.38,
    },
  ],
  'social-landscape': [
    {
      id: 'landscape-hero-overlay',
      description: 'Wide social hero with safe left overlay copy and CTA on a supported lower lane.',
      imageRole: 'background',
      targetBalance: 'spread',
      zoneIds: ['logo-top-left', 'logo-top-right', 'image-hero-overlay', 'text-overlay-left', 'text-left', 'cta-support-left', 'badge-top-left', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-hero-overlay', required: true, minW: 900, minH: 360, preferredW: 1072, preferredH: 430, anchor: 'center' },
        { block: 'headline', zoneId: 'text-overlay-left', required: true, minW: 280, preferredW: 400, maxW: 440, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-overlay-left', required: false, minW: 240, preferredW: 360, maxW: 420, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-left', required: false, minW: 240, preferredW: 340, maxW: 420, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-support-left', required: true, minW: 168, minH: 50, preferredW: 218, preferredH: 58, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 92, minH: 30, preferredW: 136, preferredH: 42, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 100, minH: 40, preferredW: 140, preferredH: 48, anchor: 'top-left' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 110, minH: 46, preferredW: 140, preferredH: 58, anchor: 'top-right' },
      ],
      allowedOverlaps: [
        { a: 'headline', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('social-landscape', 'landscape-hero-overlay', 'headline', 0.18) },
        { a: 'subtitle', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('social-landscape', 'landscape-hero-overlay', 'subtitle', 0.16) },
        { a: 'logo', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('social-landscape', 'landscape-hero-overlay', 'logo', 0.06) },
      ],
      preferredSplitRatio: [38, 62],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.42,
      maxImageCoverage: 0.68,
      minTextCoverage: 0.16,
      maxTextCoverage: 0.3,
    },
    {
      id: 'landscape-balanced-split',
      description: 'Balanced left text and right image split for social landscape.',
      imageRole: 'split-right',
      targetBalance: 'balanced',
      zoneIds: ['logo-top-left', 'text-left', 'cta-left', 'image-right', 'badge-top-left', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-right', required: true, minW: 360, minH: 300, preferredW: 460, preferredH: 420, anchor: 'center' },
        { block: 'headline', zoneId: 'text-left', required: true, minW: 280, preferredW: 420, maxW: 460, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-left', required: false, minW: 260, preferredW: 400, maxW: 440, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-left', required: false, minW: 260, preferredW: 380, maxW: 420, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-left', required: true, minW: 168, minH: 50, preferredW: 218, preferredH: 58, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 92, minH: 30, preferredW: 136, preferredH: 42, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 100, minH: 40, preferredW: 140, preferredH: 48, anchor: 'top-left' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 110, minH: 46, preferredW: 140, preferredH: 58, anchor: 'top-right' },
      ],
      preferredSplitRatio: [48, 52],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.26,
      maxImageCoverage: 0.48,
      minTextCoverage: 0.16,
      maxTextCoverage: 0.34,
    },
    {
      id: 'landscape-text-left-image-right',
      description: 'Image-dominant landscape with strong width usage and structured text lane.',
      imageRole: 'hero',
      targetBalance: 'spread',
      zoneIds: ['logo-top-left', 'text-left', 'cta-left', 'image-right', 'badge-top-left', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-right', required: true, minW: 420, minH: 360, preferredW: 520, preferredH: 456, anchor: 'center' },
        { block: 'headline', zoneId: 'text-left', required: true, minW: 280, preferredW: 380, maxW: 420, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-left', required: false, minW: 240, preferredW: 340, maxW: 380, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-left', required: false, minW: 220, preferredW: 320, maxW: 360, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-left', required: true, minW: 168, minH: 50, preferredW: 208, preferredH: 58, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 92, minH: 30, preferredW: 128, preferredH: 40, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 96, minH: 40, preferredW: 132, preferredH: 46, anchor: 'top-left' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 110, minH: 46, preferredW: 136, preferredH: 56, anchor: 'top-right' },
      ],
      preferredSplitRatio: [40, 60],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.36,
      maxImageCoverage: 0.56,
      minTextCoverage: 0.16,
      maxTextCoverage: 0.28,
    },
  ],
  'display-mpu': [
    {
      id: 'display-rectangle-balanced',
      description: 'Compact MPU with text-first cluster and accent image.',
      imageRole: 'accent',
      targetBalance: 'compact',
      zoneIds: ['logo-top-left', 'text-main', 'cta-bottom', 'image-accent', 'badge-top-left'],
      slots: [
        { block: 'image', zoneId: 'image-accent', required: true, minW: 76, minH: 84, preferredW: 92, preferredH: 96, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 96, preferredW: 138, maxW: 150, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 92, preferredW: 132, maxW: 144, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 92, preferredW: 132, maxW: 144, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 92, minH: 28, preferredW: 110, preferredH: 34, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 48, minH: 18, preferredW: 62, preferredH: 22, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 56, minH: 20, preferredW: 78, preferredH: 24, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-top-left', required: false, minW: 64, minH: 20, preferredW: 82, preferredH: 26, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.18,
      maxImageCoverage: 0.4,
      minTextCoverage: 0.24,
      maxTextCoverage: 0.42,
    },
    {
      id: 'display-rectangle-image-bg',
      description: 'Compact MPU with background image and overlay text.',
      imageRole: 'background',
      targetBalance: 'compact',
      zoneIds: ['logo-top-left', 'text-main', 'cta-bottom', 'image-accent', 'badge-top-left'],
      slots: [
        { block: 'image', zoneId: 'image-accent', required: true, minW: 180, minH: 150, preferredW: 232, preferredH: 180, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 96, preferredW: 138, maxW: 150, anchor: 'bottom-left' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 92, preferredW: 132, maxW: 144, anchor: 'bottom-left' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 92, preferredW: 132, maxW: 144, anchor: 'bottom-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 92, minH: 28, preferredW: 110, preferredH: 34, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 48, minH: 18, preferredW: 62, preferredH: 22, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 56, minH: 20, preferredW: 78, preferredH: 24, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-top-left', required: false, minW: 64, minH: 20, preferredW: 82, preferredH: 26, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['strong'],
      minImageCoverage: 0.34,
      maxImageCoverage: 0.52,
      minTextCoverage: 0.18,
      maxTextCoverage: 0.34,
    },
  ],
  'display-large-rect': [
    {
      id: 'display-rectangle-balanced',
      description: 'Large rectangle with compact balanced display hierarchy.',
      imageRole: 'accent',
      targetBalance: 'compact',
      zoneIds: ['logo-top-left', 'text-main', 'cta-bottom', 'image-accent', 'badge-top-left'],
      slots: [
        { block: 'image', zoneId: 'image-accent', required: true, minW: 86, minH: 96, preferredW: 110, preferredH: 118, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 120, preferredW: 168, maxW: 176, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 104, preferredW: 156, maxW: 168, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 104, preferredW: 148, maxW: 160, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 100, minH: 32, preferredW: 126, preferredH: 38, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 52, minH: 18, preferredW: 66, preferredH: 24, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 60, minH: 22, preferredW: 84, preferredH: 26, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-top-left', required: false, minW: 64, minH: 22, preferredW: 88, preferredH: 28, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.2,
      maxImageCoverage: 0.42,
      minTextCoverage: 0.24,
      maxTextCoverage: 0.42,
    },
    {
      id: 'display-rectangle-image-bg',
      description: 'Large rectangle with image-backed overlay cluster.',
      imageRole: 'background',
      targetBalance: 'compact',
      zoneIds: ['logo-top-left', 'text-main', 'cta-bottom', 'image-accent', 'badge-top-left'],
      slots: [
        { block: 'image', zoneId: 'image-accent', required: true, minW: 220, minH: 176, preferredW: 250, preferredH: 210, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 124, preferredW: 176, maxW: 188, anchor: 'bottom-left' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 104, preferredW: 156, maxW: 176, anchor: 'bottom-left' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 104, preferredW: 148, maxW: 168, anchor: 'bottom-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 100, minH: 32, preferredW: 126, preferredH: 38, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 52, minH: 18, preferredW: 66, preferredH: 24, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 60, minH: 22, preferredW: 84, preferredH: 26, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-top-left', required: false, minW: 64, minH: 22, preferredW: 88, preferredH: 28, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['strong'],
      minImageCoverage: 0.36,
      maxImageCoverage: 0.54,
      minTextCoverage: 0.18,
      maxTextCoverage: 0.34,
    },
  ],
  'display-leaderboard': [
    {
      id: 'leaderboard-compact-horizontal',
      description: 'Short compact leaderboard with clear text-action flow.',
      imageRole: 'accent',
      targetBalance: 'spread',
      zoneIds: ['logo-left', 'text-main', 'cta-right', 'image-accent', 'badge-inline'],
      slots: [
        { block: 'image', zoneId: 'image-accent', required: false, minW: 54, minH: 44, preferredW: 76, preferredH: 56, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 200, preferredW: 284, maxW: 300, anchor: 'center' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 168, preferredW: 240, maxW: 272, anchor: 'center' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 0, preferredW: 0, maxW: 220, anchor: 'center' },
        { block: 'cta', zoneId: 'cta-right', required: true, minW: 112, minH: 30, preferredW: 138, preferredH: 34, anchor: 'center' },
        { block: 'logo', zoneId: 'logo-left', required: true, minW: 56, minH: 18, preferredW: 76, preferredH: 22, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-inline', required: false, minW: 56, minH: 18, preferredW: 76, preferredH: 20, anchor: 'bottom-left' },
        { block: 'price', zoneId: 'badge-inline', required: false, minW: 56, minH: 18, preferredW: 76, preferredH: 20, anchor: 'bottom-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.1,
      maxImageCoverage: 0.28,
      minTextCoverage: 0.18,
      maxTextCoverage: 0.32,
    },
    {
      id: 'leaderboard-image-accent',
      description: 'Leaderboard with accent image while text remains primary.',
      imageRole: 'accent',
      targetBalance: 'spread',
      zoneIds: ['logo-left', 'text-main', 'cta-right', 'image-accent', 'badge-inline'],
      slots: [
        { block: 'image', zoneId: 'image-accent', required: true, minW: 60, minH: 46, preferredW: 82, preferredH: 60, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 220, preferredW: 300, maxW: 320, anchor: 'center' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 180, preferredW: 250, maxW: 280, anchor: 'center' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 0, preferredW: 0, maxW: 220, anchor: 'center' },
        { block: 'cta', zoneId: 'cta-right', required: true, minW: 112, minH: 30, preferredW: 146, preferredH: 34, anchor: 'center' },
        { block: 'logo', zoneId: 'logo-left', required: true, minW: 56, minH: 18, preferredW: 76, preferredH: 22, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-inline', required: false, minW: 56, minH: 18, preferredW: 76, preferredH: 20, anchor: 'bottom-left' },
        { block: 'price', zoneId: 'badge-inline', required: false, minW: 56, minH: 18, preferredW: 76, preferredH: 20, anchor: 'bottom-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.12,
      maxImageCoverage: 0.24,
      minTextCoverage: 0.2,
      maxTextCoverage: 0.34,
    },
  ],
  'display-skyscraper': [
    {
      id: 'skyscraper-image-top-stack',
      description: 'Hero-top skyscraper with rhythmic text stack below.',
      imageRole: 'hero',
      targetBalance: 'balanced',
      zoneIds: ['logo-top', 'image-top', 'text-middle', 'cta-bottom', 'badge-middle'],
      slots: [
        { block: 'image', zoneId: 'image-top', required: true, minW: 104, minH: 150, preferredW: 120, preferredH: 188, anchor: 'center' },
        { block: 'headline', zoneId: 'text-middle', required: true, minW: 104, preferredW: 120, maxW: 124, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-middle', required: false, minW: 98, preferredW: 116, maxW: 124, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-middle', required: false, minW: 98, preferredW: 114, maxW: 124, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 100, minH: 34, preferredW: 116, preferredH: 38, anchor: 'bottom-center' },
        { block: 'logo', zoneId: 'logo-top', required: true, minW: 54, minH: 18, preferredW: 68, preferredH: 22, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-middle', required: false, minW: 64, minH: 20, preferredW: 84, preferredH: 24, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-middle', required: false, minW: 68, minH: 20, preferredW: 88, preferredH: 26, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.3,
      maxImageCoverage: 0.56,
      minTextCoverage: 0.18,
      maxTextCoverage: 0.34,
    },
    {
      id: 'skyscraper-split-vertical',
      description: 'Structured vertical split for skyscraper formats.',
      imageRole: 'framed',
      targetBalance: 'balanced',
      zoneIds: ['logo-top', 'image-top', 'text-middle', 'cta-bottom', 'badge-middle'],
      slots: [
        { block: 'image', zoneId: 'image-top', required: true, minW: 96, minH: 132, preferredW: 112, preferredH: 160, anchor: 'center' },
        { block: 'headline', zoneId: 'text-middle', required: true, minW: 100, preferredW: 118, maxW: 124, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-middle', required: false, minW: 92, preferredW: 114, maxW: 124, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-middle', required: false, minW: 92, preferredW: 112, maxW: 122, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 96, minH: 32, preferredW: 112, preferredH: 38, anchor: 'bottom-center' },
        { block: 'logo', zoneId: 'logo-top', required: true, minW: 54, minH: 18, preferredW: 68, preferredH: 22, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-middle', required: false, minW: 64, minH: 20, preferredW: 80, preferredH: 24, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-middle', required: false, minW: 68, minH: 20, preferredW: 86, preferredH: 26, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.24,
      maxImageCoverage: 0.44,
      minTextCoverage: 0.22,
      maxTextCoverage: 0.4,
    },
  ],
  'display-halfpage': [
    {
      id: 'portrait-bottom-card',
      description: 'Half-page with image hero top and structured lower text card.',
      imageRole: 'hero',
      targetBalance: 'balanced',
      zoneIds: ['logo-top', 'image-top', 'text-middle', 'cta-bottom', 'badge-middle'],
      slots: [
        { block: 'image', zoneId: 'image-top', required: true, minW: 180, minH: 160, preferredW: 232, preferredH: 220, anchor: 'center' },
        { block: 'headline', zoneId: 'text-middle', required: true, minW: 164, preferredW: 216, maxW: 228, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-middle', required: false, minW: 156, preferredW: 208, maxW: 228, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-middle', required: false, minW: 156, preferredW: 204, maxW: 228, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 112, minH: 34, preferredW: 130, preferredH: 42, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top', required: true, minW: 62, minH: 20, preferredW: 76, preferredH: 24, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-middle', required: false, minW: 72, minH: 22, preferredW: 96, preferredH: 26, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-middle', required: false, minW: 78, minH: 24, preferredW: 102, preferredH: 30, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.42,
      maxImageCoverage: 0.58,
      minTextCoverage: 0.22,
      maxTextCoverage: 0.38,
    },
    {
      id: 'portrait-hero-overlay',
      description: 'Text-first half-page with stronger overlay reading path.',
      imageRole: 'background',
      targetBalance: 'balanced',
      zoneIds: ['logo-top', 'image-top', 'text-middle', 'cta-bottom', 'badge-middle'],
      slots: [
        { block: 'image', zoneId: 'image-top', required: true, minW: 232, minH: 220, preferredW: 256, preferredH: 300, anchor: 'center' },
        { block: 'headline', zoneId: 'text-middle', required: true, minW: 164, preferredW: 220, maxW: 228, anchor: 'bottom-left' },
        { block: 'subtitle', zoneId: 'text-middle', required: false, minW: 156, preferredW: 204, maxW: 220, anchor: 'bottom-left' },
        { block: 'body', zoneId: 'text-middle', required: false, minW: 156, preferredW: 196, maxW: 212, anchor: 'bottom-left' },
        { block: 'cta', zoneId: 'cta-bottom', required: true, minW: 112, minH: 34, preferredW: 126, preferredH: 40, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top', required: true, minW: 62, minH: 20, preferredW: 76, preferredH: 24, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-middle', required: false, minW: 72, minH: 22, preferredW: 92, preferredH: 26, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-middle', required: false, minW: 78, minH: 24, preferredW: 98, preferredH: 30, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['strong'],
      minImageCoverage: 0.46,
      maxImageCoverage: 0.62,
      minTextCoverage: 0.18,
      maxTextCoverage: 0.32,
    },
  ],
  'display-billboard': [
    {
      id: 'billboard-wide-balanced',
      description: 'Wide display split with active width usage and no mini-banner feel.',
      imageRole: 'split-right',
      targetBalance: 'spread',
      zoneIds: ['logo-left', 'text-main', 'cta-right', 'image-right', 'badge-left'],
      slots: [
        { block: 'image', zoneId: 'image-right', required: true, minW: 220, minH: 150, preferredW: 300, preferredH: 170, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 240, preferredW: 360, maxW: 420, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 220, preferredW: 340, maxW: 388, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 180, preferredW: 300, maxW: 388, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-right', required: true, minW: 142, minH: 36, preferredW: 178, preferredH: 42, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-left', required: true, minW: 64, minH: 20, preferredW: 80, preferredH: 24, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-left', required: false, minW: 72, minH: 24, preferredW: 98, preferredH: 28, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-left', required: false, minW: 80, minH: 24, preferredW: 112, preferredH: 32, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard', 'strong'],
      minImageCoverage: 0.24,
      maxImageCoverage: 0.42,
      minTextCoverage: 0.18,
      maxTextCoverage: 0.34,
    },
    {
      id: 'leaderboard-image-accent',
      description: 'Wide display with accent image and text-led horizontal spread.',
      imageRole: 'accent',
      targetBalance: 'spread',
      zoneIds: ['logo-left', 'text-main', 'cta-right', 'image-right', 'badge-left'],
      slots: [
        { block: 'image', zoneId: 'image-right', required: true, minW: 180, minH: 132, preferredW: 240, preferredH: 152, anchor: 'center' },
        { block: 'headline', zoneId: 'text-main', required: true, minW: 280, preferredW: 420, maxW: 460, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-main', required: false, minW: 220, preferredW: 320, maxW: 360, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-main', required: false, minW: 180, preferredW: 280, maxW: 340, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-right', required: true, minW: 142, minH: 36, preferredW: 170, preferredH: 40, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-left', required: true, minW: 64, minH: 20, preferredW: 80, preferredH: 24, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-left', required: false, minW: 72, minH: 24, preferredW: 94, preferredH: 28, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-left', required: false, minW: 80, minH: 24, preferredW: 108, preferredH: 32, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['standard'],
      minImageCoverage: 0.18,
      maxImageCoverage: 0.32,
      minTextCoverage: 0.22,
      maxTextCoverage: 0.38,
    },
  ],
  'print-billboard': [
    {
      id: 'billboard-wide-hero',
      description: 'Billboard hero with print-scale image and assertive text mass.',
      imageRole: 'hero',
      targetBalance: 'spread',
      zoneIds: ['logo-top-left', 'text-overlay-left', 'cta-support-left', 'image-hero-overlay', 'badge-top-left', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-hero-overlay', required: true, minW: 1800, minH: 560, preferredW: 2080, preferredH: 600, anchor: 'center' },
        { block: 'headline', zoneId: 'text-overlay-left', required: true, minW: 560, preferredW: 760, maxW: 860, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-overlay-left', required: false, minW: 500, preferredW: 700, maxW: 780, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-left', required: false, minW: 440, preferredW: 640, maxW: 760, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-support-left', required: true, minW: 250, minH: 80, preferredW: 320, preferredH: 96, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 188, minH: 60, preferredW: 232, preferredH: 76, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 188, minH: 60, preferredW: 248, preferredH: 78, anchor: 'top-left' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 188, minH: 78, preferredW: 236, preferredH: 100, anchor: 'top-right' },
      ],
      allowedOverlaps: [
        { a: 'headline', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('print-billboard', 'billboard-wide-hero', 'headline', 0.36) },
        { a: 'subtitle', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('print-billboard', 'billboard-wide-hero', 'subtitle', 0.32) },
        { a: 'logo', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('print-billboard', 'billboard-wide-hero', 'logo', 0.06) },
        { a: 'badge', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('print-billboard', 'billboard-wide-hero', 'badge', 0.1) },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['quiet', 'standard'],
      minImageCoverage: 0.4,
      maxImageCoverage: 0.58,
      minTextCoverage: 0.22,
      maxTextCoverage: 0.36,
    },
    {
      id: 'billboard-wide-balanced',
      description: 'Billboard balanced left-right composition with active width usage.',
      imageRole: 'split-right',
      targetBalance: 'spread',
      zoneIds: ['logo-top-left', 'text-left', 'cta-left', 'image-right', 'badge-top-left', 'price-top-right'],
      slots: [
        { block: 'image', zoneId: 'image-right', required: true, minW: 640, minH: 520, preferredW: 820, preferredH: 620, anchor: 'center' },
        { block: 'headline', zoneId: 'text-left', required: true, minW: 520, preferredW: 680, maxW: 760, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-left', required: false, minW: 440, preferredW: 620, maxW: 720, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-left', required: false, minW: 420, preferredW: 600, maxW: 700, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-left', required: true, minW: 250, minH: 80, preferredW: 300, preferredH: 92, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 188, minH: 60, preferredW: 232, preferredH: 76, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 188, minH: 60, preferredW: 248, preferredH: 78, anchor: 'top-left' },
        { block: 'price', zoneId: 'price-top-right', required: false, minW: 188, minH: 78, preferredW: 236, preferredH: 100, anchor: 'top-right' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['quiet', 'standard'],
      minImageCoverage: 0.36,
      maxImageCoverage: 0.54,
      minTextCoverage: 0.22,
      maxTextCoverage: 0.34,
    },
  ],
  'presentation-hero': [
    {
      id: 'presentation-clean-hero',
      description: 'Clean slide hero with calm headline and integrated image.',
      imageRole: 'framed',
      targetBalance: 'balanced',
      zoneIds: ['logo-top-left', 'text-overlay-left', 'cta-support-left', 'image-hero-overlay', 'badge-top-left'],
      slots: [
        { block: 'image', zoneId: 'image-hero-overlay', required: true, minW: 1200, minH: 520, preferredW: 1664, preferredH: 620, anchor: 'center' },
        { block: 'headline', zoneId: 'text-overlay-left', required: true, minW: 420, preferredW: 680, maxW: 760, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-overlay-left', required: false, minW: 360, preferredW: 620, maxW: 700, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-left', required: false, minW: 320, preferredW: 560, maxW: 680, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-support-left', required: false, minW: 180, minH: 58, preferredW: 232, preferredH: 66, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 120, minH: 38, preferredW: 148, preferredH: 48, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 116, minH: 38, preferredW: 146, preferredH: 48, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-top-left', required: false, minW: 120, minH: 40, preferredW: 150, preferredH: 52, anchor: 'top-left' },
      ],
      allowedOverlaps: [
        { a: 'headline', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('presentation-hero', 'presentation-clean-hero', 'headline', 0.18) },
        { a: 'subtitle', b: 'image', requiresSafeTextArea: true, protectSubject: true, minContrast: 4.5, maxOverlapRatio: overlapLimit('presentation-hero', 'presentation-clean-hero', 'subtitle', 0.16) },
        { a: 'logo', b: 'image', protectSubject: true, topCornerOnly: true, maxOverlapRatio: overlapLimit('presentation-hero', 'presentation-clean-hero', 'logo', 0.05) },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['quiet', 'standard'],
      minImageCoverage: 0.22,
      maxImageCoverage: 0.42,
      minTextCoverage: 0.14,
      maxTextCoverage: 0.3,
    },
    {
      id: 'presentation-structured-cover',
      description: 'Structured presentation cover with stronger grid discipline.',
      imageRole: 'split-right',
      targetBalance: 'balanced',
      zoneIds: ['logo-top-left', 'text-left', 'cta-left', 'image-right', 'badge-top-left'],
      slots: [
        { block: 'image', zoneId: 'image-right', required: true, minW: 500, minH: 560, preferredW: 650, preferredH: 720, anchor: 'center' },
        { block: 'headline', zoneId: 'text-left', required: true, minW: 420, preferredW: 660, maxW: 760, anchor: 'top-left' },
        { block: 'subtitle', zoneId: 'text-left', required: false, minW: 360, preferredW: 620, maxW: 720, anchor: 'top-left' },
        { block: 'body', zoneId: 'text-left', required: false, minW: 320, preferredW: 560, maxW: 680, anchor: 'top-left' },
        { block: 'cta', zoneId: 'cta-left', required: false, minW: 180, minH: 58, preferredW: 220, preferredH: 64, anchor: 'bottom-left' },
        { block: 'logo', zoneId: 'logo-top-left', required: true, minW: 120, minH: 38, preferredW: 148, preferredH: 48, anchor: 'top-left' },
        { block: 'badge', zoneId: 'badge-top-left', required: false, minW: 116, minH: 38, preferredW: 146, preferredH: 48, anchor: 'top-left' },
        { block: 'price', zoneId: 'badge-top-left', required: false, minW: 120, minH: 40, preferredW: 150, preferredH: 52, anchor: 'top-left' },
      ],
      allowedTextAlignment: ['left'],
      allowedCtaModes: ['quiet'],
      minImageCoverage: 0.22,
      maxImageCoverage: 0.42,
      minTextCoverage: 0.16,
      maxTextCoverage: 0.32,
    },
  ],
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function toModel(formatKey: FormatKey, spec: ModelSpec): CompositionModel {
  const ruleSet = getFormatRuleSet(FORMAT_MAP[formatKey])
  return {
    id: spec.id,
    formatId: formatKey,
    family: ruleSet.family,
    description: spec.description,
    imageRole: spec.imageRole,
    targetBalance: spec.targetBalance,
    zones: ruleSet.zones.filter((zone) => spec.zoneIds.includes(zone.id)),
    slots: spec.slots.map((slot) => ({ ...slot })),
    allowedOverlaps: spec.allowedOverlaps?.map((pair) => ({ ...pair })),
    preferredSplitRatio: spec.preferredSplitRatio,
    allowedTextAlignment: [...spec.allowedTextAlignment],
    allowedCtaModes: [...spec.allowedCtaModes],
    minImageCoverage: spec.minImageCoverage,
    maxImageCoverage: spec.maxImageCoverage,
    minTextCoverage: spec.minTextCoverage,
    maxTextCoverage: spec.maxTextCoverage,
  }
}

export function resolveCompositionModelFamily(modelId: CompositionModelId): LayoutIntentFamily {
  return MODEL_LAYOUT_FAMILY_MAP[modelId]
}

export function getCompositionModelsForFormat(formatOrKey: FormatDefinition | FormatKey): CompositionModel[] {
  const key = typeof formatOrKey === 'string' ? formatOrKey : formatOrKey.key
  const specs = MODEL_SPECS[key] || []
  return specs.map((spec) => clone(toModel(key, spec)))
}

export function getCompositionModel(formatOrKey: FormatDefinition | FormatKey, modelId: CompositionModelId) {
  return getCompositionModelsForFormat(formatOrKey).find((model) => model.id === modelId) || null
}

export function selectCompositionModel(input: {
  format: FormatDefinition
  requestedModelId?: CompositionModelId
  requestedFamily?: LayoutIntentFamily
  denseText?: boolean
  /** Shifts default model pick: `(baseIdx + rotationOffset) % models.length`. */
  rotationOffset?: number
  /** Same as rotationOffset (project Regenerate all); rotationOffset wins if both set. */
  rotationIndex?: number
}): CompositionModel | null {
  const models = getCompositionModelsForFormat(input.format)
  if (!models.length) return null
  if (input.requestedModelId) {
    const explicit = models.find((model) => model.id === input.requestedModelId)
    if (explicit) return explicit
  }
  if (input.requestedFamily) {
    const filtered = models.filter((model) => MODEL_LAYOUT_FAMILY_MAP[model.id] === input.requestedFamily)
    if (filtered.length) {
      const rot = input.rotationOffset ?? input.rotationIndex ?? 0
      const baseIdx = input.denseText && filtered.length > 1 ? 1 : 0
      return filtered[(baseIdx + rot) % filtered.length]
    }
    const byFamily = models.find((model) => MODEL_LAYOUT_FAMILY_MAP[model.id] === input.requestedFamily)
    if (byFamily) return byFamily
  }
  const rot = input.rotationOffset ?? input.rotationIndex ?? 0
  const baseIdx = input.denseText && models.length > 1 ? 1 : 0
  return models[(baseIdx + rot) % models.length]
}

export function getAlternativeCompositionModel(formatOrKey: FormatDefinition | FormatKey, currentModelId?: CompositionModelId) {
  const models = getCompositionModelsForFormat(formatOrKey)
  if (!models.length) return null
  if (!currentModelId) return models[1] || models[0]
  return models.find((model) => model.id !== currentModelId) || null
}
