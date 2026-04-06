function dataUrlToBytes(dataUrl: string) {
  const [, base64 = ''] = dataUrl.split(',')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bytesToString(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
}

function extractJpegSize(bytes: Uint8Array) {
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3]
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      }
    }
    offset += 2 + length
  }
  throw new Error('Could not parse JPEG size for PDF export.')
}

export function buildPdfFromJpegs(pages: Array<{ dataUrl: string; width: number; height: number }>) {
  const objects: string[] = []
  const binaryBlobs: Array<{ index: number; bytes: Uint8Array }> = []

  const addObject = (content: string) => {
    objects.push(content)
    return objects.length
  }

  const imageObjectIds: number[] = []
  const pageObjectIds: number[] = []
  const contentObjectIds: number[] = []

  for (const page of pages) {
    const jpegBytes = dataUrlToBytes(page.dataUrl)
    const size = extractJpegSize(jpegBytes)
    const imageObjectId = addObject(
      `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    )
    binaryBlobs.push({ index: imageObjectId, bytes: jpegBytes })
    imageObjectIds.push(imageObjectId)

    const content = `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im${imageObjectId} Do\nQ`
    const contentObjectId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    contentObjectIds.push(contentObjectId)

    const pageObjectId = addObject('')
    pageObjectIds.push(pageObjectId)
  }

  const pagesObjectId = addObject('')

  pageObjectIds.forEach((pageObjectId, index) => {
    objects[pageObjectId - 1] =
      `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${pages[index].width} ${pages[index].height}] /Resources << /XObject << /Im${imageObjectIds[index]} ${imageObjectIds[index]} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`
  })

  objects[pagesObjectId - 1] =
    `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`

  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`)

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]

  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}`
    const binary = binaryBlobs.find((entry) => entry.index === index + 1)
    if (binary) {
      pdf += bytesToString(binary.bytes)
      pdf += '\nendstream'
    }
    pdf += `\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}
