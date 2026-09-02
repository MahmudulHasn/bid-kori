export type AuctionImage = {
  id: number;
  image: string;
  uploaded_at?: string;
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

export type Auction = {
  id: number;
  product: AuctionProduct;
  starting_bid: string | number;
  current_highest_bid: string | number;
  min_increment?: string | number;
  end_time?: string;
  start_time?: string;
  status?: string;
  is_paid?: boolean;
  winning_bidder?: number | null;
  images?: AuctionImage[];
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
