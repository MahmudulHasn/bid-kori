'use client';

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowRight,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { sendSupportChatMessage } from '@/lib/supportChatApi';
import {
  SUPPORT_CHAT_MESSAGE_MAX_LENGTH,
  SUPPORT_CHAT_SCOPE_DISCLOSURE,
  appendAssistantMessage,
  appendUserMessage,
  canSendSupportChatMessage,
  clearSupportChatMessages,
  createChatMessageId,
  createWelcomeMessages,
  getRoleBasedStarters,
  getSupportChatErrorMessage,
  normalizeSupportChatMessage,
  type ChatMessage,
} from '@/lib/supportChat';

function formatLineContent(text: string) {
  const bulletMatch = text.match(/^(\s*[-*•]\s+)(.*)$/);
  const numberMatch = text.match(/^(\s*\d+\.\s+)(.*)$/);

  let prefix: React.ReactNode = null;
  let body = text;

  if (bulletMatch) {
    prefix = (
      <span className="mr-2 inline-block select-none font-bold text-amber-500">
        •
      </span>
    );
    body = bulletMatch[2];
  } else if (numberMatch) {
    prefix = (
      <span className="mr-1.5 inline-block select-none font-semibold text-amber-500">
        {numberMatch[1].trim()}
      </span>
    );
    body = numberMatch[2];
  }

  // Parse **bold** markers safely
  const parts = body.split(/(\*\*.*?\*\*)/g);
  return (
    <span className="inline">
      {prefix}
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong
              key={i}
              className="font-semibold text-zinc-950 dark:text-white"
            >
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      })}
    </span>
  );
}

