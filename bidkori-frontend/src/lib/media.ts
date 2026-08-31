export function resolveMediaUrl(imagePath?: string | null): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  return `http://127.0.0.1:8000${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}
