import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { MatchCard } from '@/components/MatchCard';
import { Feed } from '@/components/Feed';
import { ProfileModal } from '@/components/ProfileModal';
import { Messages } from '@/components/Messages';
import { ProfilePage } from '@/components/Profile';
import { KOLLeaderboard } from '@/components/KOLLeaderboard';
import { Notifications } from '@/components/Notifications';
import { useWallet } from '@/hooks/useWallet';
import { useAppState } from '@/hooks/useAppState';
import { Toaster, toast } from 'sonner';

function App() {
  const {
    session,
    portfolio: walletPortfolio,
    connect,
    disconnect,
    refreshPortfolio,
  } = useWallet();

  const {
    view,
    setView,
    feedTab,
    setFeedTab,
    anonymous,
    setAnonymous,
    posts,
    profile,
    portfolio: appPortfolio,
    scanPortfolio,
    matches,
    matchDirectory,
    matchIndex,
    profilesVersion,
    hearts,
    messages,
    notifications,
    isProfileModalOpen,
    setIsProfileModalOpen,
    getSortedPosts,
    calculateOverlapScore,
    createPost,
    votePost,
    addComment,
    voteComment,
    generateMatches,
    sendHeart,
    recordSkip,
    advanceMatch,
    skipMatch,
    saveProfile,
    seedMessagesFor,
    boostWallet,
    sendMessage,
    setPortfolio,
    ensureProfilePost,
    ensureMatchPost,
    clearUserState,
    addNotification,
    markNotificationRead,
    syncHeartsFor,
    markMessagesRead,
    getAllSavedProfiles,
    ensureProfileForWallet,
  } = useAppState();

  const [isConnecting, setIsConnecting] = useState(false);
  const [activeChatUser, setActiveChatUser] = useState<string | null>(null);
  const lastSessionAddress = useRef<string | null>(null);
  const hasAutoRefreshedMatches = useRef(false);

  const regenerateMatches = (options?: { ignoreHistory?: boolean }) => {
    if (!session) return;
    const savedProfiles = getAllSavedProfiles().filter(
      (p) => p.wallet_address !== session.address
    );
    return generateMatches(appPortfolio || null, savedProfiles, session.address, {
      preferredGender: profile?.gender,
      ignoreHistory: options?.ignoreHistory,
    });
  };


  // Sync wallet portfolio with app state
  useEffect(() => {
    if (walletPortfolio) {
      setPortfolio(walletPortfolio);
    }
  }, [walletPortfolio, setPortfolio]);

  // Show profile modal after connection if no profile
  useEffect(() => {
    if (session && (!profile || !profile.gender)) {
      setIsProfileModalOpen(true);
    }
  }, [session, profile, setIsProfileModalOpen]);

  useEffect(() => {
    if (session) {
      seedMessagesFor(session.address);
      syncHeartsFor(session.address);
      refreshPortfolio().catch(() => {});
      const ensured = ensureProfileForWallet(
        session.address,
        { username: `@${session.address.slice(0, 8)}` },
        { closeModal: false }
      );
      if (!ensured?.gender) {
        setIsProfileModalOpen(true);
      } else {
        setIsProfileModalOpen(false);
      }
    }
  }, [session, seedMessagesFor, syncHeartsFor, refreshPortfolio, ensureProfileForWallet]);

  useEffect(() => {
    if (!session) {
      lastSessionAddress.current = null;
      hasAutoRefreshedMatches.current = false;
      return;
    }
    if (lastSessionAddress.current !== session.address) {
      lastSessionAddress.current = session.address;
      hasAutoRefreshedMatches.current = false;
    }
    const generated = regenerateMatches();
    if (!generated?.length && !hasAutoRefreshedMatches.current) {
      hasAutoRefreshedMatches.current = true;
      regenerateMatches({ ignoreHistory: true });
    }
  }, [session, profile?.gender, appPortfolio, profilesVersion, generateMatches, getAllSavedProfiles]);

  useEffect(() => {
    if (session && profile) {
      ensureProfilePost(session.address, profile.username, appPortfolio, {
        gender: profile.gender,
        photo: profile.photo,
        netWorth: appPortfolio?.total_value,
      });
    }
  }, [session, profile, appPortfolio, ensureProfilePost]);

  useEffect(() => {
    if (!session || !profile || !appPortfolio) return;
    if (profile.wallet_address !== session.address) return;
    if ((profile.tokens && profile.tokens.length) || profile.total_value > 0) return;
    saveProfile({ ...profile }, session.address, { closeModal: false });
  }, [session, profile, appPortfolio, saveProfile]);

  const handleConnect = async (type: 'phantom' | 'solflare') => {
    setIsConnecting(true);
    try {
      const result = await connect(type);
      if (!result?.portfolio && result?.address) {
        await refreshPortfolio();
      }
      if (!result?.portfolio) {
        toast.error('Portfolio scan failed. Please try again.');
      }
      toast.success('Wallet connected successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    clearUserState();
    setActiveChatUser(null);
    setView('feed');
    toast.info('Wallet disconnected');
  };

  const handleSendHeart = () => {
    const match = matches[matchIndex];
    if (!match) return;

    let isMutual = false;
    if (!session) {
      toast.error('Connect your wallet to send hearts');
    } else {
      try {
        isMutual = sendHeart(match, session.address);
        ensureMatchPost(match);
        boostWallet(match.wallet_address);
        toast.success(`Heart sent to ${match.username}!`);
      } catch (error) {
        console.error('sendHeart failed', error);
        toast.error('Failed to send heart. Moving to next profile.');
      }
    }

    if (isMutual) {
      toast.success(`It's a match with ${match.username}! Private chat unlocked.`, {
        duration: 5000,
      });
      addNotification({
        type: 'match',
        actor: match.username,
        content: 'matched with you',
        wallet_address: match.wallet_address,
        recipient: session?.address,
      });
      setActiveChatUser(match.wallet_address);
      setView('messages');
    }
    advanceMatch(match.wallet_address);
    if (matches.length <= 1) {
      regenerateMatches();
    }
  };

  const handleSkip = () => {
    const match = matches[matchIndex];
    if (!match) return;
    if (session) {
      try {
        recordSkip(session.address, match.wallet_address);
      } catch (error) {
        console.error('recordSkip failed', error);
      }
    }
    advanceMatch(match.wallet_address);
    if (matches.length <= 1) {
      regenerateMatches();
    }
  };

  const handleSendMessage = (receiver: string, content: string) => {
    if (!session) return;
    sendMessage(receiver, content, session.address);
    const actor = profile?.username || session.address.slice(0, 8);
    addNotification({
      type: 'message',
      actor,
      content: 'sent you a message',
      wallet_address: session.address,
      recipient: receiver,
    });
  };

  const handleCreatePost = (content: string) => {
    if (!session) {
      toast.error('Connect your wallet to post');
      return;
    }
    const username = profile?.username || session.address.slice(0, 8);
    createPost(content, session.address, username);
    toast.success('Post created!');
  };

  const handleVotePost = (postId: number, type: 'vouch' | 'vent') => {
    votePost(postId, type);
    const actor = profile?.username || 'Someone';
    addNotification({
      type: 'vote',
      actor,
      content: type === 'vouch' ? 'vouched your post' : 'vented your post',
      recipient: session?.address,
    });
  };

  const handleAddComment = (postId: number, text: string) => {
    if (!session) {
      toast.error('Connect your wallet to comment');
      return;
    }
    const username = profile?.username || session.address.slice(0, 8);
    addComment(postId, text, username);
    addNotification({
      type: 'comment',
      actor: username,
      content: `commented: "${text}"`,
      recipient: session?.address,
    });
  };

  const handleSaveProfile = (userProfile: Parameters<typeof saveProfile>[0]) => {
    if (!session) return;
    saveProfile(userProfile, session.address);
    toast.success('Profile saved!');
  };

  const currentMatch = matches[matchIndex] || null;
  const userNotifications = session
    ? notifications.filter((note) => !note.recipient || note.recipient === session.address)
    : [];
  const sortedPosts = getSortedPosts();
  const activePortfolio = scanPortfolio || appPortfolio;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 overflow-hidden flex flex-col relative">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-[-10%] w-[500px] h-[500px] bg-purple-200 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob" />
        <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-rose-200 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-2000" />
        <div className="absolute bottom-[-20%] left-[20%] w-[600px] h-[600px] bg-blue-100 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-4000" />
      </div>

      {/* Toast Notifications */}
      <Toaster position="top-center" richColors />

      {/* Header */}
      <Header
        session={session}
        profile={profile}
        notificationsCount={userNotifications.filter((n) => !n.read).length}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onViewChange={setView}
        onNotifications={() => setView('notifications')}
        currentView={view}
        portfolioBalance={appPortfolio?.balance}
      />

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto grid grid-cols-12 gap-6 px-4 lg:px-8 pb-8 overflow-hidden">
        {/* Left Column - Match Card (Feed/Matches views) */}
        {view === 'feed' && (
          <section className="col-span-12 lg:col-span-7 xl:col-span-8 h-[calc(100vh-120px)] flex flex-col justify-center">
            <div className="relative w-full max-w-lg mx-auto h-full max-h-[700px]">
              {/* Card Stack Effect */}
              <div className="absolute top-4 left-4 right-[-10px] bottom-[-10px] bg-white opacity-40 rounded-[32px] scale-95 transform translate-y-4 -z-10 border border-white/40 shadow-sm" />
              <div className="absolute top-8 left-8 right-[-20px] bottom-[-20px] bg-white opacity-20 rounded-[32px] scale-90 transform translate-y-8 -z-20 border border-white/20 shadow-sm" />

              {/* Match Card */}
              <MatchCard
                match={currentMatch}
                onSkip={handleSkip}
                onHeart={handleSendHeart}
              />
            </div>
          </section>
        )}

        {/* Left Column - Messages */}
        {view === 'messages' && session && (
          <section className="col-span-12 lg:col-span-12 h-[calc(100vh-120px)]">
            <Messages
              messages={messages}
              session={session}
              matches={matchDirectory}
              onSendMessage={handleSendMessage}
              openUser={activeChatUser}
              onOpenConversation={(otherAddress) => {
                if (session) {
                  markMessagesRead(session.address, otherAddress);
                }
              }}
            />
          </section>
        )}

        {view === 'notifications' && (
          <section className="col-span-12 lg:col-span-12 h-[calc(100vh-120px)]">
            <Notifications
              notifications={userNotifications}
              onNotificationClick={(note) => {
                markNotificationRead(note.id);
                if (note.type === 'message' && note.wallet_address && session) {
                  setActiveChatUser(note.wallet_address);
                  setView('messages');
                  markMessagesRead(session.address, note.wallet_address);
                }
              }}
            />
          </section>
        )}

        {/* Left Column - Profile */}
        {view === 'profile' && session && (
          <section className="col-span-12 lg:col-span-12 h-[calc(100vh-120px)]">
            <ProfilePage
              profile={profile}
              session={session}
              portfolio={appPortfolio}
              heartsSent={Object.keys(hearts.sent).length}
              heartsReceived={Object.keys(hearts.received).length}
              onUpdateProfile={(updates) => {
                if (profile) {
                  saveProfile({ ...profile, ...updates }, session.address);
                }
              }}
            />
          </section>
        )}

        {/* Left Column - KOL */}
        {view === 'kol' && (
          <section className="col-span-12 lg:col-span-12 h-[calc(100vh-120px)]">
            <KOLLeaderboard portfolio={activePortfolio} />
          </section>
        )}

        {/* Right Column - Sidebar */}
        {(view !== 'messages' && view !== 'profile' && view !== 'kol' && view !== 'notifications') && (
        <aside className="col-span-12 lg:col-span-5 xl:col-span-4 h-[calc(100vh-120px)] flex flex-col overflow-hidden">
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl h-full flex flex-col shadow-sm border border-white/60 overflow-hidden">
            <AnimatePresence mode="wait">
              {view === 'feed' ? (
                <motion.div
                  key="feed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col"
                >
                  <Feed
                    posts={sortedPosts}
                    session={session}
                    profile={profile}
                    portfolio={appPortfolio}
                    anonymous={anonymous}
                    feedTab={feedTab}
                    heartsTotal={hearts.total}
                    onCreatePost={handleCreatePost}
                    onVote={handleVotePost}
                    onAddComment={handleAddComment}
                    onVoteComment={voteComment}
                    onShare={(postId) => {
                      const post = posts.find((p) => p.id === postId);
                      if (post) {
                        const text = `${post.content} — via Sugar`;
                        const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
                        window.open(url, '_blank');
                      }
                    }}
                    onToggleAnonymous={() => setAnonymous(!anonymous)}
                    onSetFeedTab={setFeedTab}
                    calculateOverlapScore={calculateOverlapScore}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="feed-kol"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col"
                >
                  <Feed
                    posts={sortedPosts}
                    session={session}
                    profile={profile}
                    portfolio={appPortfolio}
                    anonymous={anonymous}
                    feedTab={feedTab}
                    heartsTotal={hearts.total}
                    onCreatePost={handleCreatePost}
                    onVote={handleVotePost}
                    onAddComment={handleAddComment}
                    onVoteComment={voteComment}
                    onShare={(postId) => {
                      const post = posts.find((p) => p.id === postId);
                      if (post) {
                        const text = `${post.content} — via Sugar`;
                        const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
                        window.open(url, '_blank');
                      }
                    }}
                    onToggleAnonymous={() => setAnonymous(!anonymous)}
                    onSetFeedTab={setFeedTab}
                    calculateOverlapScore={calculateOverlapScore}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
        )}
      </main>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
        walletAddress={session?.address || ''}
      />

      {/* Loading Overlay */}
      {isConnecting && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-700 font-semibold">Connecting wallet...</span>
          </div>
        </div>
      )}

      {/* Custom Styles */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 10s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

export default App;
