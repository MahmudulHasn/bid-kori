'use client';

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { HelpCircle, MessageCircle, SendHorizontal, Trash2, X } from 'lucide-react';

import { sendSupportChatMessage } from '@/lib/supportChatApi';
import {
  SUPPORT_CHAT_MESSAGE_MAX_LENGTH,
  SUPPORT_CHAT_SCOPE_DISCLOSURE,
  SUPPORT_CHAT_STARTERS,
  appendAssistantMessage,
  appendUserMessage,
  canSendSupportChatMessage,
  clearSupportChatMessages,
  createWelcomeMessages,
  getSupportChatErrorMessage,
  normalizeSupportChatMessage,
  type ChatMessage,
} from '@/lib/supportChat';

/**
 * Floating BidKori Help button + mobile-safe chat panel.
 * In-memory session history only — no localStorage / server persistence.
 */
export default function SupportChat() {
  const titleId = useId();
  const disclosureId = useId();
  const inputId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    createWelcomeMessages(),
  );
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, pending, open]);

  const closePanel = () => {
    setOpen(false);
    window.setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  const sendMessage = async (raw: string) => {
    const normalized = normalizeSupportChatMessage(raw);
    if (!normalized || pending) return;

    setDraft('');
    setMessages((prev) => appendUserMessage(prev, normalized));
    setPending(true);

    try {
      const { answer } = await sendSupportChatMessage(normalized);
      setMessages((prev) => appendAssistantMessage(prev, answer));
    } catch (error: unknown) {
      const message = getSupportChatErrorMessage(error);
      setMessages((prev) => appendAssistantMessage(prev, message));
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  };

  const canSend = canSendSupportChatMessage(draft, pending);
  const remaining = SUPPORT_CHAT_MESSAGE_MAX_LENGTH - draft.length;

  return (
    <>
      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className={[
            'fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full',
            'bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-lg',
            'transition hover:bg-amber-500 focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-amber-500',
          ].join(' ')}
          aria-haspopup="dialog"
          aria-expanded={false}
          aria-label="Open BidKori Help"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Ask BidKori
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-end sm:p-5">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/40"
            aria-label="Close BidKori Help"
            onClick={closePanel}
          />

          <section
            id="bidkori-support-chat-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={disclosureId}
            className={[
              'relative flex h-[min(100dvh,100%)] w-full flex-col bg-white shadow-2xl',
              'dark:bg-zinc-950 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:max-w-md sm:rounded-2xl',
              'border border-zinc-200 dark:border-zinc-800',
            ].join(' ')}
          >
            <header className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-700 dark:text-amber-300">
                <HelpCircle className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className="text-base font-semibold text-zinc-900 dark:text-white"
                >
                  BidKori Help
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Ask how bidding, auctions, products, and notifications work.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMessages(clearSupportChatMessages())}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                  aria-label="Clear chat"
                  title="Clear chat"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                  aria-label="Close BidKori Help"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </header>

            <p
              id={disclosureId}
              className="border-b border-zinc-200 px-4 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
            >
              {SUPPORT_CHAT_SCOPE_DISCLOSURE}
            </p>

            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="BidKori Help conversation"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={[
                    'max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
                    message.role === 'user'
                      ? 'ml-auto bg-amber-600 text-white'
                      : 'mr-auto bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
                  ].join(' ')}
                >
                  {message.content}
                </div>
              ))}

              {pending ? (
                <div
                  className="mr-auto max-w-[92%] rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
                  aria-live="polite"
                >
                  BidKori Help is thinking…
                </div>
              ) : null}

              {!pending && messages.length <= 1 ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Suggested questions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORT_CHAT_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        disabled={pending}
                        onClick={() => void sendMessage(starter)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:border-amber-500/50 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-amber-950/30"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <form
              onSubmit={onSubmit}
              className="border-t border-zinc-200 p-3 dark:border-zinc-800"
            >
              <label htmlFor={inputId} className="sr-only">
                Ask BidKori Help
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  id={inputId}
                  rows={2}
                  value={draft}
                  maxLength={SUPPORT_CHAT_MESSAGE_MAX_LENGTH}
                  disabled={pending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask about bidding, auctions, products…"
                  className="min-h-[2.75rem] max-h-28 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-amber-500/40 placeholder:text-zinc-400 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                  aria-label="Send message"
                >
                  <SendHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span>Enter to send · Shift+Enter for a new line</span>
                <span aria-live="polite">
                  {remaining < 200 ? `${remaining} left` : null}
                </span>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
