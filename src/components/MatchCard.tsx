import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Heart, Instagram, BadgeCheck, User } from 'lucide-react';
import type { MatchCandidate } from '@/types';

interface MatchCardProps {
  match: MatchCandidate | null;
  onSkip?: () => void;
  onHeart?: () => void;
  showActions?: boolean;
  emptyState?: 'connect' | 'nomore';
  onConnect?: (type: 'phantom' | 'solflare') => void;
}

export function MatchCard({
  match,
  onSkip,
  onHeart,
  showActions = true,
  emptyState = 'nomore',
  onConnect,
}: MatchCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [match?.image]);

  if (!match) {
    const isConnect = emptyState === 'connect';
    return (
      <div className="relative w-full h-full bg-white rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <Heart className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="font-serif text-2xl text-slate-700 mb-2">
            {isConnect ? 'Connect Wallet' : 'No More Matches'}
          </h3>
          <p className="text-slate-500">
            {isConnect ? 'Connect your wallet to see matches.' : 'Check back later for new connections!'}
          </p>
          {isConnect && onConnect && (
            <div className="mt-6 flex flex-col gap-2 items-center">
              <button
                onClick={() => onConnect('phantom')}
                className="w-full max-w-[220px] px-4 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Connect Phantom
              </button>
              <button
                onClick={() => onConnect('solflare')}
                className="w-full max-w-[220px] px-4 py-2.5 rounded-full bg-white text-slate-700 text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Connect Solflare
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const shortAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatNumber = (num: number) => {
    if (num > 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num > 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const cleanHandle = (handle?: string, domain?: string) => {
    if (!handle) return '';
    let cleaned = handle.replace(/^@/, '').trim();
    if (domain) {
      cleaned = cleaned.replace(new RegExp(`^https?:\\/\\/(www\\.)?${domain}\\/`, 'i'), '');
    }
    return cleaned.replace(/\/$/, '');
  };

  const instagramHandle = cleanHandle(match.instagram, 'instagram.com');
  const xHandle = cleanHandle(match.xHandle, 'x.com');
  const initials = match.username ? match.username.replace('@', '').slice(0, 2).toUpperCase() : 'SG';

  return (
    <div className="relative w-full h-full bg-white rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 group">
      {/* Image Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <User className="w-10 h-10 text-white/70" />
            </div>
            <div className="text-white/80 text-2xl font-serif">{initials}</div>
          </div>
        </div>
        {match.image && (
          <img
            src={match.image}
            alt={match.username}
            loading="eager"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
      </div>

      {/* Online Status */}
      <div className="absolute top-6 left-6 flex flex-col gap-2">
        {match.verified && (
          <span className="bg-blue-500/25 backdrop-blur-md text-blue-100 border border-blue-400/40 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
            <BadgeCheck className="w-4 h-4" />
            Verified
          </span>
        )}
        <span className="bg-green-500/20 backdrop-blur-md text-green-100 border border-green-500/30 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Online
          {match.match.diamondHands && ' • Diamond Hands'}
        </span>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pt-24 pb-20 z-10">
        {/* Name & Age */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <h1 className="font-serif text-5xl mb-1 text-white flex items-center gap-3">
              <span>{match.username}</span>
              <span className="text-3xl font-sans font-light opacity-70">{match.age}</span>
            </h1>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-slate-400">
                {shortAddress(match.wallet_address)}
              </span>
            </div>
          </div>
        </div>

        {/* Bio */}
        <p className="text-slate-200 text-lg leading-relaxed mb-4 max-w-lg font-light">
          {match.bio}
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {match.gender === 'male' && (
            <div className="flex items-center gap-2 bg-slate-900/50 border border-white/10 rounded-full px-3 py-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                Net Worth
              </span>
              <span className="text-xs font-bold text-white">
                ${formatNumber(match.total_value || match.portfolio.total_value || 0)}
              </span>
            </div>
          )}
        </div>

        {match.match.sharedTokens.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">
              Shared Assets
            </span>
            {match.match.sharedTokens.slice(0, 4).map((token) => (
              <span
                key={token}
                className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[11px] font-semibold text-white"
              >
                {token}
              </span>
            ))}
          </div>
        )}

        {match.portfolio.tokens.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">
              Holdings
            </span>
            {match.portfolio.tokens.slice(0, 4).map((token) => (
              <span
                key={token.symbol}
                className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-[11px] font-semibold text-white"
              >
                {token.symbol} {formatNumber(token.amount)}
              </span>
            ))}
          </div>
        )}

        {/* Socials */}
        {(instagramHandle || xHandle) && (
          <div className="flex items-center gap-3">
            {instagramHandle && (
              <a
                href={`https://instagram.com/${instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold hover:bg-white/20 transition-colors"
              >
                <Instagram className="w-4 h-4" />
                {instagramHandle}
              </a>
            )}
            {xHandle && (
              <a
                href={`https://x.com/${xHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold hover:bg-white/20 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-white"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M18.244 2H21.86l-7.9 9.03L23.5 22h-7.2l-5.64-6.83L4.4 22H.78l8.45-9.66L0 2h7.33l5.1 6.18L18.244 2Zm-1.26 18h2.02L7.2 4H5.03l11.954 16Z"
                  />
                </svg>
                {xHandle}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 z-20">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={onSkip}
            className="w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors border border-slate-100"
          >
            <X className="w-7 h-7" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onHeart}
            className="w-20 h-20 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 shadow-lg shadow-pink-500/40 flex items-center justify-center text-white"
          >
            <Heart className="w-10 h-10 fill-white" />
          </motion.button>
        </div>
      )}
    </div>
  );
}
