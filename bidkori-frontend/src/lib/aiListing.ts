/**
 * Pure helpers for Seller AI listing description generation (AI-F01).
 * Browser talks only to Django — never to the provider directly.
 */

import { getApiErrorMessage, getApiStatus } from './apiErrors.ts';
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_BYTES,
  validateProductImageSelection,
  type ProductImageClientValidationResult,
} from './productImageSafety.ts';
import type { ProductCondition } from './seller.ts';

export const AI_LISTING_GENERATE_API_PATH = '/products/generate-description/';
export const AI_LISTING_GENERATE_METHOD = 'POST';
export const AI_LISTING_IMAGE_FIELD = 'image';

/** Same accept list as Product image uploads. */
export const AI_LISTING_IMAGE_ACCEPT = PRODUCT_IMAGE_ACCEPT;

export type GenerateDescriptionRequest = {
  title: string;
  image: File;
  condition?: ProductCondition;
  category?: number | null;
  api_key?: string;
};

export type GenerateDescriptionResponse = {
  description: string;
};

export type AiListingGenerateEligibilityInput = {
  title: string;
  image: File | null;
  generating: boolean;
  /** False when ProductForm fields are frozen/disabled. */
  formEditable: boolean;
  /** Seller-supplied API key (BYOK). */
  apiKey: string;
};

/**
 * Validate a single local image for AI generation (no Product quota).
 * Reuses Product image MIME/size rules.
 */
export function validateAiListingImage(
  file: File | null | undefined,
): ProductImageClientValidationResult {
  if (!file) {
    return { ok: false, error: 'Select a product photo first.' };
  }
  return validateProductImageSelection([file], { images: [] });
}

/**
 * Build multipart payload for POST /products/generate-description/.
 * Does not mutate the source File. Omits null/undefined optional fields.
 */
export function buildGenerateDescriptionFormData(
  input: GenerateDescriptionRequest,
): FormData {
  const formData = new FormData();
  formData.append('title', input.title.trim());
  formData.append(AI_LISTING_IMAGE_FIELD, input.image);

  if (input.condition) {
    formData.append('condition', input.condition);
  }

  if (
    input.category != null &&
    Number.isFinite(input.category) &&
    Number.isInteger(input.category) &&
    input.category > 0
  ) {
    formData.append('category', String(input.category));
  }

  if (input.api_key && input.api_key.trim()) {
    formData.append('api_key', input.api_key.trim());
  }

  return formData;
}

export function canGenerateAiListingDescription(
  input: AiListingGenerateEligibilityInput,
): boolean {
  if (!input.formEditable) return false;
  if (input.generating) return false;
  if (!input.title.trim()) return false;
  if (!input.image) return false;
  if (input.apiKey && input.apiKey.trim() && !validateApiKeyInput(input.apiKey).ok) {
    return false;
  }
  return validateAiListingImage(input.image).ok;
}

/** Empty / whitespace-only description may receive AI draft directly. */
export function descriptionNeedsOverwriteConfirmation(
  currentDescription: string,
): boolean {
  return currentDescription.trim().length > 0;
}

export function shouldApplyAiDraftDirectly(
  currentDescription: string,
): boolean {
  return !descriptionNeedsOverwriteConfirmation(currentDescription);
}

/**
 * Map AI endpoint failures to Seller-facing copy.
 * Prefer backend message when suitable; never expose provider internals.
 */
export function getAiListingErrorMessage(error: unknown): string {
  const status = getApiStatus(error);
  const backendMessage = getApiErrorMessage(error, '').trim();

  if (status === 401) {
    return (
      backendMessage ||
      'The API key was rejected by the AI provider. Check the key and try again.'
    );
  }
  if (status === 402) {
    return (
      backendMessage ||
      'The AI provider could not complete the request. Check your provider account or quota.'
    );
  }
  if (status === 429) {
    return (
      backendMessage ||
      'Too many AI generation requests. Please try again shortly.'
    );
  }
  if (status === 504) {
    return (
      backendMessage ||
      'AI description generation timed out. Please try again.'
    );
  }
  if (status === 503) {
    return (
      backendMessage ||
      'AI description generation is currently unavailable. You can continue writing the description manually.'
    );
  }
  if (status === 502) {
    return (
      backendMessage ||
      'AI description generation is temporarily unavailable. You can continue writing the description manually.'
    );
  }
  if (status === 400) {
    return (
      backendMessage ||
      'We could not generate a description from the current title and photo.'
    );
  }

  return (
    backendMessage ||
    'AI description generation failed. You can continue writing the description manually.'
  );
}

/** Informational disclosure after an AI draft is applied into the form. */
export const AI_DRAFT_DISCLOSURE =
  'AI-generated draft — review and edit before saving.';

export const AI_IMAGE_NOT_AUTO_UPLOADED_HELP =
  'The photo used for AI generation is not uploaded to your Product automatically.';

/** Max bytes for UI copy; mirrors Product image limit. */
export const AI_LISTING_IMAGE_MAX_BYTES = PRODUCT_IMAGE_MAX_BYTES;

// --- BYOK constants ---

export const AI_BYOK_LABEL = 'AI Provider API Key (Optional)';

export const AI_BYOK_HELPER_TEXT =
  'Optional: Leave blank to use BidKori built-in AI. Supports Gemini (AQ.…), Groq (gsk_…), or OpenAI (sk-…). BidKori does not save your API key.';

export const AI_BYOK_KEY_CLEARED_MESSAGE =
  'Your API key has been cleared for security.';

/** Basic client-side API key validation (optional; if provided, must be within reasonable length). */
export function validateApiKeyInput(
  key: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = (key ?? '').trim();
  if (!trimmed) {
    return { ok: true };
  }
  if (trimmed.length > 256) {
    return { ok: false, error: 'API key is too long.' };
  }
  return { ok: true };
}
