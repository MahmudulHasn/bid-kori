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
  images?: AuctionImage[];
};
