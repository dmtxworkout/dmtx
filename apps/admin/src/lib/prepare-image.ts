'use client';

// Cloudflare Images takes files up to 10 MB (and 12 000 px a side). A bigger
// file, typically a PNG export, is re-encoded here as a JPEG at the same
// size in pixels (or capped at 8000 px) before it leaves the browser: the
// upload is a tenth of the size and nothing is lost that a cover would show.
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 8000;

export async function prepareImage(file: File): Promise<File> {
  if (file.size <= IMAGE_MAX_BYTES) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('La imagen pesa más de 10 MB y el navegador no pudo convertirla; expórtala como JPEG');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo convertir la imagen');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.9, 0.82, 0.74, 0.65]) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    if (blob.size <= IMAGE_MAX_BYTES) {
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
    }
  }
  throw new Error('La imagen sigue pesando más de 10 MB tras convertirla; redúcela antes de subirla');
}
