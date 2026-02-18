import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, RefreshCw, Wallet, TrendingUp, Image as ImageIcon } from 'lucide-react';
import type { Portfolio } from '@/types';

interface WalletScanProps {
  scanPortfolio: Portfolio | null;
  onScan: (address: string) => void;
  onRefreshMatches: () => void;
}

const SAMPLE_ADDRESSES = [
  '8bZ4s6z6Q2m5W7V9o2s6Y8k5J9x1D4p8F7a6L3r2v9q',
  'GkN2d7uYz3gT7Q3h6S2k1N8d9kX1m9e3tD2cY7g1s4mP',
  '7y5mH7k2W8a4t7L2p8q2K5V5m7Q3n9s9F7z2e7b3Q2u',
];

export function WalletScan({ scanPortfolio, onScan, onRefreshMatches }: WalletScanProps) {
  const [address, setAddress] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    if (!address.trim()) return;
    setIsScanning(true);
    await onScan(address);
    setIsScanning(false);
  };

  const handleSample = () => {
    const randomAddress = SAMPLE_ADDRESSES[Math.floor(Math.random() * SAMPLE_ADDRESSES.length)];
    setAddress(randomAddress);
    onScan(randomAddress);
  };

  const shortAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const formatNumber = (num: number) => {
    if (num > 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num > 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  return (
    <div className="space-y-4">
      {/* Scan Card */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="font-serif text-lg text-slate-800">Find Your Web3 Match</h3>
        <p className="text-xs text-slate-500 mt-1">
          Discover people who share your crypto passion.
        </p>

        {/* Input */}
        <div className="mt-3 flex gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            placeholder="Enter wallet address"
          />
          <button
            onClick={handleScan}
            disabled={isScanning || !address.trim()}
            className="px-3 py-2 rounded-xl bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1"
          >
            {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Scan
          </button>
          <button
            onClick={handleSample}
            className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold"
          >
            Try sample
          </button>
        </div>

        {/* Results */}
        {scanPortfolio && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 pt-4 border-t border-slate-100"
          >
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-3">
              Latest Scan: {shortAddress(address)}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wide">
                  <Wallet className="w-3 h-3" />
                  SOL Balance
                </div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  {scanPortfolio.balance.toFixed(2)} SOL
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wide">
                  <TrendingUp className="w-3 h-3" />
                  Est. Total Value
                </div>
                <div className="text-sm font-bold text-slate-700 mt-1">
                  ${formatNumber(scanPortfolio.total_value)}
                </div>
              </div>
            </div>

            {/* Tokens */}
            <div className="mt-3">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Tokens</div>
              <div className="flex flex-wrap gap-2">
                {scanPortfolio.tokens.slice(0, 6).map((token) => (
                  <span
                    key={token.symbol}
                    className="px-2 py-1 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500"
                  >
                    {token.symbol}: {formatNumber(token.amount)}
                  </span>
                ))}
              </div>
            </div>

            {/* NFTs */}
            <div className="mt-3">
              <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-wide mb-2">
                <ImageIcon className="w-3 h-3" />
                NFT Count
              </div>
              <div className="text-sm font-semibold text-slate-700">
                {scanPortfolio.nfts?.length || 0} NFTs
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Refresh Button */}
      {scanPortfolio && (
        <button
          onClick={onRefreshMatches}
          className="w-full px-4 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 transition-colors"
        >
          Find Matches
        </button>
      )}
    </div>
  );
}
