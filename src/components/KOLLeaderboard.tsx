import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ExternalLink, TrendingUp, Heart } from 'lucide-react';
import type { Portfolio } from '@/types';
import rawKols from '@/data/kols.json';

interface KOL {
  address: string;
  name: string;
  handle: string;
  likes: number;
  netWorth: number;
  tokens: { symbol: string; amount: number }[];
}

interface KOLLeaderboardProps {
  portfolio: Portfolio | null;
}

const normalizeHandle = (value?: string) => {
  if (!value) return '';
  const cleaned = value.replace(/^@/, '').trim();
  if (cleaned.toLowerCase() === 'kolscan') return '';
  if (cleaned.toLowerCase() === 'gorillacapsol') return 'gorillacap';
  return cleaned;
};

const KOL_DATABASE: KOL[] = (Array.isArray(rawKols) ? rawKols : [])
  .filter((kol: any) => kol?.wallet)
  .map((kol: any) => {
    const handle = normalizeHandle(kol.xHandle);
    const name = (kol.name && kol.name.toLowerCase() !== 'kolscan' ? kol.name : '') ||
      (handle ? handle : kol.wallet.slice(0, 6));
    return {
      address: kol.wallet,
      name,
      handle: handle ? `@${handle}` : '',
      likes: Number(kol.likes || 0),
      netWorth: Number(kol.netWorth || 0),
      tokens: Array.isArray(kol.tokens) ? kol.tokens : [],
    };
  });

const formatNumber = (num: number) => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};

const shortAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

export function KOLLeaderboard(_props: KOLLeaderboardProps) {
  const [sortBy, setSortBy] = useState<'likes' | 'netWorth'>('likes');

  const sorted = useMemo(() => {
    const copy = [...KOL_DATABASE];
    if (sortBy === 'likes') {
      return copy.sort((a, b) => b.likes - a.likes);
    }
    return copy.sort((a, b) => b.netWorth - a.netWorth);
  }, [sortBy]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h2 className="font-serif text-xl text-slate-800">Leaderboard</h2>
        </div>
        <p className="text-xs text-slate-400">
          Top profiles by likes or net worth.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setSortBy('likes')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              sortBy === 'likes'
                ? 'bg-white shadow-sm text-slate-900'
                : 'hover:bg-white/60 text-slate-500'
            }`}
          >
            Most Liked
          </button>
          <button
            onClick={() => setSortBy('netWorth')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              sortBy === 'netWorth'
                ? 'bg-white shadow-sm text-slate-900'
                : 'hover:bg-white/60 text-slate-500'
            }`}
          >
            Highest Net Worth
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sorted.map((kol, index) => (
          <motion.div
            key={kol.address}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4"
          >
            {/** profile image + handle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {kol.handle ? (
                    <img
                      src={`https://unavatar.io/x/${kol.handle.replace('@', '')}`}
                      alt={kol.name}
                      className="w-12 h-12 rounded-full object-cover border border-slate-200"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center border border-slate-200">
                      {shortAddress(kol.address)}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                    {index + 1}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{kol.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{shortAddress(kol.address)}</div>
                  {kol.handle ? (
                    <a
                      href={`https://x.com/${kol.handle.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-500 hover:underline flex items-center gap-1"
                    >
                      {kol.handle}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <div className="text-xs text-slate-400">No X linked</div>
                  )}
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-2 justify-end text-sm text-slate-600">
                  <Heart className="w-4 h-4 text-pink-500" />
                  {formatNumber(kol.likes)}
                </div>
                <div className="flex items-center gap-2 justify-end text-sm text-slate-600 mt-1">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  ${formatNumber(kol.netWorth)}
                </div>
              </div>
            </div>

            {kol.tokens.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {kol.tokens.slice(0, 5).map((token) => (
                  <span
                    key={`${kol.address}-${token.symbol}`}
                    className="px-2 py-1 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500"
                  >
                    {token.symbol} {formatNumber(Number(token.amount || 0))}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
