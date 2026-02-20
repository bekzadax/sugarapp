import { useState, useEffect } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import type { Session, Portfolio, Token, WalletType } from '@/types';
import { STORAGE_KEYS, TOKEN_MINTS, PRICE_MAP } from '@/types';

const RPC_URL =
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
  'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

interface PhantomProvider {
  publicKey: PublicKey | null;
  isConnected: boolean;
  connect: () => Promise<{ publicKey?: PublicKey }>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<{ signature?: Uint8Array } | Uint8Array>;
  on?: (event: string, callback: (args: any) => void) => void;
  isPhantom?: boolean;
  isSolflare?: boolean;
}

interface SolflareProvider {
  publicKey: PublicKey | null;
  isConnected: boolean;
  connect: (opts?: any) => Promise<{ publicKey?: PublicKey } | void>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<{ signature?: Uint8Array } | Uint8Array>;
  isSolflare?: boolean;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solflare?: SolflareProvider;
    solana?: PhantomProvider;
  }
}

export function useWallet() {
  const [session, setSession] = useState<Session | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeAdapter, setActiveAdapter] = useState<WalletType | null>(null);

  // Load session on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.session);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSession(parsed);
        // Fetch portfolio for saved session
        fetchPortfolio(parsed.address).then(setPortfolio).catch((error) => {
          console.warn('Failed to fetch portfolio', error);
        });
      } catch (e) {
        console.error('Failed to load session', e);
      }
    }
  }, []);

  const normalizeProvider = (provider: any) => provider?.solana || provider;

  const getProvider = (type: WalletType): PhantomProvider | SolflareProvider | null => {
    if (type === 'phantom') {
      const phantom = window.phantom?.solana;
      const fallback = window.solana?.isPhantom ? window.solana : null;
      return normalizeProvider(phantom || fallback);
    }
    if (type === 'solflare') {
      const solflare = window.solflare;
      const fallback = window.solana?.isSolflare ? window.solana : null;
      return normalizeProvider(solflare || fallback);
    }
    return null;
  };

  const fetchPortfolio = async (address: string): Promise<Portfolio> => {
    try {
      const publicKey = new PublicKey(address);
      const balanceLamports = await connection.getBalance(publicKey);
      const balance = balanceLamports / LAMPORTS_PER_SOL;

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokens: Token[] = [];
      const nfts: string[] = [];

      tokenAccounts.value.forEach(({ account }) => {
        const info = account.data.parsed.info;
        const amount = info.tokenAmount.uiAmount || 0;
        if (!amount || amount <= 0) return;

        const mint = info.mint;
        const decimals = info.tokenAmount.decimals;
        const symbol = TOKEN_MINTS[mint] || mint.slice(0, 4).toUpperCase();
        const price = PRICE_MAP[symbol] || 0;

        if (decimals === 0 && amount === 1) {
          nfts.push(mint);
        } else {
          tokens.push({
            symbol,
            mint,
            amount,
            usdValue: amount * price,
          });
        }
      });

      // Normalize and sort tokens
      const normalized = normalizeTokens(tokens);
      const totalValue =
        normalized.reduce((sum, token) => sum + (token.usdValue || 0), 0) +
        balance * (PRICE_MAP.SOL || 150);

      return {
        balance,
        tokens: sortTokens(normalized, balance),
        total_value: totalValue,
        nfts,
      };
    } catch (error) {
      console.warn('RPC fetch failed', error);
      throw error;
    }
  };

  const normalizeTokens = (tokens: Token[]): Token[] => {
    const map = new Map<string, Token>();
    tokens.forEach((token) => {
      const key = token.symbol;
      if (!map.has(key)) {
        map.set(key, { ...token });
      } else {
        const existing = map.get(key)!;
        existing.amount += token.amount;
        existing.usdValue = (existing.usdValue ?? 0) + (token.usdValue ?? 0);
      }
    });
    return Array.from(map.values()).filter((token) => token.amount > 0);
  };

  const sortTokens = (tokens: Token[], balance: number): Token[] => {
    const list = [...tokens];
    if (balance > 0 && !list.find((token) => token.symbol === 'SOL')) {
      list.unshift({
        symbol: 'SOL',
        amount: balance,
        usdValue: balance * (PRICE_MAP.SOL || 150),
      });
    }
    return list.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));
  };

  const toUint8Array = (value: any): Uint8Array | null => {
    if (!value) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value)) return new Uint8Array(value);
    if (value.buffer) return new Uint8Array(value.buffer);
    return null;
  };

  const signInWithWallet = async (
    provider: PhantomProvider | SolflareProvider,
    address: string
  ): Promise<Session> => {
    const message = `SUGAR wants you to sign in with your Solana wallet.\nWallet: ${address}\nNonce: ${crypto.randomUUID()}\nIssued At: ${new Date().toISOString()}`;
    const payload = new TextEncoder().encode(message);
    let signature: Uint8Array | null = null;
    let verified = false;
    if (typeof provider.signMessage === 'function') {
      try {
        const signed = await provider.signMessage(payload);
        const signatureRaw = signed instanceof Uint8Array ? signed : signed.signature;
        signature = toUint8Array(signatureRaw);
      } catch (error) {
        try {
          const signed = await provider.signMessage(payload);
          const signatureRaw = signed instanceof Uint8Array ? signed : signed.signature;
          signature = toUint8Array(signatureRaw);
        } catch (innerError) {
          console.warn('signMessage failed, continuing without signature', innerError);
        }
      }
    }

    if (signature && signature.length) {
      verified = nacl.sign.detached.verify(
        payload,
        signature,
        new PublicKey(address).toBytes()
      );
      if (!verified) {
        console.warn('Signature verification failed, continuing without verification.');
      }
    }

    const session: Session = {
      address,
      message,
      signature: signature ? Array.from(signature) : [],
      issuedAt: Date.now(),
    };

    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
    setSession(session);
    return session;
  };

  const connect = async (type: WalletType) => {
    setIsConnecting(true);
    try {
      const provider = getProvider(type);
      if (!provider) {
        throw new Error(`${type} wallet not found. Please install the extension.`);
      }

      // Connect
      let connectResult: any;
      try {
        connectResult = await provider.connect({ onlyIfTrusted: false });
      } catch (error) {
        connectResult = await provider.connect();
      }
      const publicKey = provider.publicKey || (connectResult as any)?.publicKey;
      const address =
        (typeof publicKey === 'string' && publicKey) ||
        publicKey?.toBase58?.() ||
        publicKey?.toString?.();
      if (!address) {
        throw new Error('Failed to get wallet address');
      }

      // Sign in
      await signInWithWallet(provider, address);

      // Fetch portfolio
      let portfolio: Portfolio | null = null;
      try {
        portfolio = await fetchPortfolio(address);
        setPortfolio(portfolio);
      } catch (error) {
        console.warn('Failed to fetch portfolio', error);
      }
      setActiveAdapter(type);

      return { address, portfolio };
    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      const provider = activeAdapter ? getProvider(activeAdapter) : null;
      if (provider && 'disconnect' in provider) {
        await provider.disconnect();
      }
    } catch (error) {
      console.warn('Disconnect error', error);
    }

    localStorage.removeItem(STORAGE_KEYS.session);
    setSession(null);
    setPortfolio(null);
    setActiveAdapter(null);
  };

  const refreshPortfolio = async () => {
    if (session?.address) {
      const newPortfolio = await fetchPortfolio(session.address);
      setPortfolio(newPortfolio);
      return newPortfolio;
    }
    return null;
  };

  return {
    session,
    portfolio,
    isConnecting,
    activeAdapter,
    connect,
    disconnect,
    refreshPortfolio,
    fetchPortfolio,
  };
}
