import api from '@/lib/api';
import {
  SUPPORT_CHAT_API_PATH,
  buildSupportChatRequest,
  type SupportChatRequest,
  type SupportChatResponse,
} from '@/lib/supportChat';

export {
  SUPPORT_CHAT_API_PATH,
  SUPPORT_CHAT_API_METHOD,
  buildSupportChatRequest,
} from '@/lib/supportChat';

/**
 * Call Django stateless support chat endpoint.
 * Auth token comes from the shared API client when present — no provider keys.
 */
export async function sendSupportChatMessage(
  message: string,
): Promise<SupportChatResponse> {
  const body: SupportChatRequest = buildSupportChatRequest(message);
  const { data } = await api.post<SupportChatResponse>(
    SUPPORT_CHAT_API_PATH,
    body,
  );
  const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';
  if (!answer) {
    throw new Error('BidKori Help returned an empty answer.');
  }
  return { answer };
}
