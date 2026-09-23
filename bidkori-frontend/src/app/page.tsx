'use client';


import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Camera,
  Clock,
  CreditCard,
  Gamepad2,
  Gavel,
  Gem,
  Headphones,
  Home,
  Laptop,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Shirt,
  Smartphone,
  Sparkles,
  Tag,
  Trophy,
  UserPlus,
  Watch,
  Zap,
} from 'lucide-react';
import useSWR from 'swr';

import AuctionGrid from '@/components/marketplace/AuctionGrid';
import {
  AuctionGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceErrorState,
} from '@/components/marketplace/MarketplaceStates';
import { useAuth } from '@/context/AuthContext';
import { auctionListFetcher, marketplaceStatsFetcher } from '@/lib/auctionsApi';
import { CATEGORIES_API_PATH, categoriesFetcher } from '@/lib/categoriesApi';
import {
  ACTIVE_AUCTIONS_API_PATH,
  MARKETPLACE_ROUTES,
  MARKETPLACE_STATS_API_PATH,
  type MarketplaceStats,
  buildSearchPageHref,
  formatStatNumber,
  formatTradedAmount,
  sortAuctionsEndingSoon,
} from '@/lib/marketplace';
import type { Category } from '@/lib/types';

const PREVIEW_LIMIT = 4;

const POPULAR_SEARCH_TERMS = [
  'Smartphones',
  'Laptops',
  'Watches',
  'Gaming',
  'Cameras',
] as const;

