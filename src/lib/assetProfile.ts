import type { ImageProfile } from './types'

export type AssetCharacteristics = {
  imageProfile: ImageProfile
  detectedContrast: 'low' | 'medium' | 'high'
  focalSuggestion: 'center' | 'top' | 'left' | 'right'
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read the uploaded image.'))
    image.src = url
  })
}

export function getImageProfile(width: number, height: number): ImageProfile {
  const ratio = width / height
  if (ratio >= 1.85) return 'ultraWide'
  if (ratio >= 1.15) return 'landscape'
  if (ratio <= 0.66) return 'tall'
  if (ratio <= 0.9) return 'portrait'
  return 'square'
}

export async function analyzeAssetCharacteristics(url: string): Promise<AssetCharacteristics> {
  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return {
      imageProfile: getImageProfile(image.naturalWidth, image.naturalHeight),
      detectedContrast: 'medium',
      focalSuggestion: 'center',
    }
  }

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = longestSide > 64 ? 64 / longestSide : 1
  canvas.width = Math.max(8, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(8, Math.round(image.naturalHeight * scale))
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let minLum = 255
  let maxLum = 0
  let leftMass = 0
  let rightMass = 0
  let topMass = 0
  let centerMass = 0

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4
      const r = pixels[index]
      const g = pixels[index + 1]
      const b = pixels[index + 2]
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      minLum = Math.min(minLum, lum)
      maxLum = Math.max(maxLum, lum)

      const prominence = Math.abs(lum - 128)
      if (x < canvas.width / 3) leftMass += prominence
      if (x > (canvas.width / 3) * 2) rightMass += prominence
      if (y < canvas.height / 3) topMass += prominence
      if (
        x >= canvas.width / 3 &&
        x <= (canvas.width / 3) * 2 &&
        y >= canvas.height / 3 &&
        y <= (canvas.height / 3) * 2
      ) {
        centerMass += prominence
      }
    }
  }

  const contrastRange = maxLum - minLum
  const detectedContrast = contrastRange > 170 ? 'high' : contrastRange > 95 ? 'medium' : 'low'
  const strongest = Math.max(leftMass, rightMass, topMass, centerMass)
  const focalSuggestion =
    strongest === topMass ? 'top' :
    strongest === leftMass ? 'left' :
    strongest === rightMass ? 'right' :
    'center'

  return {
    imageProfile: getImageProfile(image.naturalWidth, image.naturalHeight),
    detectedContrast,
    focalSuggestion,
  }
}

export async function detectImageProfile(url: string) {
  const analysis = await analyzeAssetCharacteristics(url)
  return analysis.imageProfile
}

export function getImageProfileLabel(profile: ImageProfile) {
  switch (profile) {
    case 'ultraWide':
      return 'Ultra-wide'
    case 'landscape':
      return 'Landscape'
    case 'portrait':
      return 'Portrait'
    case 'tall':
      return 'Tall portrait'
    default:
      return 'Square'
  }
}
