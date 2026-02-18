import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ExternalLink, TrendingUp, Heart } from 'lucide-react';
import type { Portfolio } from '@/types';

interface KOL {
  address: string;
  name: string;
  handle: string;
  likes: number;
  netWorth: number;
}

interface KOLLeaderboardProps {
  portfolio: Portfolio | null;
}

const KOL_DATABASE: KOL[] = [
  { address: '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6', name: 'Cooker', handle: '@CookerFlips', likes: 1240, netWorth: 420000 },
  { address: '8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd', name: 'Pow', handle: '@traderpow', likes: 980, netWorth: 380000 },
  { address: '7VBTpiiEjkwRbRGHJFUz6o5fWuhPFtAmy8JGhNqwHNnn', name: 'Brox', handle: '@ohbrox', likes: 1320, netWorth: 510000 },
  { address: 'HmBmSYwYEgEZuBUYuDs9xofyqBAkw4ywugB1d7R7sTGh', name: 'Tobx', handle: '@TobxG', likes: 870, netWorth: 290000 },
  { address: 'mW4PZB45isHmnjGkLpJvjKBzVS5NXzTJ8UDyug4gTsM', name: 'Dex', handle: '@igndex', likes: 760, netWorth: 220000 },
  { address: 'DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm', name: 'Gake', handle: '@Ga__ke', likes: 690, netWorth: 180000 },
  { address: 'ATKi3ZvMbo31pbgBgGSGQPDPKEbQ4oGzoDrwG2sms56k', name: 'Nach', handle: '@NachSOL', likes: 1430, netWorth: 610000 },
  { address: '3kebnKw7cPdSkLRfiMEALyZJGZ4wdiSRvmoN4rD1yPzV', name: 'Bastille', handle: '@BastilleBtc', likes: 540, netWorth: 900000 },
  { address: 'AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm', name: 'Ansem', handle: '@blknoiz06', likes: 2100, netWorth: 1500000 },
  { address: '215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP', name: 'OGAntD', handle: '@0GAntD', likes: 1020, netWorth: 470000 },
  { address: '7i7vHEv87bs135DuoJVKe9c7abentawA5ydfWcWc8iY2', name: 'ChartFu', handle: '@ChartFuMonkey', likes: 640, netWorth: 260000 },
  { address: 'F5TjPySiUJMdvqMZHnPP85Rc1vErDGV5FR5P2vdVm429', name: 'Zyaf', handle: '@0xZyaf', likes: 1580, netWorth: 730000 },
  { address: '6m5sW6EAPAHncxnzapi1ZVJNRb9RZHQ3Bj7FD84X9rAF', name: 'Shocked JS', handle: '@ShockedJS', likes: 520, netWorth: 190000 },
  { address: 'DpNVrtA3ERfKzX4F8Pi2CVykdJJjoNxyY5QgoytAwD26', name: 'Gorilla Capital', handle: '@gorillacapsol', likes: 1180, netWorth: 840000 },
  { address: '7SDs3PjT2mswKQ7Zo4FTucn9gJdtuW4jaacPA65BseHS', name: 'Insentos', handle: '@insentos', likes: 680, netWorth: 250000 },
];

const formatNumber = (num: number) => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};

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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                  {index + 1}
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{kol.name}</div>
                  <a
                    href={`https://x.com/${kol.handle.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:underline flex items-center gap-1"
                  >
                    {kol.handle}
                    <ExternalLink className="w-3 h-3" />
                  </a>
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
          </motion.div>
        ))}
      </div>
    </div>
  );
}
