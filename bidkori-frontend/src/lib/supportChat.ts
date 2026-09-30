/**
 * Pure helpers for BidKori support chat (AI-F02).
 * Browser talks only to Django — never to the AI provider.
 */

import { getApiErrorMessage, getApiStatus } from './apiErrors.ts';

export const SUPPORT_CHAT_API_PATH = '/ai/chat/';
export const SUPPORT_CHAT_API_METHOD = 'POST';
export const SUPPORT_CHAT_MESSAGE_MAX_LENGTH = 1500;

export type ChatRole = 'user' | 'assistant';

export type ChatAction = {
  type: 'navigate';
  href: string;
  label: string;
};

export type ChatSuggestion = {
  label: string;
  href: string;
};

export type ChatAuctionCard = {
  auction_id: number;
  title: string;
  image_url: string | null;
  current_bid: string;
  starting_bid: string;
  bid_count: number;
  ends_in_seconds: number;
  status: string;
  category_name: string | null;
  has_reserve: boolean;
  reserve_met: boolean | null;
  href: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  action?: ChatAction | null;
  suggestions?: ChatSuggestion[];
  auction_cards?: ChatAuctionCard[];
};

export type SupportChatRequest = {
  message: string;
  pathname?: string;
  context?: Record<string, unknown>;
};

export type SupportChatResponse = {
  answer: string;
  message?: string;
  action?: ChatAction | null;
  suggestions?: ChatSuggestion[];
  auction_cards?: ChatAuctionCard[];
};

export const SUPPORT_CHAT_WELCOME =
  'Hi! I can search live auctions, show current bids and time remaining, browse categories, and help you navigate BidKori. Ask me anything!';

export const SUPPORT_CHAT_SCOPE_DISCLOSURE =
  'BidKori Help can explain platform features and navigate to supported pages. It cannot place bids, access private account data, or perform actions.';

/** Supported BidKori topics only — no Watchlist/refunds/Admin ops. */
export const SUPPORT_CHAT_STARTERS: readonly string[] = [
  'Show me live auctions',
  'What categories are available?',
  'What auctions are ending soon?',
  'How do I place a bid?',
  'What does reserve price mean?',
] as const;

export function getRoleBasedStarters(role?: string | null): readonly string[] {
  if (role === 'BUYER') {
    return [
      'Show me live auctions',
      'What auctions are ending soon?',
      'Take me to My Bids',
      'How do outbid notifications work?',
    ];
  }
  if (role === 'SELLER') {
    return [
      'Show me live auctions',
      'How do I create a product?',
      'Take me to Create Auction',
      'Open seller sales',
    ];
  }
  if (role === 'ADMIN') {
    return [
      'How many auctions are live?',
      'Open user management',
      'Open auction moderation',
      'Take me to admin analytics',
    ];
  }
  return [
    'Show me live auctions',
    'What categories are available?',
    'What auctions are ending soon?',
    'How do I place a bid?',
  ];
}

const UNSUPPORTED_STARTER_MARKERS = [
  'watchlist',
  'refund',
  'dispute',
  'rating',
  'premium',
  'admin management',
  'payment guarantee',
] as const;

export function createChatMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChatMessage(
  role: ChatRole,
  content: string,
  id: string = createChatMessageId(),
  action?: ChatAction | null,
  suggestions?: ChatSuggestion[],
  auction_cards?: ChatAuctionCard[],
): ChatMessage {
  return {
    id,
    role,
    content,
    action: action || null,
    suggestions: suggestions || [],
    auction_cards: auction_cards || [],
  };
}

export function createWelcomeMessages(): ChatMessage[] {
  return [createChatMessage('assistant', SUPPORT_CHAT_WELCOME, 'welcome')];
}

/** Trim and validate. Returns null when the message cannot be sent. */
export function normalizeSupportChatMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > SUPPORT_CHAT_MESSAGE_MAX_LENGTH) return null;
  return trimmed;
}

export function canSendSupportChatMessage(
  raw: string,
  pending: boolean,
): boolean {
  if (pending) return false;
  return normalizeSupportChatMessage(raw) !== null;
}

export function buildSupportChatRequest(
  message: string,
  pathname?: string,
  context?: Record<string, unknown>,
): SupportChatRequest {
  const normalized = normalizeSupportChatMessage(message);
  if (!normalized) {
    throw new Error('Message cannot be empty.');
  }
  const body: SupportChatRequest = { message: normalized };
  if (pathname) {
    body.pathname = pathname;
  }
  if (context && Object.keys(context).length > 0) {
    body.context = context;
  }
  return body;
}

export function appendUserMessage(
  messages: readonly ChatMessage[],
  content: string,
): ChatMessage[] {
  return [...messages, createChatMessage('user', content)];
}

export function appendAssistantMessage(
  messages: readonly ChatMessage[],
  content: string,
  action?: ChatAction | null,
  suggestions?: ChatSuggestion[],
  id?: string,
  auction_cards?: ChatAuctionCard[],
): ChatMessage[] {
  return [...messages, createChatMessage('assistant', content, id, action, suggestions, auction_cards)];
}

export function clearSupportChatMessages(): ChatMessage[] {
  return createWelcomeMessages();
}

/**
 * Map chat endpoint failures to user-facing copy.
 * Prefer backend message when suitable; never expose provider internals.
 */
export function getSupportChatErrorMessage(error: unknown): string {
  const status = getApiStatus(error);
  const backendMessage = getApiErrorMessage(error, '').trim();

  if (status === 400) {
    return backendMessage || 'Please shorten or revise your question.';
  }
  if (status === 429) {
    return backendMessage || 'Too many questions. Please try again shortly.';
  }
  if (status === 504) {
    return (
      backendMessage ||
      'The assistant took too long to respond. Please try again.'
    );
  }
  if (status === 502 || status === 503) {
    return backendMessage || 'BidKori Help is temporarily unavailable.';
  }
  if (!status) {
    return 'Could not reach BidKori Help. Check your connection and try again.';
  }
  return backendMessage || 'BidKori Help is temporarily unavailable.';
}

export function supportChatStartersAreSafe(): boolean {
  const blob = SUPPORT_CHAT_STARTERS.join(' ').toLowerCase();
  return !UNSUPPORTED_STARTER_MARKERS.some((marker) => blob.includes(marker));
}

/** Paths where the support chat should mount. Shown across all workspaces including Admin. */
export function shouldShowSupportChat(pathname: string | null): boolean {
  return true;
}
