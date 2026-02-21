import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import headerImage from '@/assets/header.jpeg';

function App() {
  const {
    session,
    portfolio: walletPortfolio,
    connect,
    disconnect,
    refreshPortfolio,
    fetchPortfolio,
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
    setScanPortfolio,
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
    recordHeartBack,
    checkMutualHeart,
    recordSkip,
    advanceMatch,
    saveProfile,
    seedMessagesFor,
    seedFeedActivity,
    boostWallet,
    sendMessage,
    setPortfolio,
    ensureProfilePost,
    ensureMatchPost,
    clearUserState,
    addNotification,
    markNotificationRead,
    syncHeartsFor,
    syncSkipsFor,
    markMessagesRead,
    hydrateMessagesForUser,
    loadMessagesForUser,
    subscribeToMessages,
    loadNotificationsForUser,
    getAllSavedProfiles,
    getLikedWalletsFor,
    ensureProfileForWallet,
    loadProfileForWallet,
    syncProfilesFromSupabase,
    subscribeToProfiles,
    ensureLikedPostsFor,
    loadProfileFromSupabase,
    subscribeToHearts,
  } = useAppState();

  const [isConnecting, setIsConnecting] = useState(false);
  const [activeChatUser, setActiveChatUser] = useState<string | null>(null);
  const [focusPostId, setFocusPostId] = useState<number | null>(null);
  const [heartsReady, setHeartsReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [scannedWalletAddress, setScannedWalletAddress] = useState<string | null>(null);
  const lastHeartsNotified = useRef<Record<string, number>>({});

  const savedProfiles = useMemo(() => {
    if (!session) return [];
    return getAllSavedProfiles().filter((p) => p.wallet_address !== session.address);
  }, [session, profilesVersion, getAllSavedProfiles]);

  const regenerateMatches = useCallback(() => {
    if (!session) return;
    return generateMatches(appPortfolio || null, savedProfiles, session.address, {
      preferredGender: profile?.gender ?? 'male',
    });
  }, [session, appPortfolio, savedProfiles, profile?.gender, generateMatches]);


  // Sync wallet portfolio with app state
  useEffect(() => {
    if (walletPortfolio) {
      setPortfolio(walletPortfolio);
    }
  }, [walletPortfolio, setPortfolio]);

  // Show profile modal after profile load
  useEffect(() => {
    if (!session) return;
    if (!profileReady) return;
    if (!profile || !profile.gender) {
      setIsProfileModalOpen(true);
    } else {
      setIsProfileModalOpen(false);
    }
  }, [session, profileReady, profile, setIsProfileModalOpen]);

  useEffect(() => {
    if (!session) {
      setHeartsReady(false);
      setProfileReady(false);
      return;
    }
    let active = true;
    const run = async () => {
      setProfileReady(false);
      seedFeedActivity();
      const localProfile = loadProfileForWallet(session.address);
      if (localProfile?.gender) {
        setProfileReady(true);
      }
      // Hydrate messages from localStorage immediately for this user so they persist across refresh
      hydrateMessagesForUser(session.address);
      await syncHeartsFor(session.address);
      await syncSkipsFor(session.address);
      if (!active) return;
      setHeartsReady(true);
      await loadProfileFromSupabase(session.address);
      if (!active) return;
      setProfileReady(true);
      await loadMessagesForUser(session.address);
      await loadNotificationsForUser(session.address);
      if (!active) return;
      seedMessagesFor(session.address);
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
    };
    void run();
    return () => {
      active = false;
    };
  }, [
    session,
    seedFeedActivity,
    seedMessagesFor,
    hydrateMessagesForUser,
    syncHeartsFor,
    syncSkipsFor,
    loadMessagesForUser,
    subscribeToMessages,
    loadNotificationsForUser,
    refreshPortfolio,
    ensureProfileForWallet,
    loadProfileForWallet,
    loadProfileFromSupabase,
  ]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = subscribeToMessages(session.address);
    return () => {
      unsubscribe();
    };
  }, [session, subscribeToMessages]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = subscribeToHearts(session.address);
    return () => {
      unsubscribe();
    };
  }, [session, subscribeToHearts]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      loadMessagesForUser(session.address);
    }, 15000);
    return () => window.clearInterval(id);
  }, [session, loadMessagesForUser]);

  useEffect(() => {
    if (!session) return;
    const count = Object.keys(hearts.received || {}).length;
    const lastCount = lastHeartsNotified.current[session.address] ?? 0;
    if (count > 0 && count > lastCount) {
      addNotification({
        type: 'match',
        actor: 'SUGAR',
        content: `You received ${count} hearts. Now it’s your turn.`,
        recipient: session.address,
      });
      lastHeartsNotified.current[session.address] = count;
    }
  }, [session, hearts.received, addNotification]);

  // Run on load/profile change only — do NOT depend on ensureLikedPostsFor so that
  // sending a heart doesn’t re-run this and cause the new post to disappear.
  useEffect(() => {
    if (!session || !heartsReady) return;
    regenerateMatches();
    ensureLikedPostsFor(session.address);
  }, [session, heartsReady, profilesVersion, regenerateMatches]);

  useEffect(() => {
    if (!session || !profile || !heartsReady) return;
    if (!profile.gender) return;
    regenerateMatches();
  }, [session, profile?.gender, heartsReady, regenerateMatches]);

  useEffect(() => {
    if (!session) return;
    if (matches.length > 0) return;
    regenerateMatches();
  }, [session, matches.length, regenerateMatches]);

  useEffect(() => {
    if (!session) return;
    syncProfilesFromSupabase();
    const id = window.setInterval(() => {
      syncProfilesFromSupabase();
    }, 60000);
    return () => window.clearInterval(id);
  }, [session, syncProfilesFromSupabase]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = subscribeToProfiles();
    return () => {
      unsubscribe();
    };
  }, [session, subscribeToProfiles]);

  useEffect(() => {
    if (session && profile) {
      ensureProfilePost(session.address, profile.username, appPortfolio);
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
      if (result?.mobileLink) {
        toast.message(`Opening ${type === 'phantom' ? 'Phantom' : 'Solflare'}…`);
        window.location.href = result.mobileLink;
        return;
      }
      if (result?.address) {
        void refreshPortfolio().catch(() => {});
      }
      toast.success('Wallet connected successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (session?.address) {
      delete lastHeartsNotified.current[session.address];
    }
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
        addNotification({
          type: 'match',
          actor: profile?.username || session.address.slice(0, 8),
          content: 'sent you a heart — like back to reveal',
          wallet_address: session.address,
          recipient: match.wallet_address,
        });
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
  };

  const handleSendMessage = async (receiver: string, content: string, image?: string) => {
    if (!session) return;
    if (receiver === session.address) {
      toast.error("You can't message yourself.");
      return;
    }
    const hasHistory = messages.some(
      (msg) =>
        (msg.sender === session.address && msg.receiver === receiver) ||
        (msg.sender === receiver && msg.receiver === session.address)
    );
    let likesMap: Record<string, string[]> = {};
    try {
      const raw = localStorage.getItem('sugar-likes');
      likesMap = raw ? JSON.parse(raw) : {};
    } catch {
      likesMap = {};
    }
    let hasSentHeart =
      !!hearts.sent[receiver] || (likesMap[session.address] || []).includes(receiver);
    let hasReceivedHeart =
      !!hearts.received[receiver] || (likesMap[receiver] || []).includes(session.address);
    const ensureHearts = async () => {
      await syncHeartsFor(session.address);
      const refreshedLikesRaw = localStorage.getItem('sugar-likes');
      const refreshedLikes: Record<string, string[]> = refreshedLikesRaw ? JSON.parse(refreshedLikesRaw) : {};
      hasSentHeart =
        !!hearts.sent[receiver] ||
        (refreshedLikes[session.address] || []).includes(receiver);
      hasReceivedHeart =
        !!hearts.received[receiver] ||
        (refreshedLikes[receiver] || []).includes(session.address);
    };
    if (!hasSentHeart || !hasReceivedHeart) {
      await ensureHearts();
      if (!hasSentHeart || !hasReceivedHeart) {
        const status = await checkMutualHeart(session.address, receiver);
        hasSentHeart = hasSentHeart || status.sent;
        hasReceivedHeart = hasReceivedHeart || status.received;
      }
    }
    if (hasReceivedHeart && !hasSentHeart) {
      recordHeartBack(session.address, receiver);
      hasSentHeart = true;
    }
    const isMutual = hasSentHeart && hasReceivedHeart;
    if (!isMutual && !hasHistory) {
      toast.error('You can only message after both hearts are sent.');
      return;
    }
    sendMessage(receiver, content, session.address, image);
    const actor = profile?.username || session.address.slice(0, 8);
    addNotification({
      type: 'message',
      actor,
      content: 'sent you a message',
      wallet_address: session.address,
      recipient: receiver,
    });
  };

  const handleScanWallet = (walletAddress: string) => {
    setScannedWalletAddress(walletAddress);
    setScanPortfolio(null);
    fetchPortfolio(walletAddress)
      .then((p) => {
        setScanPortfolio(p);
      })
      .catch((err) => console.warn('Scan wallet failed', err));
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
    votePost(postId, type, session?.address);
    const post = posts.find((p) => p.id === postId);
    if (post && session && post.wallet_address !== session.address) {
      const actor = profile?.username || session.address.slice(0, 8);
      addNotification({
        type: 'vote',
        actor,
        content: type === 'vouch' ? 'vouched your post' : 'vented your post',
        recipient: post.wallet_address,
        postId,
      });
    }
  };

  const handleAddComment = (postId: number, text: string) => {
    if (!session) {
      toast.error('Connect your wallet to comment');
      return;
    }
    const username = profile?.username || session.address.slice(0, 8);
    addComment(postId, text, username);
    const post = posts.find((p) => p.id === postId);
    if (post && post.wallet_address !== session.address) {
      addNotification({
        type: 'comment',
        actor: username,
        content: `commented: "${text}"`,
        recipient: post.wallet_address,
        postId,
      });
    }
  };

  const handleSaveProfile = (userProfile: Parameters<typeof saveProfile>[0]) => {
    if (!session) return;
    saveProfile(userProfile, session.address);
    toast.success('Profile saved!');
  };

  const currentMatch = useMemo(() => {
    if (!session) return null;
    return matches[matchIndex] || null;
  }, [matches, matchIndex, session]);
  const likedWallets = useMemo(
    () => (session ? getLikedWalletsFor(session.address) : []),
    [session, getLikedWalletsFor, hearts.sent]
  );
  const userNotifications = useMemo(
    () =>
      session
        ? notifications.filter((note) => !note.recipient || note.recipient === session.address)
        : [],
    [notifications, session]
  );
  const sortedPosts = useMemo(() => {
    const base = getSortedPosts();
    if (feedTab === 'liked') {
      if (!likedWallets.length) return [];
      return base.filter((post) => likedWallets.includes(post.wallet_address));
    }
    return base;
  }, [getSortedPosts, feedTab, likedWallets]);
  const likedOnlyPosts = useMemo(() => {
    if (!likedWallets.length) return [];
    return sortedPosts.filter((post) => likedWallets.includes(post.wallet_address));
  }, [sortedPosts, likedWallets]);
  const visiblePosts = session && likedWallets.length ? likedOnlyPosts : [];
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
        isConnecting={isConnecting}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onViewChange={setView}
        onNotifications={() => setView('notifications')}
        currentView={view}
        portfolioBalance={appPortfolio?.balance}
      />

      <section className="relative z-10 w-full max-w-[1440px] mx-auto px-4 lg:px-8 pb-6">
        <div className="relative h-32 md:h-44 rounded-[32px] overflow-hidden border border-white/50 shadow-lg shadow-pink-500/10 bg-slate-900">
          <img
            src={headerImage}
            alt="SUGAR"
            className="absolute inset-0 w-full h-full object-cover scale-105"
            loading="eager"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_55%)]" />
          <div className="relative h-full flex flex-col justify-center px-6">
            <div className="text-[11px] uppercase tracking-[0.45em] text-white/70 font-semibold">SUGAR</div>
            <div className="text-2xl md:text-3xl font-serif text-white font-semibold leading-tight">
              Verified KOLs. Real matches.
              <span className="block text-white/80">Real activity.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto grid grid-cols-12 gap-6 px-4 lg:px-8 pb-8 overflow-visible md:overflow-hidden">
        {/* Left Column - Match Card (Feed/Matches views) */}
        {view === 'feed' && (
          <section className="col-span-12 lg:col-span-7 xl:col-span-8 min-h-[calc(100vh-120px)] md:h-[calc(100vh-120px)] flex flex-col justify-center py-4 md:py-0">
            <div className="relative w-full max-w-lg mx-auto h-full max-h-[620px] md:max-h-[700px]">
              {/* Card Stack Effect */}
              <div className="absolute top-4 left-4 right-[-10px] bottom-[-10px] bg-white opacity-40 rounded-[32px] scale-95 transform translate-y-4 -z-10 border border-white/40 shadow-sm" />
              <div className="absolute top-8 left-8 right-[-20px] bottom-[-20px] bg-white opacity-20 rounded-[32px] scale-90 transform translate-y-8 -z-20 border border-white/20 shadow-sm" />

              {/* Match Card */}
              <MatchCard
                match={currentMatch}
                onSkip={handleSkip}
                onHeart={handleSendHeart}
                onConnect={handleConnect}
                emptyState={session ? 'nomore' : 'connect'}
              />
            </div>
          </section>
        )}

        {/* Left Column - Messages */}
        {view === 'messages' && session && (
          <section className="col-span-12 lg:col-span-12 min-h-[calc(100vh-120px)] md:h-[calc(100vh-120px)]">
            <Messages
              messages={messages}
              session={session}
              matches={matchDirectory}
              scanPortfolio={scanPortfolio}
              scannedWalletAddress={scannedWalletAddress}
              onScanWallet={handleScanWallet}
              onSendMessage={handleSendMessage}
              onBack={() => setView('feed')}
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
          <section className="col-span-12 lg:col-span-12 min-h-[calc(100vh-120px)] md:h-[calc(100vh-120px)]">
            <Notifications
              notifications={userNotifications}
              onNotificationClick={(note) => {
                markNotificationRead(note.id);
                if (note.type === 'message' && note.wallet_address && session) {
                  setActiveChatUser(note.wallet_address);
                  setView('messages');
                  markMessagesRead(session.address, note.wallet_address);
                }
                if (note.type === 'match' && note.wallet_address && session) {
                  setActiveChatUser(note.wallet_address);
                  setView('messages');
                }
                if ((note.type === 'vote' || note.type === 'comment') && note.postId) {
                  setView('feed');
                  setFocusPostId(note.postId);
                }
              }}
            />
          </section>
        )}

        {/* Left Column - Profile */}
        {view === 'profile' && session && (
          <section className="col-span-12 lg:col-span-12 min-h-[calc(100vh-120px)] md:h-[calc(100vh-120px)]">
            {profileReady ? (
              <ProfilePage
                profile={profile}
                session={session}
                portfolio={appPortfolio}
                heartsSent={Object.keys(hearts.sent).length}
                heartsReceived={Object.keys(hearts.received).length}
                onUpdateProfile={(updates) => {
                  saveProfile(updates, session.address);
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="bg-white/80 backdrop-blur rounded-3xl p-8 border border-white/60 shadow-sm">
                  <div className="text-sm font-semibold text-slate-600">
                    Loading your profile...
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Left Column - KOL */}
        {view === 'kol' && (
          <section className="col-span-12 lg:col-span-12 min-h-[calc(100vh-120px)] md:h-[calc(100vh-120px)]">
            <div className="md:hidden mb-3">
              <button
                onClick={() => setView('feed')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-slate-200 text-slate-600 text-sm font-semibold"
              >
                <span className="text-lg leading-none">←</span>
                Back to Feed
              </button>
            </div>
            <KOLLeaderboard portfolio={activePortfolio} />
          </section>
        )}

        {/* Right Column - Sidebar */}
        {(view !== 'messages' && view !== 'profile' && view !== 'kol' && view !== 'notifications') && (
        <aside className="col-span-12 lg:col-span-5 xl:col-span-4 md:h-[calc(100vh-120px)] h-auto flex flex-col overflow-hidden mt-6 lg:mt-0">
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
                    posts={visiblePosts}
                    session={session}
                    profile={profile}
                    portfolio={appPortfolio}
                    focusPostId={focusPostId}
                    onFocusHandled={() => setFocusPostId(null)}
                    anonymous={anonymous}
                    feedTab={feedTab}
                    heartsTotal={session ? hearts.total : 0}
                    hasLikes={likedWallets.length > 0}
                    onCreatePost={handleCreatePost}
                    onVote={handleVotePost}
                    onAddComment={handleAddComment}
                    onVoteComment={voteComment}
                    onShare={(postId) => {
                      const post = posts.find((p) => p.id === postId);
                      if (post) {
                        const text = `${post.content} — via SUGAR`;
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
                    posts={visiblePosts}
                    session={session}
                    profile={profile}
                    portfolio={appPortfolio}
                    focusPostId={focusPostId}
                    onFocusHandled={() => setFocusPostId(null)}
                    anonymous={anonymous}
                    feedTab={feedTab}
                    heartsTotal={session ? hearts.total : 0}
                    hasLikes={likedWallets.length > 0}
                    onCreatePost={handleCreatePost}
                    onVote={handleVotePost}
                    onAddComment={handleAddComment}
                    onVoteComment={voteComment}
                    onShare={(postId) => {
                      const post = posts.find((p) => p.id === postId);
                      if (post) {
                        const text = `${post.content} — via SUGAR`;
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
