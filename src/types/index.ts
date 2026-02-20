// User Types
export interface User {
  wallet_address: string;
  username: string;
  gender?: 'male' | 'female';
  photo?: string;
  instagram?: string;
  xHandle?: string;
  verified?: boolean;
  tokens: Token[];
  nft_count: number;
  total_value: number;
  hearts_sent: number;
  hearts_received: number;
  isOnline?: boolean;
  bio?: string;
  age?: number;
  distance?: string;
}

export interface Token {
  symbol: string;
  name?: string;
  mint?: string;
  amount: number;
  usdValue: number;
}

export interface Portfolio {
  balance: number;
  tokens: Token[];
  total_value: number;
  nfts: string[];
}

// Post Types
export interface Post {
  id: number;
  author: string;
  wallet_address: string;
  content: string;
  tokens: string[];
  type?: string;
  vouch_count: number;
  vent_count: number;
  comments: Comment[];
  timestamp: number;
  userVouched?: boolean;
  userVented?: boolean;
  userVote?: 'vouch' | 'vent' | null;
}

export interface Comment {
  id?: string;
  author: string;
  text: string;
  holdings?: string[];
  votes: number;
  userVoted?: boolean;
}

// Match Types
export interface Match {
  userA: string;
  userB: string;
  overlap_tokens: string[];
  match_percent: number;
  sharedNfts?: string[];
  diamondHands?: boolean;
}

export interface MatchCandidate extends User {
  match: {
    score: number;
    sharedTokens: string[];
    sharedNfts: string[];
    diamondHands: boolean;
  };
  portfolio: Portfolio;
  image: string;
}

// Session Types
export interface Session {
  address: string;
  message: string;
  signature: number[];
  issuedAt: number;
}

// App State
export interface AppState {
  view: 'feed' | 'messages' | 'profile' | 'kol' | 'notifications';
  feedTab: 'vouch' | 'hot' | 'new' | 'top' | 'liked';
  anonymous: boolean;
  posts: Post[];
  session: Session | null;
  profile: User | null;
  portfolio: Portfolio | null;
  scanPortfolio: Portfolio | null;
  matches: MatchCandidate[];
  matchIndex: number;
  hearts: {
    sent: Record<string, number>;
    received: Record<string, number>;
    total: number;
  };
  trends: Record<string, number>;
  messages: Message[];
  notifications: Notification[];
}

export interface Message {
  id: string;
  sender: string;
  receiver: string;
  content: string;
  image?: string;
  timestamp: number;
  read: boolean;
}

export interface Notification {
  id: string;
  type: 'vote' | 'comment' | 'match' | 'message';
  actor: string;
  wallet_address?: string;
  recipient?: string;
  postId?: number;
  content: string;
  timestamp: number;
  read: boolean;
}

// Wallet Types
export type WalletType = 'phantom' | 'solflare';

export const PRICE_MAP: Record<string, number> = {
  ETH: 3200,
  AAVE: 110,
  BTC: 64000,
  SOL: 150,
  JUP: 1.2,
  BONK: 0.00002,
  PYTH: 0.5,
  WIF: 2.3,
  USDC: 1,
  JTO: 2.5,
  MATIC: 0.9,
  ARB: 1.1,
  PEPE: 0.00001,
  SHIB: 0.00001,
};

export const TOKEN_MINTS: Record<string, string> = {
  So11111111111111111111111111111111111111112: 'SOL',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 'JUP',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  '4k3Dyjzvzp8eS9rqq4t7WZrPAVnXpt2nSEb2ACk1ZQMR': 'RAY',
  Es9vMFrzaCER3a9nXbh7LQ98x7kP3n8t9Yx1vucnK7R9: 'USDT',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
};

export const STORAGE_KEYS = {
  session: 'sugar-session',
  profile: 'sugar-profiles',
  posts: 'sugar-posts',
  hearts: 'sugar-hearts',
  trends: 'sugar-trends',
  messages: 'sugar-messages',
  notifications: 'sugar-notifications',
};
