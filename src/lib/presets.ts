import type {
  BrandTemplate,
  BrandTemplateKey,
  FormatDefinition,
  FormatKey,
  GoalPreset,
  LayoutFamily,
  LayoutPreset,
  Scene,
  TemplateKey,
  VisualSystem,
} from './types'

export const FONT_OPTIONS = [
  'Trebuchet MS, Segoe UI, sans-serif',
  'Georgia, Times New Roman, serif',
  'Tahoma, Verdana, sans-serif',
  'Gill Sans, Trebuchet MS, sans-serif',
] as const

export const CHANNEL_FORMATS: FormatDefinition[] = [
  { key: 'social-square', name: '1080 x 1080', width: 1080, height: 1080, label: 'Social Square', category: 'social', family: 'square', packTags: ['stories-ads', 'performance-banners', 'promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'social-portrait', name: '1080 x 1350', width: 1080, height: 1350, label: 'Social Portrait', category: 'social', family: 'portrait', packTags: ['stories-ads', 'promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'story-vertical', name: '1080 x 1920', width: 1080, height: 1920, label: 'Story Vertical', category: 'social', family: 'portrait', packTags: ['stories-ads', 'promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'social-landscape', name: '1200 x 628', width: 1200, height: 628, label: 'Social Landscape', category: 'social', family: 'landscape', packTags: ['performance-banners', 'promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'display-mpu', name: '300 x 250', width: 300, height: 250, label: 'Display MPU', category: 'display', family: 'landscape', packTags: ['performance-banners'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'display-large-rect', name: '336 x 280', width: 336, height: 280, label: 'Large Rectangle', category: 'display', family: 'landscape', packTags: ['performance-banners'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'display-leaderboard', name: '728 x 90', width: 728, height: 90, label: 'Leaderboard', category: 'display', family: 'wide', packTags: ['performance-banners'], scopeStage: 'experimental', primaryGenerationMode: 'experimental-freeform' },
  { key: 'display-skyscraper', name: '160 x 600', width: 160, height: 600, label: 'Skyscraper', category: 'display', family: 'skyscraper', packTags: ['performance-banners'], scopeStage: 'experimental', primaryGenerationMode: 'experimental-freeform' },
  { key: 'display-halfpage', name: '300 x 600', width: 300, height: 600, label: 'Half Page', category: 'display', family: 'portrait', packTags: ['performance-banners'], scopeStage: 'experimental', primaryGenerationMode: 'experimental-freeform' },
  { key: 'display-billboard', name: '970 x 250', width: 970, height: 250, label: 'Display Billboard', category: 'display', family: 'wide', packTags: ['performance-banners', 'promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'marketplace-card', name: '1200 x 1200', width: 1200, height: 1200, label: 'Marketplace Card', category: 'marketplace', family: 'square', packTags: ['promo-pack'], scopeStage: 'active', primaryGenerationMode: 'template-assist-primary' },
  { key: 'marketplace-tile', name: '1200 x 628', width: 1200, height: 628, label: 'Promo Tile', category: 'marketplace', family: 'landscape', packTags: ['promo-pack', 'retail-flyer'], scopeStage: 'active', primaryGenerationMode: 'template-assist-primary' },
  { key: 'marketplace-highlight', name: '1080 x 1350', width: 1080, height: 1350, label: 'Product Highlight', category: 'marketplace', family: 'portrait', packTags: ['promo-pack', 'retail-flyer'], scopeStage: 'active', primaryGenerationMode: 'template-assist-primary' },
  { key: 'print-flyer-a5', name: '1480 x 2100', width: 1480, height: 2100, label: 'Flyer A5', category: 'print', family: 'printPortrait', packTags: ['retail-flyer', 'promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'print-poster-a4', name: '2480 x 3508', width: 2480, height: 3508, label: 'Poster A4', category: 'print', family: 'printPortrait', packTags: ['retail-flyer'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'print-billboard', name: '2400 x 1000', width: 2400, height: 1000, label: 'Billboard Horizontal', category: 'print', family: 'wide', packTags: ['retail-flyer', 'promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'presentation-hero', name: '1920 x 1080', width: 1920, height: 1080, label: 'Presentation Hero', category: 'presentation', family: 'landscape', packTags: ['promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'presentation-cover', name: '1600 x 900', width: 1600, height: 900, label: 'Presentation Cover', category: 'presentation', family: 'landscape', packTags: ['promo-pack'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
  { key: 'presentation-onepager', name: '1200 x 1600', width: 1200, height: 1600, label: 'Promo One-Pager', category: 'presentation', family: 'printPortrait', packTags: ['promo-pack', 'retail-flyer'], scopeStage: 'legacy', primaryGenerationMode: 'legacy-freeform' },
]

export const FORMAT_MAP: Record<FormatKey, FormatDefinition> = Object.fromEntries(
  CHANNEL_FORMATS.map((format) => [format.key, format])
) as Record<FormatKey, FormatDefinition>

export const GOAL_PRESETS: GoalPreset[] = [
  {
    key: 'stories-ads',
    label: 'Stories ads (Legacy)',
    description: 'Legacy exploration preset kept for diagnostics/export compatibility. Not part of the active diploma delivery scope.',
    includedFormats: ['story-vertical', 'social-portrait', 'social-square', 'marketplace-highlight'],
    scopeStage: 'legacy',
  },
  {
    key: 'performance-banners',
    label: 'Performance banners (Legacy)',
    description: 'Legacy banner exploration preset. Preserved as fallback infrastructure, not as the main supported product path.',
    includedFormats: ['social-landscape', 'social-square', 'display-mpu', 'display-large-rect', 'display-leaderboard', 'display-skyscraper', 'display-halfpage', 'display-billboard'],
    scopeStage: 'legacy',
  },
  {
    key: 'retail-flyer',
    label: 'Retail flyer (Legacy)',
    description: 'Legacy retail/print exploration preset kept for export and diagnostics. The primary diploma path is marketplace-first.',
    includedFormats: ['print-flyer-a5', 'print-poster-a4', 'print-billboard', 'marketplace-tile', 'marketplace-highlight', 'presentation-onepager'],
    scopeStage: 'legacy',
  },
  {
    key: 'promo-pack',
    label: 'Marketplace adaptive pack',
    description: 'Primary diploma path: template-assisted adaptive marketplace layouts focused on card and highlight outputs.',
    includedFormats: ['marketplace-card', 'marketplace-highlight', 'marketplace-tile'],
    scopeStage: 'active',
  },
]

/** Shown in Campaign goal UI; full `GOAL_PRESETS` stays available for imports and internals. */
export const UI_GOAL_PRESETS = GOAL_PRESETS.filter((goal) => goal.scopeStage === 'active')

export const VISUAL_SYSTEMS: VisualSystem[] = [
  { key: 'minimal', label: 'Minimal', description: 'Clean, calm, premium spacing with restrained accents.', mood: 'quiet confidence', titleWeight: 700, subtitleOpacity: 0.78, imageTreatment: 'clean' },
  { key: 'bold-promo', label: 'Bold Promo', description: 'High-energy promo direction with stronger contrasts and CTA focus.', mood: 'urgent and commercial', titleWeight: 800, subtitleOpacity: 0.9, imageTreatment: 'immersive' },
  { key: 'editorial', label: 'Editorial', description: 'Magazine-inspired hierarchy with content-led rhythm.', mood: 'story-first and curated', titleWeight: 750, subtitleOpacity: 0.8, imageTreatment: 'soft' },
  { key: 'product-card', label: 'Product Card', description: 'Centered product framing for retail and marketplace layouts.', mood: 'structured and conversion-focused', titleWeight: 720, subtitleOpacity: 0.82, imageTreatment: 'clean' },
  { key: 'luxury-clean', label: 'Luxury Clean', description: 'Sophisticated whitespace and polished presentation styling.', mood: 'refined and elevated', titleWeight: 700, subtitleOpacity: 0.74, imageTreatment: 'soft' },
]

export const BRAND_TEMPLATES: BrandTemplate[] = [
  {
    key: 'startup-blue',
    label: 'Startup Blue',
    description: 'Confident SaaS palette with bright accent and balanced spacing.',
    brandKit: {
      name: 'Startup Blue',
      primaryColor: '#0f172a',
      accentColor: '#38bdf8',
      background: ['#0f172a', '#1e293b', '#334155'],
      fontFamily: FONT_OPTIONS[0],
      toneOfVoice: 'clear, helpful, modern',
      ctaStyle: 'pill',
      safeZone: 'balanced',
    },
  },
  {
    key: 'retail-impact',
    label: 'Retail Impact',
    description: 'High-contrast retail style for offers, launches, and product pushes.',
    brandKit: {
      name: 'Retail Impact',
      primaryColor: '#2a1b11',
      accentColor: '#ff6b2c',
      background: ['#24150f', '#5b2414', '#f97316'],
      fontFamily: FONT_OPTIONS[3],
      toneOfVoice: 'direct, energetic, promotional',
      ctaStyle: 'rounded',
      safeZone: 'compact',
    },
  },
  {
    key: 'editorial-serene',
    label: 'Editorial Serene',
    description: 'Quiet editorial system with softer gradients and refined typography.',
    brandKit: {
      name: 'Editorial Serene',
      primaryColor: '#1e293b',
      accentColor: '#c59d5f',
      background: ['#f6f1e8', '#d9d1c4', '#a8b1b8'],
      fontFamily: FONT_OPTIONS[1],
      toneOfVoice: 'thoughtful, polished, premium',
      ctaStyle: 'sharp',
      safeZone: 'airy',
    },
  },
]

export const DEMO_PROJECTS = [
  {
    key: 'demo-sneakers',
    label: 'Sport shoes',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop',
    title: 'Run Faster',
    subtitle: 'Professional sport collection',
    cta: 'Shop now',
    brandTemplateKey: 'retail-impact' as BrandTemplateKey,
  },
  {
    key: 'demo-headphones',
    label: 'Headphones',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop',
    title: 'Pure Sound',
    subtitle: 'Wireless noise cancelling',
    cta: 'Buy now',
    brandTemplateKey: 'startup-blue' as BrandTemplateKey,
  },
  {
    key: 'demo-cosmetics',
    label: 'Skincare',
    imageUrl: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&auto=format&fit=crop',
    title: 'Glow Up',
    subtitle: 'Natural skincare collection',
    cta: 'Discover',
    brandTemplateKey: 'editorial-serene' as BrandTemplateKey,
  },
]

export const TEMPLATE_PRESETS: Record<TemplateKey, { chip: string; title: string; subtitle: string; cta: string }> = {
  promo: {
    chip: 'Campaign',
    title: 'Adaptive creative systems for every placement',
    subtitle: 'Turn one master layout into multiple channel-ready formats without breaking the visual language.',
    cta: 'Learn more',
  },
  product: {
    chip: 'New drop',
    title: 'Launch a product line across every channel',
    subtitle: 'Build a polished retail-ready master and let the system adapt it for paid ads, social, and marketplace formats.',
    cta: 'Shop now',
  },
  article: {
    chip: 'Editorial',
    title: 'Transform content into campaign-ready visuals',
    subtitle: 'Package thought leadership, reports, or event content into cohesive promotional layouts with consistent hierarchy.',
    cta: 'Read more',
  },
}

export function baseScene(template: TemplateKey, brandBackground: [string, string, string], accent: string): Scene {
  const preset = TEMPLATE_PRESETS[template]

  return {
    background: [...brandBackground],
    accent,
    chip: preset.chip,
    title: {
      x: 8,
      y: 56,
      w: 52,
      fontSize: 52,
      charsPerLine: 20,
      maxLines: 3,
      weight: 720,
      fill: '#ffffff',
      text: preset.title,
    },
    subtitle: {
      x: 8,
      y: 72,
      w: 48,
      fontSize: 20,
      charsPerLine: 34,
      maxLines: 4,
      weight: 420,
      fill: '#ffffff',
      opacity: 0.9,
      text: preset.subtitle,
    },
    cta: {
      x: 8,
      y: 90,
      w: 18,
      h: 6,
      fontSize: 17,
      bg: '#ffffff',
      fill: '#0f172a',
      text: preset.cta,
    },
    badge: {
      x: 80,
      y: 6,
      w: 12,
      h: 5,
      fontSize: 16,
      bg: '#ffffff',
      bgOpacity: 0.08,
      fill: '#ffffff',
      text: preset.chip,
    },
    logo: { x: 6, y: 6, w: 10, h: 5, bg: '#ffffff', bgOpacity: 0.08, fill: '#ffffff' },
    image: { x: 54, y: 14, w: 32, h: 58, rx: 28, fit: 'xMidYMid slice' },
  }
}

export const LAYOUT_PRESETS: Record<LayoutFamily, LayoutPreset[]> = {
  landscape: [
    { id: 'hero-split-right', label: 'Hero Split Right', family: 'landscape', description: 'Text on the left, visual on the right.', featured: true, styleBias: ['minimal', 'editorial'], elements: { image: { x: 56, y: 12, w: 34, h: 64, rx: 28 }, title: { x: 6, y: 60, w: 44, fontSize: 54, charsPerLine: 18, maxLines: 3 }, subtitle: { x: 6, y: 76, w: 40, fontSize: 21, charsPerLine: 32, maxLines: 4 }, cta: { x: 6, y: 90, w: 16, h: 6 }, logo: { x: 6, y: 6, w: 10, h: 5 }, badge: { x: 82, y: 6, w: 12, h: 5 } } },
    { id: 'hero-overlay-wide', label: 'Hero Overlay Wide', family: 'landscape', description: 'Wide visual with content layered over it.', featured: true, styleBias: ['bold-promo', 'luxury-clean'], elements: { image: { x: 6, y: 12, w: 88, h: 62, rx: 28 }, title: { x: 8, y: 66, w: 48, fontSize: 50, charsPerLine: 20, maxLines: 3, weight: 800 }, subtitle: { x: 8, y: 80, w: 42, fontSize: 19, charsPerLine: 32, maxLines: 3 }, cta: { x: 8, y: 91, w: 18, h: 5.5 }, logo: { x: 6, y: 6, w: 10, h: 5 }, badge: { x: 80, y: 6, w: 14, h: 5 } } },
    { id: 'text-first-horizontal', label: 'Text First', family: 'landscape', description: 'Prioritize headline and messaging.', featured: true, styleBias: ['editorial', 'product-card'], elements: { image: { x: 62, y: 20, w: 24, h: 52, rx: 28 }, title: { x: 6, y: 42, w: 48, fontSize: 52, charsPerLine: 20, maxLines: 2 }, subtitle: { x: 6, y: 58, w: 44, fontSize: 22, charsPerLine: 34, maxLines: 4 }, cta: { x: 6, y: 90, w: 16, h: 6 }, logo: { x: 6, y: 6, w: 10, h: 5 }, badge: { x: 6, y: 14, w: 12, h: 5 } } },
  ],
  square: [
    { id: 'image-top-square', label: 'Image Top', family: 'square', description: 'Visual lead with copy below.', featured: true, styleBias: ['minimal', 'product-card'], elements: { image: { x: 10, y: 12, w: 80, h: 42, rx: 28 }, title: { x: 8, y: 66, w: 58, fontSize: 38, charsPerLine: 20, maxLines: 3 }, subtitle: { x: 8, y: 80, w: 54, fontSize: 16, charsPerLine: 32, maxLines: 4 }, cta: { x: 8, y: 92, w: 18, h: 6 }, logo: { x: 6, y: 6, w: 10, h: 5 }, badge: { x: 80, y: 6, w: 12, h: 5 } } },
    { id: 'product-centered-square', label: 'Product Centered', family: 'square', description: 'Centered product focus with supporting copy.', featured: true, styleBias: ['product-card', 'bold-promo'], elements: { image: { x: 18, y: 20, w: 64, h: 42, rx: 28, fit: 'xMidYMid meet' }, title: { x: 8, y: 68, w: 56, fontSize: 34, charsPerLine: 20, maxLines: 2 }, subtitle: { x: 8, y: 80, w: 52, fontSize: 15, charsPerLine: 30, maxLines: 3 }, cta: { x: 8, y: 91, w: 20, h: 6 }, logo: { x: 6, y: 6, w: 10, h: 5 }, badge: { x: 76, y: 14, w: 14, h: 5 } } },
    { id: 'full-image-overlay-square', label: 'Full Image Overlay', family: 'square', description: 'Large visual with copy anchored near the bottom.', featured: true, styleBias: ['bold-promo', 'luxury-clean'], elements: { image: { x: 5, y: 8, w: 90, h: 78, rx: 28 }, title: { x: 8, y: 72, w: 58, fontSize: 36, charsPerLine: 20, maxLines: 3, weight: 800 }, subtitle: { x: 8, y: 84, w: 50, fontSize: 15, charsPerLine: 28, maxLines: 3 }, cta: { x: 8, y: 92, w: 18, h: 5.5 }, logo: { x: 6, y: 6, w: 10, h: 5 }, badge: { x: 78, y: 6, w: 14, h: 5 } } },
  ],
  portrait: [
    { id: 'story-hero-top', label: 'Story Hero Top', family: 'portrait', description: 'Visual at the top, content block below.', featured: true, styleBias: ['minimal', 'editorial'], elements: { image: { x: 8, y: 12, w: 84, h: 30, rx: 28 }, title: { x: 8, y: 52, w: 74, fontSize: 36, charsPerLine: 18, maxLines: 3 }, subtitle: { x: 8, y: 65, w: 68, fontSize: 16, charsPerLine: 28, maxLines: 4 }, cta: { x: 8, y: 88, w: 24, h: 5.5 }, logo: { x: 6, y: 5, w: 12, h: 4.5 }, badge: { x: 74, y: 5, w: 16, h: 4.5 } } },
    { id: 'story-overlay', label: 'Story Overlay', family: 'portrait', description: 'Full-frame visual with messaging layered on top.', featured: true, styleBias: ['bold-promo', 'luxury-clean'], elements: { image: { x: 4, y: 4, w: 92, h: 88, rx: 28 }, title: { x: 8, y: 70, w: 74, fontSize: 34, charsPerLine: 18, maxLines: 3, weight: 800 }, subtitle: { x: 8, y: 80, w: 66, fontSize: 15, charsPerLine: 26, maxLines: 4 }, cta: { x: 8, y: 91, w: 24, h: 5.2 }, logo: { x: 6, y: 5, w: 12, h: 4.5 }, badge: { x: 74, y: 5, w: 16, h: 4.5 } } },
    { id: 'mobile-promo-compact', label: 'Mobile Promo Compact', family: 'portrait', description: 'Compact storytelling layout for mobile placements.', featured: true, styleBias: ['product-card', 'bold-promo'], elements: { image: { x: 10, y: 14, w: 80, h: 24, rx: 28 }, title: { x: 8, y: 46, w: 74, fontSize: 34, charsPerLine: 18, maxLines: 3 }, subtitle: { x: 8, y: 58, w: 68, fontSize: 15, charsPerLine: 28, maxLines: 4 }, cta: { x: 8, y: 76, w: 24, h: 5.5 }, logo: { x: 6, y: 5, w: 12, h: 4.5 }, badge: { x: 6, y: 11, w: 14, h: 4.5 } } },
  ],
  wide: [
    { id: 'billboard-wide', label: 'Billboard Wide', family: 'wide', description: 'Long horizontal layout for display and outdoor placements.', featured: true, styleBias: ['bold-promo', 'luxury-clean'], elements: { image: { x: 58, y: 10, w: 36, h: 72, rx: 24 }, title: { x: 5, y: 46, w: 40, fontSize: 46, charsPerLine: 18, maxLines: 2, weight: 800 }, subtitle: { x: 5, y: 65, w: 34, fontSize: 18, charsPerLine: 28, maxLines: 2 }, cta: { x: 5, y: 82, w: 16, h: 9 }, logo: { x: 5, y: 8, w: 10, h: 10 }, badge: { x: 80, y: 8, w: 14, h: 9 } } },
    { id: 'wide-ribbon', label: 'Wide Ribbon', family: 'wide', description: 'Ribbon-like visual strip with dominant offer messaging.', featured: true, styleBias: ['minimal', 'editorial'], elements: { image: { x: 62, y: 12, w: 30, h: 68, rx: 22 }, title: { x: 5, y: 40, w: 42, fontSize: 44, charsPerLine: 20, maxLines: 2 }, subtitle: { x: 5, y: 58, w: 36, fontSize: 16, charsPerLine: 30, maxLines: 2 }, cta: { x: 5, y: 76, w: 18, h: 8 }, logo: { x: 5, y: 8, w: 10, h: 10 }, badge: { x: 5, y: 22, w: 14, h: 8 } } },
  ],
  skyscraper: [
    { id: 'skyscraper-stack', label: 'Skyscraper Stack', family: 'skyscraper', description: 'Stacked vertical banner with strong headline hierarchy.', featured: true, styleBias: ['bold-promo', 'product-card'], elements: { image: { x: 10, y: 8, w: 80, h: 34, rx: 18 }, title: { x: 10, y: 50, w: 76, fontSize: 28, charsPerLine: 14, maxLines: 4, weight: 800 }, subtitle: { x: 10, y: 70, w: 76, fontSize: 13, charsPerLine: 18, maxLines: 4 }, cta: { x: 10, y: 88, w: 46, h: 6 }, logo: { x: 10, y: 4, w: 24, h: 5 }, badge: { x: 54, y: 4, w: 30, h: 5 } } },
    { id: 'skyscraper-overlay', label: 'Skyscraper Overlay', family: 'skyscraper', description: 'Full-height visual with text layered in the lower zone.', featured: true, styleBias: ['luxury-clean', 'editorial'], elements: { image: { x: 6, y: 4, w: 88, h: 92, rx: 18 }, title: { x: 10, y: 62, w: 78, fontSize: 24, charsPerLine: 14, maxLines: 4, weight: 800 }, subtitle: { x: 10, y: 79, w: 72, fontSize: 12, charsPerLine: 18, maxLines: 4 }, cta: { x: 10, y: 92, w: 42, h: 4.6 }, logo: { x: 10, y: 5, w: 22, h: 5 }, badge: { x: 52, y: 5, w: 32, h: 5 } } },
  ],
  printPortrait: [
    { id: 'print-editorial', label: 'Print Editorial', family: 'printPortrait', description: 'Structured print layout with top image and rich body hierarchy.', featured: true, styleBias: ['editorial', 'luxury-clean'], elements: { image: { x: 8, y: 8, w: 84, h: 36, rx: 24 }, title: { x: 8, y: 54, w: 70, fontSize: 34, charsPerLine: 22, maxLines: 3, weight: 760 }, subtitle: { x: 8, y: 68, w: 68, fontSize: 16, charsPerLine: 36, maxLines: 5 }, cta: { x: 8, y: 87, w: 22, h: 5.5 }, logo: { x: 8, y: 4, w: 12, h: 5 }, badge: { x: 72, y: 4, w: 20, h: 5 } } },
    { id: 'poster-impact', label: 'Poster Impact', family: 'printPortrait', description: 'Bold poster-style composition with immersive visual and strong CTA.', featured: true, styleBias: ['bold-promo', 'product-card'], elements: { image: { x: 4, y: 4, w: 92, h: 54, rx: 24 }, title: { x: 8, y: 66, w: 78, fontSize: 36, charsPerLine: 20, maxLines: 3, weight: 820 }, subtitle: { x: 8, y: 79, w: 74, fontSize: 15, charsPerLine: 34, maxLines: 4 }, cta: { x: 8, y: 91, w: 24, h: 5.5 }, logo: { x: 8, y: 4, w: 12, h: 5 }, badge: { x: 70, y: 4, w: 22, h: 5 } } },
  ],
}
