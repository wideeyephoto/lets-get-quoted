'use client';

export async function compressImage(
  file: File,
  maxDimension = 1800,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare the image.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Unable to compress image.')),
      'image/webp',
      quality
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-');
  return new File([blob], `${baseName || 'project-photo'}.webp`, { type: 'image/webp' });
}