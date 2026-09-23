'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Headphones,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { MARKETPLACE_ROUTES } from '@/lib/marketplace';

const SUPPORT_CATEGORIES = [
  'General Inquiry',
  'Bidding & Auction Assistance',
  'Seller Verification & Payouts',
  'Payment & Escrow Inquiries',
  'Dispute Resolution & Item Condition',
  'Technical Support & Bug Report',
] as const;

type UrgencyLevel = 'normal' | 'high' | 'urgent';

const URGENCY_OPTIONS: { id: UrgencyLevel; label: string; desc: string; badgeColor: string }[] = [
  { id: 'normal', label: 'Standard', desc: 'Response in 2–4 hours', badgeColor: 'border-zinc-700 bg-zinc-850 text-zinc-300' },
  { id: 'high', label: 'High Priority', desc: 'Active auction closing soon', badgeColor: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  { id: 'urgent', label: 'Urgent', desc: 'Payment or account freeze', badgeColor: 'border-rose-500/30 bg-rose-500/10 text-rose-400' },
];

const FAQS = [
  {
    q: 'How does live auction bidding work on BidKori?',
    a: 'Registered buyers place real-time bids that sync instantly via WebSockets. If a bid is placed in the final seconds, our anti-sniping engine automatically extends the countdown by 60 seconds to ensure fair competition.',
  },
  {
    q: 'What are the steps after winning an auction?',
    a: 'Winners have a dedicated checkout window to review seller condition notes, unlock seller delivery fulfillment details, and complete payment safely into platform escrow.',
  },
  {
    q: 'How do I become a verified BidKori seller?',
    a: 'Sign up for a seller account, submit your business or national ID verification, and our Dhaka compliance team typically approves verified seller status within 24 business hours.',
  },
  {
    q: 'How does BidKori protect buyers against counterfeit items?',
    a: 'Every listing undergoes initial automated and manual moderation. Payments remain secured in platform escrow until delivery verification, and buyers can file dispute tickets within 48 hours of delivery.',
  },
];

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0]);
  const [urgency, setUrgency] = useState<UrgencyLevel>('normal');
  const [message, setMessage] = useState('');
  const [auctionId, setAuctionId] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ id: string; email: string } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // FAQ accordion state
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const characterCount = message.length;
  const isMessageValid = characterCount >= 10;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setValidationError('Please enter a valid email address so our team can reach you.');
      return;
    }
    if (!isMessageValid) {
      setValidationError('Please provide at least 10 characters describing your inquiry.');
      return;
    }

    setIsSubmitting(true);

    // Simulate immediate backend ticket creation with deterministic reference
    setTimeout(() => {
      const generatedTicket = `BK-${Math.floor(100000 + Math.random() * 900000)}`;
      setSubmittedTicket({ id: generatedTicket, email });
      setIsSubmitting(false);
    }, 600);
  };

  const handleResetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setCategory(SUPPORT_CATEGORIES[0]);
    setUrgency('normal');
    setMessage('');
    setAuctionId('');
    setSubmittedTicket(null);
    setValidationError(null);
  };

  const currentBSTTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date());
    } catch {
      return '11:00 AM';
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#06080D] text-white">
      {/* ========================================================================= */}
      {/* 1. HERO HEADER */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden pt-10 pb-12 sm:pt-14 sm:pb-16 border-b border-zinc-800/80">
        {/* Ambient radial glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-1/3 -z-10 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]"
        />

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-zinc-400">
            <Link href={MARKETPLACE_ROUTES.home} className="hover:text-amber-400 transition">
              Home
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-white font-medium">Contact Us</span>
          </nav>

          <div className="max-w-2xl">
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-400">
              <Headphones className="h-3.5 w-3.5 text-amber-400" />
              <span>24/7 Dedicated Marketplace Support</span>
            </div>

            <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              We&apos;re here to help <br />
              <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">
                you bid &amp; sell with confidence.
              </span>
            </h1>

            <p className="mt-4 text-sm sm:text-base text-zinc-400 leading-relaxed">
              Have questions regarding live auctions, seller verification, escrow protection, or technical issues?
              Our dedicated support team in Dhaka responds within 2 hours.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. CHANNELS OVERVIEW CARDS */}
      {/* ========================================================================= */}
      <section aria-label="Support Channels" className="py-10 border-b border-zinc-800/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Email Support */}
            <a
              href="mailto:support@bidkori.com"
              className="group rounded-2xl border border-zinc-800 bg-[#0B0F1A] p-5 transition-all duration-300 hover:border-amber-500/40 hover:bg-[#0F1424] hover:shadow-lg hover:shadow-amber-500/5 flex flex-col justify-between"
            >
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 transition-transform duration-200 group-hover:scale-105">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-sm font-bold text-white">Email Desk</h2>
                <p className="mt-1 text-xs text-zinc-400">Direct ticket routing with sub-2h turnaround.</p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-850 flex items-center justify-between text-xs font-semibold text-amber-400">
                <span>support@bidkori.com</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </a>

            {/* Card 2: Hotline & Phone */}
            <a
              href="tel:+8801700000000"
              className="group rounded-2xl border border-zinc-800 bg-[#0B0F1A] p-5 transition-all duration-300 hover:border-emerald-500/40 hover:bg-[#0F1424] hover:shadow-lg hover:shadow-emerald-500/5 flex flex-col justify-between"
            >
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 transition-transform duration-200 group-hover:scale-105">
                  <Phone className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-sm font-bold text-white">Hotline &amp; Voice</h2>
                <p className="mt-1 text-xs text-zinc-400">Direct phone support for urgent bid disputes.</p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-850 flex items-center justify-between text-xs font-semibold text-emerald-400">
                <span>+880 1700-000000</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </a>

            {/* Card 3: WhatsApp Support */}
            <a
              href="https://wa.me/8801700000000"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-zinc-800 bg-[#0B0F1A] p-5 transition-all duration-300 hover:border-teal-500/40 hover:bg-[#0F1424] hover:shadow-lg hover:shadow-teal-500/5 flex flex-col justify-between"
            >
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-400 transition-transform duration-200 group-hover:scale-105">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-sm font-bold text-white">WhatsApp Chat</h2>
                <p className="mt-1 text-xs text-zinc-400">Instant messaging for seller document onboarding.</p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-850 flex items-center justify-between text-xs font-semibold text-teal-400">
                <span>Chat on WhatsApp</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </a>

            {/* Card 4: Dhaka HQ */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0B0F1A] p-5 flex flex-col justify-between">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-400">
                  <MapPin className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-sm font-bold text-white">Dhaka Headquarters</h2>
                <p className="mt-1 text-xs text-zinc-400">Gulshan-2, Dhaka 1212, Bangladesh.</p>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-850 flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Dhaka Time: <strong className="text-zinc-200">{currentBSTTime} BST</strong></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. MAIN INTERACTION SECTION: FORM + SIDEBAR */}
      {/* ========================================================================= */}
      <section className="py-14 border-b border-zinc-800/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left: Contact Form (Col 7) */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-zinc-800 bg-[#0B0F1A] p-6 sm:p-8 shadow-2xl relative">
                {/* Header */}
                <div className="flex items-center justify-between pb-6 border-b border-zinc-800">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white">Send Us a Message</h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Fill out the form below. We will assign a ticket to our dedicated specialist.
                    </p>
                  </div>
                  <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <Send className="h-4 w-4" />
                  </div>
                </div>

                {submittedTicket ? (
                  /* Success State */
                  <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center animate-fade-in">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 shadow-lg">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">Message Received!</h3>
                    <p className="mt-1.5 text-xs text-zinc-300 max-w-md mx-auto leading-relaxed">
                      Your inquiry has been logged as support ticket{' '}
                      <span className="font-mono font-bold text-amber-400">{submittedTicket.id}</span>.
                      A confirmation has been sent to{' '}
                      <span className="font-semibold text-white">{submittedTicket.email}</span>.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <Link
                        href={MARKETPLACE_ROUTES.auctions}
                        className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-xs font-bold text-zinc-950 transition hover:from-amber-400 hover:to-amber-500"
                      >
                        Browse Live Auctions
                      </Link>
                      <button
                        type="button"
                        onClick={handleResetForm}
                        className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-850 hover:text-white transition"
                      >
                        Send Another Message
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Form State */
                  <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    {validationError && (
                      <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>{validationError}</span>
                      </div>
                    )}

                    {/* Name & Email Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="contact-name" className="block text-xs font-semibold text-zinc-300">
                          Full Name <span className="text-amber-400">*</span>
                        </label>
                        <input
                          id="contact-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Tanvir Ahmed"
                          className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-[#07090E] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="contact-email" className="block text-xs font-semibold text-zinc-300">
                          Email Address <span className="text-amber-400">*</span>
                        </label>
                        <input
                          id="contact-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="tanvir@example.com"
                          className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-[#07090E] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 outline-none"
                        />
                      </div>
                    </div>

                    {/* Phone & Auction ID Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="contact-phone" className="block text-xs font-semibold text-zinc-300">
                          Phone Number <span className="text-zinc-500">(Optional)</span>
                        </label>
                        <input
                          id="contact-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+880 17..."
                          className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-[#07090E] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="contact-auction-id" className="block text-xs font-semibold text-zinc-300">
                          Related Auction ID <span className="text-zinc-500">(If applicable)</span>
                        </label>
                        <input
                          id="contact-auction-id"
                          type="text"
                          value={auctionId}
                          onChange={(e) => setAuctionId(e.target.value)}
                          placeholder="e.g. #278"
                          className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-[#07090E] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 outline-none"
                        />
                      </div>
                    </div>

                    {/* Category Dropdown */}
                    <div>
                      <label htmlFor="contact-category" className="block text-xs font-semibold text-zinc-300">
                        Inquiry Topic <span className="text-amber-400">*</span>
                      </label>
                      <select
                        id="contact-category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-[#07090E] px-3.5 py-2.5 text-sm text-white transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 outline-none"
                      >
                        {SUPPORT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat} className="bg-[#0B0F1A] text-white">
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Urgency Selector */}
                    <div>
                      <span className="block text-xs font-semibold text-zinc-300 mb-1.5">
                        Urgency Level
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {URGENCY_OPTIONS.map((opt) => {
                          const isSelected = urgency === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setUrgency(opt.id)}
                              className={`rounded-xl border p-2.5 text-left transition-all ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-500/10 text-white shadow-xs'
                                  : 'border-zinc-800 bg-[#07090E] text-zinc-400 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white">{opt.label}</span>
                                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                              </div>
                              <p className="mt-0.5 text-[10px] text-zinc-400">{opt.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Message Area */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="contact-message" className="block text-xs font-semibold text-zinc-300">
                          Message Details <span className="text-amber-400">*</span>
                        </label>
                        <span className={`text-[10px] font-mono ${isMessageValid ? 'text-zinc-500' : 'text-amber-400'}`}>
                          {characterCount}/10 min chars
                        </span>
                      </div>
                      <textarea
                        id="contact-message"
                        required
                        rows={4}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Please describe your question or issue in detail. Include any relevant auction titles, timestamps, or transaction IDs..."
                        className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-[#07090E] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 outline-none resize-y"
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/25 transition hover:from-amber-400 hover:to-amber-500 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
                            <span>Routing Your Ticket...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            <span>Submit Support Request</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Right: AI Instant Help & Guarantees (Col 5) */}
            <div className="lg:col-span-5 space-y-6">
              {/* AI Site Assistant Card */}
              <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-[#0B0F1A] to-[#0B0F1A] p-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">Ask BidKori AI Assistant</h3>
                    <p className="text-[11px] text-zinc-400">Available 24/7 in bottom right corner</p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-zinc-300 leading-relaxed">
                  Need an instant answer right now? Our AI marketplace assistant knows all auction countdown rules, seller verification guidelines, anti-sniping policies, and delivery procedures.
                </p>

                <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Click &quot;Ask BidKori&quot; anytime at the bottom right.</span>
                </div>
              </div>

              {/* SLA & Guarantees */}
              <div className="rounded-3xl border border-zinc-800 bg-[#0B0F1A] p-6 shadow-xl">
                <h3 className="text-sm font-bold text-white">Our Support Commitments</h3>
                <ul className="mt-4 space-y-3">
                  <li className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mt-0.5">
                      <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Sub-2h Email Turnaround</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">Tickets receive personal response from our Dhaka team within 2 hours during active market hours.</p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 mt-0.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Guaranteed Escrow Protection</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">Winner payments are safeguarded until the item is delivered and inspected in accordance with condition terms.</p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-400 mt-0.5">
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Live Dispute Mediation</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">Dedicated administrative resolution if a winning product does not match the auction description.</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Quick Hours Card */}
              <div className="rounded-2xl border border-zinc-850 bg-[#07090E] p-4 text-xs text-zinc-400 space-y-1.5">
                <div className="flex items-center justify-between text-zinc-200 font-semibold">
                  <span>Operating Hours</span>
                  <span className="text-emerald-400">Online Now</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Customer Desk</span>
                  <span className="text-zinc-300">Mon–Sun 9:00 AM – 11:00 PM BST</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Emergency Auction Escrow</span>
                  <span className="text-zinc-300">24/7 Automated On-Call</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. FREQUENTLY ASKED QUESTIONS */}
      {/* ========================================================================= */}
      <section aria-labelledby="contact-faqs-heading" className="py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Quick Answers
            </span>
            <h2 id="contact-faqs-heading" className="mt-2 text-2xl sm:text-3xl font-bold text-white">
              Frequently Asked Questions
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400">
              Find immediate answers to common questions about auctions, bids, and seller policies.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            {FAQS.map((faq, idx) => {
              const isExpanded = expandedFaq === idx;
              return (
                <div
                  key={faq.q}
                  className="rounded-2xl border border-zinc-800 bg-[#0B0F1A] transition-all overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedFaq(isExpanded ? null : idx)}
                    className="w-full flex items-center justify-between p-4 sm:p-5 text-left text-sm font-bold text-white hover:text-amber-400 transition"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-amber-400' : ''
                      }`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-5 sm:px-5 text-xs text-zinc-300 leading-relaxed border-t border-zinc-850 pt-3 animate-fade-in">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
