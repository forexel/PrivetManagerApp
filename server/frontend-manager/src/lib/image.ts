export type ResizedImage = {
  blob: Blob
  mimeType: string
  fileName: string
}

/**
 * Resize an image so that the longest side is at most `maxSize` pixels.
 * Keeps aspect ratio. If the original image already satisfies the constraint,
 * the original file is returned.
 */
export async function resizeImage(file: File, maxSize: number): Promise<ResizedImage> {
  const image = await readImage(file)
  const { width, height } = image
  const longestSide = Math.max(width, height)

  if (longestSide <= maxSize) {
    return { blob: file, mimeType: file.type, fileName: file.name }
  }

  const scale = maxSize / longestSide
  const targetWidth = Math.round(width * scale)
  const targetHeight = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Не удалось создать canvas-контекст')
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  const mimeType = selectMimeType(file.type)
  const blob = await canvasToBlob(canvas, mimeType, 0.85)
  const extension = mimeType === 'image/png' ? '.png' : '.jpg'
  const baseName = file.name.replace(/\.[^/.]+$/, '')

  return {
    blob,
    mimeType,
    fileName: `${baseName}${extension}`,
  }
}

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'))
      img.src = String(reader.result)
    }
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Не удалось получить Blob из canvas'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function selectMimeType(originalType: string): string {
  if (originalType === 'image/png') return 'image/png'
  if (originalType === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}
