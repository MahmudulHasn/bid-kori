import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SUPPORT_CHAT_API_METHOD,
  SUPPORT_CHAT_API_PATH,
  SUPPORT_CHAT_MESSAGE_MAX_LENGTH,
  SUPPORT_CHAT_STARTERS,
  appendAssistantMessage,
  appendUserMessage,
  buildSupportChatRequest,
  canSendSupportChatMessage,
  clearSupportChatMessages,
  createWelcomeMessages,
  getSupportChatErrorMessage,
  normalizeSupportChatMessage,
  shouldShowSupportChat,
  supportChatStartersAreSafe,
} from './supportChat.ts';

test('support chat API path and method', () => {
  assert.equal(SUPPORT_CHAT_API_PATH, '/ai/chat/');
  assert.equal(SUPPORT_CHAT_API_METHOD, 'POST');
});

test('buildSupportChatRequest contains only message', () => {
  const body = buildSupportChatRequest('  How do I place a bid?  ');
  assert.deepEqual(body, { message: 'How do I place a bid?' });
  assert.equal(Object.keys(body).length, 1);
  assert.ok(!('role' in body));
  assert.ok(!('history' in body));
  assert.ok(!('model' in body));
  assert.ok(!('system_prompt' in body));
  assert.ok(!('tools' in body));
  assert.ok(!('api_key' in body));
  assert.ok(!('user_id' in body));
});

test('message validation: empty/whitespace rejected', () => {
  assert.equal(normalizeSupportChatMessage(''), null);
  assert.equal(normalizeSupportChatMessage('   '), null);
  assert.equal(canSendSupportChatMessage('', false), false);
  assert.equal(canSendSupportChatMessage('  \n', false), false);
});

test('message validation: max length 1500', () => {
  const ok = 'a'.repeat(SUPPORT_CHAT_MESSAGE_MAX_LENGTH);
  const over = 'a'.repeat(SUPPORT_CHAT_MESSAGE_MAX_LENGTH + 1);
  assert.equal(normalizeSupportChatMessage(ok), ok);
  assert.equal(normalizeSupportChatMessage(over), null);
  assert.equal(canSendSupportChatMessage(ok, false), true);
  assert.equal(canSendSupportChatMessage(over, false), false);
});

test('pending blocks send', () => {
  assert.equal(canSendSupportChatMessage('Hello', true), false);
  assert.equal(canSendSupportChatMessage('Hello', false), true);
});

test('error mapping for chat statuses', () => {
  const err = (status: number | undefined) =>
    status == null
      ? { message: 'Network Error' }
      : { response: { status, data: {} } };

  assert.match(getSupportChatErrorMessage(err(400)), /shorten|revise/i);
  assert.match(getSupportChatErrorMessage(err(429)), /too many/i);
  assert.match(getSupportChatErrorMessage(err(502)), /temporarily unavailable/i);
  assert.match(getSupportChatErrorMessage(err(503)), /temporarily unavailable/i);
  assert.match(getSupportChatErrorMessage(err(504)), /too long/i);
  assert.match(getSupportChatErrorMessage(err(undefined)), /connection|reach/i);
});

test('session history helpers append and clear', () => {
  let messages = createWelcomeMessages();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'assistant');

  messages = appendUserMessage(messages, 'How do I place a bid?');
  assert.equal(messages.length, 2);
  assert.equal(messages[1].role, 'user');

  const beforeError = messages;
  messages = appendAssistantMessage(
    messages,
    'BidKori Help is temporarily unavailable.',
  );
  assert.equal(messages.length, 3);
  assert.equal(beforeError.length, 2);
  assert.equal(messages[1].content, 'How do I place a bid?');

  messages = clearSupportChatMessages();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'assistant');
});

test('starter questions are supported BidKori topics only', () => {
  assert.equal(supportChatStartersAreSafe(), true);
  assert.ok(SUPPORT_CHAT_STARTERS.length >= 3);
  const blob = SUPPORT_CHAT_STARTERS.join(' ').toLowerCase();
  assert.ok(!blob.includes('watchlist'));
  assert.ok(!blob.includes('refund'));
  assert.ok(!blob.includes('dispute'));
});

test('shouldShowSupportChat hides Admin workspace', () => {
  assert.equal(shouldShowSupportChat('/'), true);
  assert.equal(shouldShowSupportChat('/auctions'), true);
  assert.equal(shouldShowSupportChat('/search'), true);
  assert.equal(shouldShowSupportChat('/buyer'), true);
  assert.equal(shouldShowSupportChat('/seller/auctions'), true);
  assert.equal(shouldShowSupportChat('/admin'), false);
  assert.equal(shouldShowSupportChat('/admin/analytics'), false);
});

test('support chat helpers do not reference provider secrets', async () => {
  const mod = await import('./supportChat.ts');
  const blob = JSON.stringify(mod).toLowerCase();
  assert.ok(!blob.includes('ai_api_key'));
  assert.ok(!blob.includes('ai_chat_model'));
  assert.ok(!blob.includes('openai'));
  assert.ok(!blob.includes('sk-'));
});
