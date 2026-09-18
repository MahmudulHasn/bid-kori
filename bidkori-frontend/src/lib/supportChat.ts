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

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  action?: ChatAction | null;
  suggestions?: ChatSuggestion[];
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
};

export const SUPPORT_CHAT_WELCOME =
  'Hi! I can help explain how BidKori bidding, auctions, products, and notifications work, or help you navigate.';

export const SUPPORT_CHAT_SCOPE_DISCLOSURE =
  'BidKori Help can explain platform features and navigate to supported pages. It cannot place bids, access private account data, or perform actions.';

/** Supported BidKori topics only — no Watchlist/refunds/Admin ops. */
export const SUPPORT_CHAT_STARTERS: readonly string[] = [
  'How do I place a bid?',
  'What happens if I am outbid?',
  'How do Sellers create an auction?',
  'What does reserve price mean?',
  'Where can I see auctions I won?',
] as const;

export function getRoleBasedStarters(role?: string | null): readonly string[] {
  if (role === 'BUYER') {
    return [
      'Take me to My Bids',
      'Where are my won auctions?',
      'How do outbid notifications work?',
      'Where can I edit my profile?',
    ];
  }
  if (role === 'SELLER') {
    return [
      'How do I create a product?',
      'Take me to Create Auction',
      'Open seller sales',
      'How do Seller notifications work?',
    ];
  }
  if (role === 'ADMIN') {
    return [
      'Open user management',
      'Open auction moderation',
      'Take me to admin analytics',
      'Where can I manage products?',
    ];
  }
  return [
    'How do I place a bid?',
    'What does reserve price mean?',
    'How do I become a seller?',
    'Take me to auctions',
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
): ChatMessage {
  return { id, role, content, action: action || null, suggestions: suggestions || [] };
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
): ChatMessage[] {
  return [...messages, createChatMessage('assistant', content, undefined, action, suggestions)];
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

/** Paths where the support chat must not mount (Admin workspace). */
export function shouldShowSupportChat(pathname: string | null): boolean {
  if (!pathname) return true;
  return !pathname.startsWith('/admin');
}
