import api from '@/lib/api';
import {
  AI_LISTING_GENERATE_API_PATH,
  buildGenerateDescriptionFormData,
  type GenerateDescriptionRequest,
  type GenerateDescriptionResponse,
} from '@/lib/aiListing';

export {
  AI_LISTING_GENERATE_API_PATH,
  AI_LISTING_GENERATE_METHOD,
  AI_LISTING_IMAGE_FIELD,
  buildGenerateDescriptionFormData,
} from '@/lib/aiListing';

/**
 * Call Django multimodal description endpoint.
 * Auth token comes from the shared API client — no provider keys in the browser.
 */
export async function generateProductDescription(
  input: GenerateDescriptionRequest,
): Promise<GenerateDescriptionResponse> {
  const formData = buildGenerateDescriptionFormData(input);
  const { data } = await api.post<GenerateDescriptionResponse>(
    AI_LISTING_GENERATE_API_PATH,
    formData,
  );
  const description =
    typeof data?.description === 'string' ? data.description.trim() : '';
  if (!description) {
    throw new Error('AI description generation returned an empty draft.');
  }
  return { description };
}
