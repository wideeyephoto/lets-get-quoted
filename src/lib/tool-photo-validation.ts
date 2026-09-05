export const TOOL_PHOTOS_BUCKET = 'tool-photos';
export const MAX_TOOL_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_TOOL_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateToolPhotoFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TOOL_PHOTO_TYPES.has(file.type)) {
    return { valid: false, error: 'Equipment photos must be JPG, PNG, or WebP format.' };
  }
  if (file.size > MAX_TOOL_PHOTO_BYTES) {
    return { valid: false, error: 'Equipment photos must be 5 MB or smaller.' };
  }
  return { valid: true };
}

export function assertValidToolPhotoFile(file: File): void {
  const check = validateToolPhotoFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }
}
