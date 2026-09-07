/** Authoritative marketplace roles from Django identity responses. */
export type UserRole = 'BUYER' | 'SELLER' | 'ADMIN';

/** Roles allowed on public registration (ADMIN is never selectable). */
export type PublicRegistrationRole = 'BUYER' | 'SELLER';

/** Authenticated user shape from /users/me/, login, and register. */
export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_staff: boolean;
};

/** Staff Admin user directory row from GET /admin/users/. */
export type AdminUser = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
};

/** DRF page payload for Admin Users list (page size 20). */
export type PaginatedAdminUsers = {
  count: number;
  next: string | null;
  previous: string | null;
  results: AdminUser[];
};

export type AuctionImage = {
  id: number;
  image: string;
  uploaded_at?: string;
};

/** Catalog ProductImage from GET /products/ and image upload endpoints. */
export type ProductImage = {
  id: number;
  image: string;
  uploaded_at: string;
};

export type AuctionProduct = {
  id?: number;
  title: string;
  description?: string;
  condition?: string;
  category?: number | null;
  /** Product seller user id — used for UX ownership checks only. */
  seller?: number | string | null;
};

/** Catalog product from GET /products/ and GET /products/my-listings/. */
export type Product = {
  id: number;
  title: string;
  description?: string;
  condition?: string;
  category?: number | null;
  seller?: number | string | null;
  /** Nested Product images ordered by uploaded_at, id (first = display default). */
  images?: ProductImage[];
  created_at?: string;
  updated_at?: string;
};

/** Public Category catalog row from GET /categories/. */
export type Category = {
  id: number;
  name: string;
  slug: string;
};

export type Auction = {
  id: number;
  /**
   * Nested product on list/detail serializers, or product PK on some
   * active-list payloads (AuctionDetailSerializer).
   */
  product?: AuctionProduct | number | null;
  /** Present on active-list payloads that omit nested product.title. */
  product_title?: string;
  starting_bid?: string | number;
  current_highest_bid: string | number;
  min_increment?: string | number;
  end_time?: string;
  start_time?: string;
  /**
   * Authoritative backend clock at response generation (RT-B03).
   * Present on AuctionSerializer responses (detail/list); may be absent on
   * some alternate payloads (e.g. active-list detail serializer).
   */
  server_time?: string;
  status?: string;
  is_paid?: boolean;
  is_featured?: boolean;
  is_active?: boolean;
  winning_bidder?: number | null;
  winning_bidder_username?: string | null;
  images?: AuctionImage[];
  /** Optional recent bids (active list); used for honest starting vs current labels. */
  recent_bids?: UserBid[];
};

export type UserBid = {
  id: number;
  auction: number | Auction;
  bidder_username?: string;
  amount: string | number;
  timestamp?: string;
};

export type PaymentSummary = {
  id: number;
  auction: number;
  user: number;
  amount: string | number;
  status: string;
  transaction_id: string;
  created_at?: string;
};