// Professional Lucide icon & style mapping for dynamic backend categories
function getCategoryVisual(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('smart') || lower.includes('phone')) {
    return { icon: Smartphone, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
  }
  if (lower.includes('laptop') || lower.includes('computer') || lower.includes('pc')) {
    return { icon: Laptop, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' };
  }
  if (lower.includes('camera')) {
    return { icon: Camera, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  }
  if (lower.includes('game') || lower.includes('gaming')) {
    return { icon: Gamepad2, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' };
  }
  if (lower.includes('watch')) {
    return { icon: Watch, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
  }
  if (lower.includes('fashion') || lower.includes('sneaker') || lower.includes('clothing')) {
    return { icon: Shirt, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
  }
  if (lower.includes('home') || lower.includes('living')) {
    return { icon: Home, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' };
  }
  if (lower.includes('book') || lower.includes('media')) {
    return { icon: BookOpen, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
  }
  if (lower.includes('collect') || lower.includes('art')) {
    return { icon: Gem, color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' };
  }
  if (lower.includes('sport')) {
    return { icon: Activity, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
  }
  return { icon: Zap, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
}

// 4 concise value propositions for "Why Choose BidKori?"
const WHY_CHOOSE_ITEMS = [
  {
    icon: ShieldCheck,
    title: 'Secure & Verified',
    description: 'Trusted sellers and verified buyer profiles for a safer experience.',
  },
  {
    icon: Zap,
    title: 'Real-Time Bidding',
    description: 'Sub-second updates with WebSocket sync for instant live results.',
  },
  {
    icon: CreditCard,
    title: 'Flexible Payments',
    description: 'Multiple verified payment options with transparent accounting.',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
    description: 'Dedicated team available around the clock to assist you.',
  },
];

// 4 connected steps for "How BidKori Works"
const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    icon: UserPlus,
    title: 'Create Account',
    description: 'Sign up and complete your profile in seconds.',
  },
  {
    step: '02',
    icon: Search,
    title: 'Explore Auctions',
    description: 'Find verified products and inspect condition details.',
  },
  {
    step: '03',
    icon: Gavel,
    title: 'Place Your Bid',
    description: 'Enter your bid and compete with live countdowns.',
  },
  {
    step: '04',
    icon: Trophy,
    title: 'Win & Complete',
    description: 'Pay securely and receive your winning item.',
  },
];

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const [query, setQuery] = useState('');

  const {
    data: auctionsData,
    error: auctionsError,
    isLoading: auctionsLoading,
    mutate: mutateAuctions,
  } = useSWR(ACTIVE_AUCTIONS_API_PATH, auctionListFetcher);

  const {
    data: categoriesData,
  } = useSWR<Category[]>(CATEGORIES_API_PATH, categoriesFetcher);

  const {
    data: statsData,
  } = useSWR<MarketplaceStats>(MARKETPLACE_STATS_API_PATH, marketplaceStatsFetcher, {
    refreshInterval: 15000,
  });

  const auctions = useMemo(() => auctionsData ?? [], [auctionsData]);
  const categories = useMemo(() => categoriesData ?? [], [categoriesData]);
  const activePreview = useMemo(() => auctions.slice(0, PREVIEW_LIMIT), [auctions]);
  const endingSoon = useMemo(() => sortAuctionsEndingSoon(auctions).slice(0, PREVIEW_LIMIT), [auctions]);

  // Derived real-time stats for hero floating chips with graceful fallbacks
  const activeBidsDisplay = useMemo(() => {
    if (!statsData) return '1,200+';
    const count = statsData.active_bids > 0 ? statsData.active_bids : (statsData.total_bids ?? 0);
    return formatStatNumber(count, '1,200+');
  }, [statsData]);

  const verifiedSellersDisplay = useMemo(() => {
    return formatStatNumber(statsData?.verified_sellers, '500+');
  }, [statsData]);

  const itemsTradedDisplay = useMemo(() => {
    return formatTradedAmount(statsData?.total_traded, '৳50L+');
  }, [statsData]);

  // Display top 9 categories for the grid
  const displayCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories.slice(0, 9);
    }
    // Graceful fallback while categories are loading
    return [
      { id: 1, name: 'Smartphones', slug: 'smartphones' },
      { id: 2, name: 'Laptops', slug: 'laptops' },
      { id: 3, name: 'Cameras', slug: 'cameras' },
      { id: 4, name: 'Gaming Consoles', slug: 'gaming-consoles' },
      { id: 5, name: 'Electronics', slug: 'electronics' },
      { id: 6, name: 'Fashion', slug: 'fashion' },
      { id: 7, name: 'Home & Living', slug: 'home-living' },
      { id: 8, name: 'Books & Media', slug: 'books-media' },
      { id: 9, name: 'Collectibles', slug: 'collectibles' },
    ];
  }, [categories]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(buildSearchPageHref(query));
  };

  const handleQuickSearch = (term: string) => {
    setQuery(term);
    router.push(buildSearchPageHref(term));
  };

  const sellerDestination = isAuthenticated ? (user?.role === 'SELLER' ? '/seller' : '/seller') : '/auth/register';

  return (
    <main className="min-h-screen bg-[#06080D] text-white">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden pt-8 pb-14 sm:pt-12 sm:pb-20 border-b border-zinc-800/80">
        {/* Ambient radial amber glow in background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/4 right-1/4 -z-10 h-96 w-96 rounded-full bg-amber-500/15 blur-[130px]"
        />

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Left Column: Heading, Subtitle, Search & CTAs */}
          <div className="max-w-xl">
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-400">
              <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden />
              <span>Real-Time Online Auctions</span>
            </div>

            {/* Main Headline */}
            <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.08]">
              Bid on what <br />
              <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">
                matters.
              </span>
            </h1>

            {/* Subheading */}
            <p className="mt-4 text-sm sm:text-base text-zinc-400 leading-relaxed max-w-lg">
              Discover verified marketplace listings, place competitive bids in real time, and win items transparently.
            </p>

            {/* Integrated Search Bar */}
            <form
              onSubmit={handleSearch}
              role="search"
              className="mt-6 flex items-center rounded-2xl border border-zinc-800 bg-[#0B0F1A] p-1.5 pl-4 shadow-xl shadow-black/40 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 transition"
            >
              <Search className="h-4 w-4 text-zinc-400 shrink-0" aria-hidden />
              <input
                id="hero-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for products, laptops, phones, furniture..."
                className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-sm font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-400 hover:to-amber-500 active:scale-98"
              >
                Search
              </button>
            </form>

            {/* Popular Searches */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-500">Popular:</span>
              {POPULAR_SEARCH_TERMS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => handleQuickSearch(term)}
                  className="rounded-lg border border-zinc-800 bg-[#0B0F1A] px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:border-amber-500/40 hover:text-white"
                >
                  {term}
                </button>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3.5">
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-amber-500 active:scale-98"
              >
                <Gavel className="h-4 w-4 text-zinc-950" aria-hidden />
                <span>Browse Auctions</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={sellerDestination}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-2.5 text-sm font-semibold text-white shadow-2xs transition-all hover:border-zinc-500 hover:bg-zinc-850 active:scale-98"
              >
                <Tag className="h-4 w-4 text-zinc-400" aria-hidden />
                <span>Sell on BidKori</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Cinematic Video Showcase */}
          <div className="relative flex items-center justify-center lg:justify-end">
            {/* Ambient Glow Orbs - layered behind video for depth */}
            <div className="animate-orb-pulse pointer-events-none absolute -top-10 -right-10 h-72 w-72 rounded-full bg-amber-500/20 blur-[100px]" />
            <div className="animate-orb-pulse-slow pointer-events-none absolute -bottom-8 -left-6 h-56 w-56 rounded-full bg-amber-600/15 blur-[80px]" />
            <div className="animate-orb-pulse pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full bg-orange-500/10 blur-[60px]" />

            {/* Main Video Container */}
            <div className="relative">
              {/* Floating Stat Chip — Top Left */}
              <div className="animate-float-chip absolute -top-5 -left-4 z-10 hidden sm:flex items-center gap-2 rounded-xl border border-amber-500/20 bg-zinc-900/80 backdrop-blur-md px-3 py-2 shadow-lg shadow-black/40">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">
                  <Activity className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-zinc-400">Active Bids</p>
                  <p className="text-xs font-bold text-white transition-colors duration-300">{activeBidsDisplay}</p>
                </div>
              </div>

              {/* Floating Stat Chip — Top Right */}
              <div className="animate-float-chip-alt absolute -top-3 -right-4 z-10 hidden sm:flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-zinc-900/80 backdrop-blur-md px-3 py-2 shadow-lg shadow-black/40" style={{ animationDelay: '0.8s' }}>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-zinc-400">Verified Sellers</p>
                  <p className="text-xs font-bold text-white transition-colors duration-300">{verifiedSellersDisplay}</p>
                </div>
              </div>

              {/* Floating Stat Chip — Bottom Right */}
              <div className="animate-float-chip absolute -bottom-4 -right-2 z-10 hidden sm:flex items-center gap-2 rounded-xl border border-violet-500/20 bg-zinc-900/80 backdrop-blur-md px-3 py-2 shadow-lg shadow-black/40" style={{ animationDelay: '1.5s' }}>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
                  <Trophy className="h-3.5 w-3.5 text-violet-400" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-zinc-400">Items Traded</p>
                  <p className="text-xs font-bold text-white transition-colors duration-300">{itemsTradedDisplay}</p>
                </div>
              </div>

              {/* Video Frame with Rotating Gradient Border */}
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="hero-video-frame hero-video-shine group relative block overflow-hidden rounded-2xl transition-transform duration-500 hover:scale-[1.02]"
                aria-label="Explore featured live auctions"
              >
                {/* LIVE Badge */}
                <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur-sm px-2.5 py-1">
                  <span className="animate-live-pulse h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white">Live</span>
                </div>

                {/* Video Element */}
                <video
                  src="/hero-showcase.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full max-w-[520px] h-auto rounded-2xl object-contain"
                />

                {/* Hover Overlay — "Watch Now" CTA */}
                <div className="absolute inset-0 z-[3] flex items-end justify-center rounded-2xl bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pb-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-bold text-zinc-950 shadow-lg backdrop-blur-sm">
                    <Gavel className="h-3.5 w-3.5" />
                    Explore Auctions
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. BROWSE BY CATEGORY */}
      {/* ========================================================================= */}
      <section aria-labelledby="categories-heading" className="py-12 border-b border-zinc-800/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between pb-6">
            <div>
              <h2 id="categories-heading" className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Browse by Category
              </h2>
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                Explore auctions across popular verified categories.
              </p>
            </div>
            <Link
              href={MARKETPLACE_ROUTES.auctions}
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition group"
            >
              <span>View All Categories</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Dynamic 9-card category row/grid */}
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3">
            {displayCategories.map((cat) => {
              const visual = getCategoryVisual(cat.name);
              const Icon = visual.icon;
              return (
                <Link
                  key={cat.id}
                  href={`${MARKETPLACE_ROUTES.auctions}?category=${encodeURIComponent(cat.slug || cat.name)}`}
                  className="group flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-[#0B0F1A] p-3 text-center transition-all duration-300 hover:border-amber-500/50 hover:bg-[#0F1424] hover:shadow-lg hover:shadow-amber-500/5"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border ${visual.color} transition-transform duration-200 group-hover:scale-110`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="mt-2.5 text-[11px] font-semibold text-zinc-300 group-hover:text-white transition line-clamp-1">
                    {cat.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. LIVE AUCTIONS SECTION */}
      {/* ========================================================================= */}
      <section aria-labelledby="live-auctions-heading" className="py-14 border-b border-zinc-800/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                </span>
                <h2 id="live-auctions-heading" className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Live Auctions
                </h2>
              </div>
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                Real-time auctions currently accepting competitive bids.
              </p>
            </div>
            <Link
              href={MARKETPLACE_ROUTES.auctions}
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition group"
            >
              <span>View All ({auctions.length})</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Dynamic Auction Grid with Skeletons / Error / Empty States */}
          {auctionsLoading ? <AuctionGridSkeleton count={4} /> : null}
          {auctionsError ? <MarketplaceErrorState onRetry={() => mutateAuctions()} /> : null}
          {!auctionsLoading && !auctionsError && activePreview.length === 0 ? (
            <MarketplaceEmptyState message="No live auctions available right now. Check back soon or list an item!" />
          ) : null}
          {!auctionsLoading && !auctionsError && activePreview.length > 0 ? (
            <AuctionGrid auctions={activePreview} />
          ) : null}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. ENDING SOON SECTION (Shown if ending soon items exist) */}
      {/* ========================================================================= */}
      {!auctionsLoading && !auctionsError && endingSoon.length > 0 && (
        <section aria-labelledby="ending-soon-heading" className="py-14 border-b border-zinc-800/80">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-rose-400" aria-hidden />
                  <h2
                    id="ending-soon-heading"
                    className="text-xl font-bold tracking-tight text-white sm:text-2xl"
                  >
                    Ending Soon
                  </h2>
                </div>
                <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                  Last chance countdowns ordered by soonest closing time.
                </p>
              </div>
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition group"
              >
                <span>Browse all</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <AuctionGrid auctions={endingSoon} />
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. WHY CHOOSE BIDKORI? SECTION */}
      {/* ========================================================================= */}
      <section aria-labelledby="why-choose-heading" className="py-14 border-b border-zinc-800/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-3xl border border-zinc-800 bg-[#0B0F1A]/90 p-8 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-md">
            {/* Ambient subtle glow */}
            <div className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left headline */}
              <div className="lg:col-span-4">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  Why Choose BidKori?
                </span>
                <h2
                  id="why-choose-heading"
                  className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight"
                >
                  A modern marketplace built for real people.
                </h2>
                <p className="mt-3 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  BidKori makes buying and selling simple, secure, and exciting. Join thousands of users who trust BidKori for the best deals.
                </p>
              </div>

              {/* Right 4 feature cards */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {WHY_CHOOSE_ITEMS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="relative rounded-2xl border border-zinc-800/90 bg-[#07090E] p-4 flex flex-col transition hover:border-zinc-700"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-3.5 text-xs font-bold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                        {item.description}
                      </p>
                      {/* Desktop connector arrow */}
                      {idx < WHY_CHOOSE_ITEMS.length - 1 && (
                        <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600 z-10" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. HOW BIDKORI WORKS SECTION */}
      {/* ========================================================================= */}
      <section aria-labelledby="how-it-works-heading" className="py-14 border-b border-zinc-800/80">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-3xl border border-zinc-800 bg-[#0B0F1A]/90 p-8 sm:p-10 shadow-2xl relative overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left headline */}
              <div className="lg:col-span-4">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  Easy Process
                </span>
                <h2
                  id="how-it-works-heading"
                  className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight"
                >
                  How BidKori Works
                </h2>
                <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Start bidding or listing in four simple, transparent steps.
                </p>
              </div>

              {/* Right 4 steps with timeline stepper */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {HOW_IT_WORKS_STEPS.map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.title}
                      className="relative rounded-2xl border border-zinc-800/90 bg-[#07090E] p-4 flex flex-col transition hover:border-zinc-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-zinc-950 shadow-md shadow-amber-500/30">
                          {s.step}
                        </span>
                        <Icon className="h-4 w-4 text-amber-400" />
                      </div>
                      <h3 className="mt-3 text-xs font-bold text-white">
                        {s.title}
                      </h3>
                      <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                        {s.description}
                      </p>
                      {/* Desktop connector arrow */}
                      {idx < HOW_IT_WORKS_STEPS.length - 1 && (
                        <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600 z-10" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. SELLER CTA SECTION */}
      {/* ========================================================================= */}
      <section aria-labelledby="seller-cta-heading" className="py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-[#0B0F1A] to-amber-500/10 p-8 sm:p-12 shadow-2xl relative overflow-hidden text-center lg:text-left flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Seller Opportunity
              </span>
              <h2
                id="seller-cta-heading"
                className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white"
              >
                Have something worth bidding on?
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-xl">
                Turn your products into competitive auctions with BidKori. Reach thousands of active bidders with transparent commissions and guaranteed payouts.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <Link
                href={sellerDestination}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-amber-500 active:scale-98"
              >
                <span>Start Selling</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={MARKETPLACE_ROUTES.auctions}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-5 py-3 text-sm font-semibold text-white shadow-2xs transition-all hover:border-zinc-500 hover:bg-zinc-850 active:scale-98"
              >
                <span>Explore Live Market</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
