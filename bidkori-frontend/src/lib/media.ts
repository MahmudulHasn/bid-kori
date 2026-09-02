import { getMediaOrigin } from '@/lib/config';

export function resolveMediaUrl(imagePath?: string | null): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const origin = getMediaOrigin();
  return `${origin}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}
