import { useState, useRef, useEffect } from 'react';
import { Bell, Wallet, ChevronDown, LogOut, User, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Session, User as UserType } from '@/types';

interface HeaderProps {
  session: Session | null;
  profile: UserType | null;
  notificationsCount: number;
  isConnecting?: boolean;
  onConnect: (type: 'phantom' | 'solflare') => void;
  onDisconnect: () => void;
  onViewChange: (view: 'feed' | 'messages' | 'profile' | 'kol' | 'notifications') => void;
  onNotifications: () => void;
  currentView: string;
  portfolioBalance?: number;
}

export function Header({
  session,
  profile,
  notificationsCount,
  isConnecting = false,
  onConnect,
  onDisconnect,
  onViewChange,
  onNotifications,
  currentView,
  portfolioBalance,
}: HeaderProps) {
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsWalletMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      setIsWalletMenuOpen(false);
    }
  }, [isMobileMenuOpen]);

  const shortAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const displayName = profile?.username || (session ? shortAddress(session.address) : 'Sign in');
  const initials = session ? (profile?.username || 'SG').replace('@', '').slice(0, 2).toUpperCase() : '';

  const navItems = [
    { key: 'feed', label: 'FEED' },
    { key: 'messages', label: 'MESSAGES' },
    { key: 'kol', label: 'LEADERBOARD' },
  ];
  const mobileItems = [
    { key: 'main', label: 'Back to Main', action: () => (window.location.href = '/') },
    { key: 'feed', label: 'Feed' },
    { key: 'messages', label: 'Messages' },
    { key: 'kol', label: 'Leaderboard' },
    { key: 'notifications', label: 'Notifications', action: onNotifications },
  ];

  return (
    <header className="relative z-50">
      <div className="w-full max-w-[1440px] mx-auto flex items-center justify-between px-4 py-4 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-white shadow-lg shadow-pink-500/20 border border-white/80 overflow-hidden">
            <img
              src="/logo.png"
              alt="SUGAR"
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
            />
          </div>
          <div>
            <div className="font-serif text-2xl font-bold tracking-tight text-slate-900">
              SUGAR
            </div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              Find Your Web3 Match
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1 bg-white/70 backdrop-blur-md px-2 py-1.5 rounded-full shadow-sm border border-white/60">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key as any)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                currentView === item.key
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-3">
          <a
            href="/"
            className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-white transition-colors"
          >
            <span className="text-base leading-none">←</span>
            Back to Main
          </a>
          {/* Mobile Menu */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden w-9 h-9 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <button
            onClick={onNotifications}
            className="relative w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white transition-colors"
          >
            <Bell className="w-5 h-5" />
            {notificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center">
                {notificationsCount > 99 ? '99+' : notificationsCount}
              </span>
            )}
          </button>

          {/* Wallet */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => session ? setIsWalletMenuOpen(!isWalletMenuOpen) : setIsWalletMenuOpen(true)}
              className="flex items-center gap-2 pl-2 pr-2 md:pr-3 py-1.5 bg-white/80 backdrop-blur-md border border-slate-200 rounded-full shadow-sm hover:shadow-md transition-shadow"
            >
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-xs text-white font-bold overflow-hidden"
              style={profile?.photo ? { backgroundImage: `url(${profile.photo})`, backgroundSize: 'cover' } : {}}
            >
              {!profile?.photo && (isConnecting && !session ? (
                <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              ) : session ? (
                initials
              ) : (
                <User className="w-4 h-4 text-white/90" />
              ))}
            </div>
            <span className={`text-sm font-semibold text-slate-700 hidden sm:block ${isConnecting && !session ? 'opacity-0' : ''}`}>
              {displayName}
              {profile?.gender === 'male' && portfolioBalance !== undefined && (
                <span className="text-slate-400 ml-1">• {portfolioBalance.toFixed(2)} SOL</span>
              )}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
            </button>

          <AnimatePresence>
            {isWalletMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-14 bg-white border border-slate-100 rounded-2xl shadow-xl p-3 w-56 z-50"
              >
                {!session ? (
                  <>
                    <button
                      onClick={() => {
                        onConnect('phantom');
                        setIsWalletMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 text-sm font-semibold text-slate-700 flex items-center gap-2 transition-colors"
                    >
                      <Wallet className="w-4 h-4" />
                      Connect Phantom
                    </button>
                    <button
                      onClick={() => {
                        onConnect('solflare');
                        setIsWalletMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 text-sm font-semibold text-slate-700 flex items-center gap-2 transition-colors"
                    >
                      <Wallet className="w-4 h-4" />
                      Connect Solflare
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        onViewChange('profile');
                        setIsWalletMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 text-sm font-semibold text-slate-700 flex items-center gap-2 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        onDisconnect();
                        setIsWalletMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-rose-50 text-sm font-semibold text-rose-500 flex items-center gap-2 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Disconnect
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-x-4 top-6 rounded-3xl bg-white shadow-xl border border-white/80 p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-600">Navigation</div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid gap-2">
                {mobileItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      item.action?.();
                      if (item.key !== 'main') {
                        onViewChange(item.key as any);
                      }
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold transition-colors ${
                      currentView === item.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </header>
  );
}
