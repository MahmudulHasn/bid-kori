/**
 * Centralized Safe Route Registry for BidKori Assistant (CHAT-X01).
 *
 * Ensures all assistant navigation targets are validated internal routes.
 * Never allows arbitrary external or unsafe URLs (javascript:, data:, etc.).
 */

export type SafeRouteEntry = {
  href: string;
  title: string;
  description: string;
  roles: readonly ('ANONYMOUS' | 'BUYER' | 'SELLER' | 'ADMIN')[];
  keywords: readonly string[];
  defaultLabel: string;
};

export const SAFE_ROUTE_REGISTRY: readonly SafeRouteEntry[] = [
  // PUBLIC
  {
    href: '/',
    title: 'Home',
    description: 'BidKori marketplace homepage with live auctions and category shortcuts.',
    roles: ['ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'],
    keywords: ['home', 'homepage', 'main page', 'landing page', 'bidkori'],
    defaultLabel: 'Go to Home',
  },
  {
    href: '/auctions',
    title: 'Browse Auctions',
    description: 'Marketplace auctions directory showing all live and upcoming listings.',
    roles: ['ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'],
    keywords: ['auctions', 'browse auctions', 'all auctions', 'marketplace', 'view listings'],
    defaultLabel: 'Browse Auctions',
  },
  {
    href: '/search',
    title: 'Search',
    description: 'Search auctions and products by keyword, category, or status.',
    roles: ['ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'],
    keywords: ['search', 'search marketplace', 'find item', 'lookup'],
    defaultLabel: 'Search Marketplace',
  },
  {
    href: '/auth/login',
    title: 'Sign In',
    description: 'Sign in to your BidKori account to place bids or manage listings.',
    roles: ['ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'],
    keywords: ['login', 'sign in', 'log in', 'signin', 'authenticate'],
    defaultLabel: 'Sign In',
  },
  {
    href: '/auth/register',
    title: 'Register',
    description: 'Create a new Buyer or Seller account on BidKori.',
    roles: ['ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'],
    keywords: ['register', 'sign up', 'create account', 'join bidkori', 'become a seller'],
    defaultLabel: 'Create Account',
  },
  {
    href: '/contact',
    title: 'Contact Us',
    description: 'Contact BidKori 24/7 customer support, dispute resolution, and office desk.',
    roles: ['ANONYMOUS', 'BUYER', 'SELLER', 'ADMIN'],
    keywords: ['contact', 'contact us', 'support', 'help desk', 'customer support', 'email support', 'hotline'],
    defaultLabel: 'Contact Support',
  },

  // BUYER
  {
    href: '/buyer',
    title: 'Buyer Dashboard',
    description: 'Buyer account home with active bids, won auctions, and activity.',
    roles: ['BUYER'],
    keywords: ['buyer dashboard', 'buyer home', 'my account'],
    defaultLabel: 'Open Buyer Dashboard',
  },
  {
    href: '/buyer/my-bids',
    title: 'My Bids',
    description: 'Track all auctions you have bid on, your highest bids, and outbid status.',
    roles: ['BUYER'],
    keywords: ['my bids', 'bids', 'bid history', 'participated auctions', 'active bids', 'outbid items'],
    defaultLabel: 'Open My Bids',
  },
  {
    href: '/buyer/won',
    title: 'Won Auctions',
    description: 'View all auctions you have won, payment status, and checkout.',
    roles: ['BUYER'],
    keywords: ['won', 'won auctions', 'my wins', 'items won', 'auctions i won'],
    defaultLabel: 'View Won Auctions',
  },
  {
    href: '/buyer/notifications',
    title: 'Buyer Notifications',
    description: 'In-app notifications for outbid alerts, won auctions, and platform updates.',
    roles: ['BUYER'],
    keywords: ['buyer notifications', 'outbid notifications', 'my notifications'],
    defaultLabel: 'Open Notifications',
  },
  {
    href: '/buyer/profile',
    title: 'Buyer Profile',
    description: 'View and edit your buyer profile details.',
    roles: ['BUYER'],
    keywords: ['buyer profile', 'my profile', 'edit profile'],
    defaultLabel: 'View Profile',
  },
  {
    href: '/buyer/settings',
    title: 'Buyer Settings',
    description: 'Buyer account preferences and settings.',
    roles: ['BUYER'],
    keywords: ['buyer settings', 'account settings'],
    defaultLabel: 'Open Settings',
  },

  // SELLER
  {
    href: '/seller',
    title: 'Seller Dashboard',
    description: 'Seller command center with active listings, sales overview, and quick actions.',
    roles: ['SELLER'],
    keywords: ['seller dashboard', 'seller home', 'seller overview', 'seller workspace'],
    defaultLabel: 'Open Seller Dashboard',
  },
  {
    href: '/seller/products',
    title: 'Seller Products',
    description: 'Manage your product inventory, photos, and descriptions.',
    roles: ['SELLER'],
    keywords: ['seller products', 'my products', 'product list', 'inventory', 'manage products'],
    defaultLabel: 'Manage Products',
  },
  {
    href: '/seller/products/create',
    title: 'Create Product',
    description: 'Add a new product listing with AI description assistant and photos.',
    roles: ['SELLER'],
    keywords: ['create product', 'add product', 'new product', 'list product'],
    defaultLabel: 'Create Product',
  },
  {
    href: '/seller/auctions',
    title: 'Seller Auctions',
    description: 'Manage your auctions, countdown timers, starting prices, and reserves.',
    roles: ['SELLER'],
    keywords: ['seller auctions', 'my auctions', 'auction list', 'manage auctions'],
    defaultLabel: 'Manage Auctions',
  },
  {
    href: '/seller/auctions/create',
    title: 'Create Auction',
    description: 'Schedule and launch a new auction for an existing product.',
    roles: ['SELLER'],
    keywords: ['create auction', 'new auction', 'start auction', 'schedule auction'],
    defaultLabel: 'Create Auction',
  },
  {
    href: '/seller/sales',
    title: 'Seller Sales',
    description: 'Review sales history, gross revenue, platform fees, and net earnings.',
    roles: ['SELLER'],
    keywords: ['seller sales', 'sales', 'earnings', 'revenue', 'view sales', 'my sales'],
    defaultLabel: 'View Seller Sales',
  },
  {
    href: '/seller/notifications',
    title: 'Seller Notifications',
    description: 'Notifications for new bids received, auction endings, and sales.',
    roles: ['SELLER'],
    keywords: ['seller notifications', 'bid alerts'],
    defaultLabel: 'Open Notifications',
  },
  {
    href: '/seller/profile',
    title: 'Seller Profile',
    description: 'View and manage your seller business profile details.',
    roles: ['SELLER'],
    keywords: ['seller profile', 'store profile'],
    defaultLabel: 'View Profile',
  },
  {
    href: '/seller/settings',
    title: 'Seller Settings',
    description: 'Seller preferences and workspace configuration.',
    roles: ['SELLER'],
    keywords: ['seller settings'],
    defaultLabel: 'Open Settings',
  },

  // ADMIN
  {
    href: '/admin',
    title: 'Admin Command Center',
    description: 'Platform overview, key metrics, and administrative oversight.',
    roles: ['ADMIN'],
    keywords: ['admin', 'admin dashboard', 'command center', 'platform overview'],
    defaultLabel: 'Open Admin Command Center',
  },
  {
    href: '/admin/users',
    title: 'User Management',
    description: 'Oversee marketplace accounts, suspend/reactivate users, and inspect profiles.',
    roles: ['ADMIN'],
    keywords: ['admin users', 'manage users', 'user management', 'accounts'],
    defaultLabel: 'Manage Users',
  },
  {
    href: '/admin/products',
    title: 'Product Moderation',
    description: 'Inspect and moderate all products submitted across the platform.',
    roles: ['ADMIN'],
    keywords: ['admin products', 'moderate products', 'product moderation'],
    defaultLabel: 'Manage Products',
  },
  {
    href: '/admin/auctions',
    title: 'Auction Moderation',
    description: 'Monitor active, upcoming, closed, and cancelled auctions across all sellers.',
    roles: ['ADMIN'],
    keywords: ['admin auctions', 'moderate auctions', 'auction oversight'],
    defaultLabel: 'Moderate Auctions',
  },
  {
    href: '/admin/bids',
    title: 'Bid Oversight',
    description: 'Audit live and historic bids placed across the marketplace.',
    roles: ['ADMIN'],
    keywords: ['admin bids', 'bid oversight', 'audit bids'],
    defaultLabel: 'Review Bids',
  },
  {
    href: '/admin/analytics',
    title: 'Platform Analytics',
    description: 'Platform revenue, commission fees, active auctions, and volume analytics.',
    roles: ['ADMIN'],
    keywords: ['admin analytics', 'analytics', 'platform analytics', 'revenue stats'],
    defaultLabel: 'Open Analytics',
  },
  {
    href: '/admin/profile',
    title: 'Admin Profile',
    description: 'Staff profile settings and credentials.',
    roles: ['ADMIN'],
    keywords: ['admin profile'],
    defaultLabel: 'View Profile',
  },
  {
    href: '/admin/settings',
    title: 'Admin Settings',
    description: 'System configuration, platform commission rate, and operational thresholds.',
    roles: ['ADMIN'],
    keywords: ['admin settings', 'platform settings'],
    defaultLabel: 'Open Admin Settings',
  },
] as const;

export const APPROVED_ROUTES_SET = new Set(
  SAFE_ROUTE_REGISTRY.map((entry) => entry.href),
);

/**
 * Validates whether an href is an approved internal BidKori route.
 * Rejects javascript:, data:, external domains, and unauthorized routes.
 */
export function isApprovedInternalRoute(href: string): boolean {
  if (!href || typeof href !== 'string') return false;
  const trimmed = href.trim();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('//') ||
    trimmed.includes('://')
  ) {
    return false;
  }
  return APPROVED_ROUTES_SET.has(trimmed);
}
