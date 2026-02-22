import { useState, useEffect, useRef } from 'react';
import type { Connection } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletNotReadyError, type WalletName } from '@solana/wallet-adapter-base';
import type { Session, Portfolio, Token, WalletType } from '@/types';
import { STORAGE_KEYS, TOKEN_MINTS, PRICE_MAP } from '@/types';

const RPC_URL =
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
  'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
let web3Promise: Promise<typeof import('@solana/web3.js')> | null = null;
let cachedConnection: Connection | null = null;

const loadWeb3 = async () => {
  if (!web3Promise) {
    web3Promise = import('@solana/web3.js');
  }
  return web3Promise;
};

const getConnection = async () => {
  if (cachedConnection) return cachedConnection;
  const { Connection } = await loadWeb3();
  cachedConnection = new Connection(RPC_URL, 'confirmed');
  return cachedConnection;
};

export type WalletConnectResult = {
  address: string | null;
  portfolio: null;
  needsMobile?: boolean;
  walletType?: WalletType;
};

const WALLET_NAMES: Record<WalletType, string> = {
  phantom: 'Phantom',
  solflare: 'Solflare',
};

export function useWallet() {
  const {
    publicKey,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    connecting,
    wallet,
    select,
    signMessage,
  } = useSolanaWallet();
  const { setVisible } = useWalletModal();
  const [session, setSession] = useState<Session | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeAdapter, setActiveAdapter] = useState<WalletType | null>(null);
  const cachedSessionRef = useRef<Session | null>(null);
  const lastPortfolioFetchRef = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.session);
      if (raw) {
        const parsed = JSON.parse(raw) as Session;
        if (parsed?.address) {
          cachedSessionRef.current = parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to load stored session', error);
    }
  }, []);

  useEffect(() => {
    setIsConnecting(connecting);
  }, [connecting]);

  const schedulePortfolioFetch = (address: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastPortfolioFetchRef.current < 120000) {
      return;
    }
    lastPortfolioFetchRef.current = now;
    const run = () => {
      fetchPortfolio(address)
        .then((nextPortfolio) => {
          setPortfolio(nextPortfolio);
        })
        .catch((error) => {
          console.warn('Failed to fetch portfolio', error);
        });
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => run(), { timeout: 1200 });
      return;
    }
    if (typeof window === 'undefined') {
      run();
      return;
    }
    setTimeout(run, 200);
  };

  const fetchPortfolio = async (address: string): Promise<Portfolio> => {
    try {
      const { PublicKey, LAMPORTS_PER_SOL } = await loadWeb3();
      const connection = await getConnection();
      const publicKey = new PublicKey(address);
      const balanceLamports = await connection.getBalance(publicKey);
      const balance = balanceLamports / LAMPORTS_PER_SOL;

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey(TOKEN_PROGRAM_ID) }
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
    address: string,
    signMessageFn?: (message: Uint8Array) => Promise<Uint8Array>
  ): Promise<Session> => {
    const message = `SUGAR wants you to sign in with your Solana wallet.\nWallet: ${address}\nNonce: ${crypto.randomUUID()}\nIssued At: ${new Date().toISOString()}`;
    const payload = new TextEncoder().encode(message);
    let signature: Uint8Array | null = null;
    let verified = false;
    if (signMessageFn) {
      try {
        const signed = await signMessageFn(payload);
        signature = toUint8Array(signed);
      } catch (error) {
        console.warn('signMessage failed, continuing without signature', error);
      }
    }

    if (signature && signature.length) {
      const { PublicKey } = await loadWeb3();
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
    cachedSessionRef.current = session;
    return session;
  };

  useEffect(() => {
    if (!publicKey) {
      const cachedSession = cachedSessionRef.current;
      if (cachedSession?.address) {
        setSession(cachedSession);
        if (!portfolio) {
          schedulePortfolioFetch(cachedSession.address);
        }
      } else {
        setSession(null);
        setPortfolio(null);
        setActiveAdapter(null);
      }
      return;
    }
    const address = publicKey.toBase58();
    const adapterName = wallet?.adapter?.name;
    if (adapterName === 'Phantom') {
      setActiveAdapter('phantom');
    } else if (adapterName === 'Solflare') {
      setActiveAdapter('solflare');
    }
    const cachedSession = cachedSessionRef.current;
    if (cachedSession?.address === address) {
      setSession(cachedSession);
    } else if (session?.address !== address) {
      void signInWithWallet(address, signMessage);
    }
    schedulePortfolioFetch(address);
  }, [publicKey, wallet?.adapter?.name, signMessage, session?.address]);

  const connect = async (type: WalletType): Promise<WalletConnectResult> => {
    setIsConnecting(true);
    try {
      if (session?.address) {
        return { address: session.address, portfolio: null };
      }
      const walletName = WALLET_NAMES[type];
      if (!walletName) {
        throw new Error('Unsupported wallet type');
      }
      if (wallet?.adapter?.connected) {
        const address =
          publicKey?.toBase58?.() ||
          wallet?.adapter?.publicKey?.toBase58?.() ||
          wallet?.adapter?.publicKey?.toString?.() ||
          null;
        if (address) {
          return { address, portfolio: null };
        }
      }
      if (!wallet || wallet.adapter?.name !== walletName) {
        select(walletName as WalletName);
      }
      await adapterConnect();
      const address =
        publicKey?.toBase58?.() ||
        wallet?.adapter?.publicKey?.toBase58?.() ||
        wallet?.adapter?.publicKey?.toString?.() ||
        null;
      if (!address) {
        throw new Error('Failed to get wallet address');
      }
      return { address, portfolio: null };
    } catch (error) {
      if (error instanceof WalletNotReadyError) {
        setVisible(true);
        return { address: null, portfolio: null, needsMobile: true, walletType: type };
      }
      console.error('Wallet connection failed:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await adapterDisconnect();
    } catch (error) {
      console.warn('Disconnect error', error);
    }

    localStorage.removeItem(STORAGE_KEYS.session);
    setSession(null);
    setPortfolio(null);
    setActiveAdapter(null);
    cachedSessionRef.current = null;
  };

  const refreshPortfolio = async (force = false) => {
    if (session?.address) {
      if (!force && Date.now() - lastPortfolioFetchRef.current < 60000) {
        return portfolio;
      }
      const newPortfolio = await fetchPortfolio(session.address);
      lastPortfolioFetchRef.current = Date.now();
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
