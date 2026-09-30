import api from '@/lib/api';
import {
  SUPPORT_CHAT_API_PATH,
  buildSupportChatRequest,
  type SupportChatRequest,
  type SupportChatResponse,
  type ChatAuctionCard,
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
  pathname?: string,
  context?: Record<string, unknown>,
): Promise<SupportChatResponse> {
  const body: SupportChatRequest = buildSupportChatRequest(
    message,
    pathname,
    context,
  );
  const { data } = await api.post<SupportChatResponse>(
    SUPPORT_CHAT_API_PATH,
    body,
  );
  const answer =
    typeof data?.answer === 'string' && data.answer.trim()
      ? data.answer.trim()
      : typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : '';
  if (!answer) {
    throw new Error('BidKori Help returned an empty answer.');
  }

  // Parse auction cards — validate structure from backend
  let auctionCards: ChatAuctionCard[] = [];
  if (Array.isArray(data?.auction_cards)) {
    auctionCards = data.auction_cards.filter(
      (card): card is ChatAuctionCard =>
        typeof card === 'object' &&
        card !== null &&
        typeof card.auction_id === 'number' &&
        typeof card.title === 'string' &&
        typeof card.href === 'string',
    );
  }

  return {
    answer,
    message: answer,
    action: data?.action || null,
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
    auction_cards: auctionCards,
  };
}