function AnimatedAssistantBubble({
  message,
  shouldAnimate,
  onLineRevealed,
  onActionClick,
}: {
  message: ChatMessage;
  shouldAnimate: boolean;
  onLineRevealed: () => void;
  onActionClick: (href: string) => void;
}) {
  const lines = useMemo(() => message.content.split('\n'), [message.content]);
  const [visibleCount, setVisibleCount] = useState(() =>
    shouldAnimate ? 1 : lines.length,
  );
  const [isDone, setIsDone] = useState(
    () => !shouldAnimate || lines.length <= 1,
  );

  useEffect(() => {
    if (!shouldAnimate || isDone) return;
    if (visibleCount >= lines.length) {
      setIsDone(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setVisibleCount((prev) => {
        const next = prev + 1;
        if (next >= lines.length) {
          setIsDone(true);
        }
        return next;
      });
      onLineRevealed();
    }, 130);

    return () => window.clearTimeout(timer);
  }, [shouldAnimate, isDone, visibleCount, lines.length, onLineRevealed]);

  const handleSkip = () => {
    if (!isDone) {
      setVisibleCount(lines.length);
      setIsDone(true);
      onLineRevealed();
    }
  };

  const visibleLines = lines.slice(0, visibleCount);

  return (
    <div
      onClick={handleSkip}
      className={!isDone ? 'cursor-pointer select-text' : 'select-text'}
      title={!isDone ? 'Click to show all lines' : undefined}
    >
      <div className="space-y-1">
        {visibleLines.map((line, idx) => {
          if (!line.trim()) {
            return <div key={idx} className="h-1.5" />;
          }
          const isCurrentRevealedLine =
            shouldAnimate && idx === visibleCount - 1 && !isDone;
          return (
            <div
              key={idx}
              className={[
                'leading-relaxed break-words',
                shouldAnimate && idx === visibleCount - 1
                  ? 'animate-chat-line'
                  : '',
              ].join(' ')}
            >
              {formatLineContent(line)}
              {isCurrentRevealedLine ? (
                <span
                  className="ml-1 inline-block h-3.5 w-1.5 rounded-xs bg-amber-500 animate-pulse align-middle"
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {isDone && message.action ? (
        <div className="mt-2.5 pt-2 border-t border-zinc-200/80 dark:border-zinc-800 animate-chat-line">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onActionClick(message.action!.href);
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-amber-500 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
          >
            <span>{message.action.label}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      {isDone && message.suggestions && message.suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pt-1 animate-chat-line">
          {message.suggestions.map((sug) => (
            <button
              key={sug.href + sug.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onActionClick(sug.href);
              }}
              className="inline-flex min-h-[32px] items-center rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition hover:border-amber-500 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-amber-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
            >
              {sug.label} →
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Floating BidKori Help button + mobile-safe role-aware chat panel (CHAT-X01).
 * In-memory session history only — no localStorage / server persistence.
 */
export default function SupportChat() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

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
  const [latestAnimatedId, setLatestAnimatedId] = useState<string | null>(null);

  const starters = getRoleBasedStarters(user?.role);

  const closePanel = () => {
    setOpen(false);
    window.setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollToBottom();
  }, [messages, pending, open, scrollToBottom]);

  // Accessibility: Close panel on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const sendMessage = async (raw: string) => {
    const normalized = normalizeSupportChatMessage(raw);
    if (!normalized || pending) return;

    setDraft('');
    setMessages((prev) => appendUserMessage(prev, normalized));
    setPending(true);

    try {
      const clientContext: Record<string, unknown> = {};
      // Detect safe public auction state from DOM if on an auction detail page
      if (typeof document !== 'undefined' && pathname.startsWith('/auctions/')) {
        const badge = document.querySelector('[data-auction-state]');
        if (badge) {
          const stateAttr = badge.getAttribute('data-auction-state');
          if (stateAttr) clientContext.auction_state = stateAttr;
        }
      }

      const { answer, action, suggestions } = await sendSupportChatMessage(
        normalized,
        pathname,
        clientContext,
      );
      const newId = createChatMessageId();
      setLatestAnimatedId(newId);
      setMessages((prev) =>
        appendAssistantMessage(prev, answer, action, suggestions, newId),
      );
    } catch (error: unknown) {
      const message = getSupportChatErrorMessage(error);
      const errId = createChatMessageId();
      setLatestAnimatedId(errId);
      setMessages((prev) => appendAssistantMessage(prev, message, null, [], errId));
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
            'group fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 inline-flex items-center gap-3 rounded-full',
            'bg-zinc-950/90 text-white p-2 pr-4 shadow-xl shadow-amber-950/40 backdrop-blur-md',
            'border border-amber-500/40 hover:border-amber-400 hover:shadow-amber-500/30',
            'transition-all duration-300 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-amber-500',
          ].join(' ')}
          aria-haspopup="dialog"
          aria-expanded={false}
          aria-label="Open BidKori Help"
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-tr from-amber-500 via-amber-400 to-sky-500 p-0.5 shadow-xs transition-transform duration-300 group-hover:rotate-6">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-950 overflow-hidden">
              <Image
                src="/bidkori-chatbot-mascot.png"
                alt="BidKori AI Mascot"
                width={36}
                height={36}
                className="h-8 w-8 object-contain transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-zinc-950 bg-emerald-500" />
            </span>
          </div>
          <span className="text-sm font-bold tracking-wide text-[#ffb600] group-hover:text-[#ffc425] transition-colors pr-1">
            Ask BidKori
          </span>
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-end sm:p-5">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-xs transition-opacity animate-backdrop-in"
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
              'relative flex h-[min(100dvh,100%)] w-full flex-col bg-white shadow-2xl animate-sheet-up',
              'dark:bg-zinc-950 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:max-w-md sm:rounded-2xl',
              'border border-zinc-200 dark:border-zinc-800 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]',
            ].join(' ')}
          >
            <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-amber-500/20 via-sky-500/15 to-blue-500/20 p-1 border border-amber-500/30">
                <Image
                  src="/bidkori-chatbot-mascot.png"
                  alt="BidKori Assistant"
                  width={36}
                  height={36}
                  className="h-8 w-8 object-contain"
                />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-950 bg-emerald-500" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2
                    id={titleId}
                    className="text-base font-bold text-zinc-900 dark:text-white"
                  >
                    BidKori Assistant
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Ask how bidding, auctions, products, and notifications work.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMessages(clearSupportChatMessages());
                    setLatestAnimatedId(null);
                  }}
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
              {messages.map((message) => {
                if (message.role === 'user') {
                  return (
                    <div
                      key={message.id}
                      className="ml-auto max-w-[92%] rounded-2xl bg-amber-600 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-white shadow-xs"
                    >
                      {message.content}
                    </div>
                  );
                }

                return (
                  <div
                    key={message.id}
                    className="mr-auto flex items-start gap-2.5 max-w-[94%]"
                  >
                    <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center overflow-hidden">
                      <Image
                        src="/bidkori-chatbot-mascot.png"
                        alt="BidKori Assistant"
                        width={24}
                        height={24}
                        className="h-6 w-6 object-contain"
                      />
                    </div>
                    <div className="flex-1 rounded-2xl border border-zinc-200/60 bg-zinc-100 px-3.5 py-2.5 text-sm leading-relaxed break-words text-zinc-900 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                      <AnimatedAssistantBubble
                        message={message}
                        shouldAnimate={
                          message.id === latestAnimatedId &&
                          message.id !== 'welcome'
                        }
                        onLineRevealed={scrollToBottom}
                        onActionClick={(href) => {
                          closePanel();
                          router.push(href);
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {pending ? (
                <div
                  className="mr-auto flex items-center gap-2.5"
                  aria-live="polite"
                >
                  <div className="shrink-0 h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center overflow-hidden animate-pulse">
                    <Image
                      src="/bidkori-chatbot-mascot.png"
                      alt="BidKori Assistant"
                      width={24}
                      height={24}
                      className="h-6 w-6 object-contain"
                    />
                  </div>
                  <div className="inline-flex items-center gap-2.5 rounded-2xl border border-zinc-200/60 bg-zinc-100 px-3.5 py-2 text-sm text-zinc-600 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" />
                    </span>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      BidKori Assistant is thinking…
                    </span>
                  </div>
                </div>
              ) : null}

              {!pending && messages.length <= 1 ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Suggested questions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {starters.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        disabled={pending}
                        onClick={() => void sendMessage(starter)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-800 transition hover:border-amber-500 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-amber-950/30"
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
