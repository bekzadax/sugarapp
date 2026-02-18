import { useState, useEffect, useCallback } from 'react';
import type {
  Post,
  User,
  MatchCandidate,
  Message,
  Portfolio,
  Token,
  Notification,
} from '@/types';
import {
  STORAGE_KEYS,
  PRICE_MAP,
} from '@/types';

const DEFAULT_PROFILE: User = {
  wallet_address: '',
  username: '',
  instagram: '',
  xHandle: '',
  tokens: [],
  nft_count: 0,
  total_value: 0,
  hearts_sent: 0,
  hearts_received: 0,
  bio: '',
  age: 24,
  distance: '2 miles away',
};

export function useAppState() {
  const [view, setView] = useState<'feed' | 'messages' | 'profile' | 'kol' | 'notifications'>('feed');
  const [feedTab, setFeedTab] = useState<'vouch' | 'hot' | 'new' | 'top'>('vouch');
  const [anonymous, setAnonymous] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [profile, setProfile] = useState<User | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [scanPortfolio, setScanPortfolio] = useState<Portfolio | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [matchDirectory, setMatchDirectory] = useState<Record<string, MatchCandidate>>({});
  const [matchIndex, setMatchIndex] = useState(0);
  const [boostedWallets, setBoostedWallets] = useState<Set<string>>(new Set());
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [hearts, setHearts] = useState({
    sent: {} as Record<string, number>,
    received: {} as Record<string, number>,
    total: 0,
  });
  const [trends, setTrends] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    if (matches.length > 0 && matchIndex >= matches.length) {
      setMatchIndex(0);
    }
  }, [matches.length, matchIndex]);

  const safeParse = <T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn('Failed to parse localStorage value', error);
      return fallback;
    }
  };

  // Load from localStorage on mount
  useEffect(() => {
    const savedPosts = safeParse<Post[]>(localStorage.getItem(STORAGE_KEYS.posts), DEFAULT_POSTS);
    setPosts(Array.isArray(savedPosts) ? savedPosts : DEFAULT_POSTS);

    const savedHearts = safeParse<{ sent: Record<string, number>; received: Record<string, number>; total: number }>(
      localStorage.getItem(STORAGE_KEYS.hearts),
      { sent: {}, received: {}, total: 0 }
    );
    const parsedHearts = savedHearts || { sent: {}, received: {}, total: 0 };
    // Add a mock received heart if empty
    if (!Object.keys(parsedHearts.received || {}).length) {
      parsedHearts.received = { [CANDIDATES[1].wallet_address]: Date.now() - 200000 };
    }
    setHearts(parsedHearts);

    const savedTrends = safeParse<Record<string, number>>(
      localStorage.getItem(STORAGE_KEYS.trends),
      {}
    );
    setTrends(savedTrends || {});

    const legacyProfile = localStorage.getItem('sugar-profile');
    if (legacyProfile) {
      try {
        const parsed = JSON.parse(legacyProfile);
        if (parsed?.wallet_address) {
          const profiles = { [parsed.wallet_address]: parsed };
          localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profiles));
        }
      } catch {
        // ignore legacy profile parse errors
      }
      localStorage.removeItem('sugar-profile');
    }

    const savedMessages = safeParse<Message[]>(
      localStorage.getItem(STORAGE_KEYS.messages),
      []
    );
    setMessages(Array.isArray(savedMessages) ? savedMessages : []);

    const savedNotifications = safeParse<Notification[]>(
      localStorage.getItem(STORAGE_KEYS.notifications),
      DEFAULT_NOTIFICATIONS
    );
    setNotifications(Array.isArray(savedNotifications) ? savedNotifications : DEFAULT_NOTIFICATIONS);
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.posts, JSON.stringify(posts));
  }, [posts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.hearts, JSON.stringify(hearts));
  }, [hearts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.trends, JSON.stringify(trends));
  }, [trends]);

  const readProfiles = () => {
    const raw = localStorage.getItem(STORAGE_KEYS.profile);
    return raw ? JSON.parse(raw) : {};
  };

  const writeProfiles = (profiles: Record<string, User>) => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profiles));
    setProfilesVersion((prev) => prev + 1);
  };

  const formatFallbackUsername = (walletAddress: string) => {
    return `@${walletAddress.slice(0, 8)}`;
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (event.key === STORAGE_KEYS.messages) {
        const nextMessages = safeParse<Message[]>(event.newValue, []);
        setMessages(Array.isArray(nextMessages) ? nextMessages : []);
      }
      if (event.key === STORAGE_KEYS.notifications) {
        const nextNotifications = safeParse<Notification[]>(event.newValue, DEFAULT_NOTIFICATIONS);
        setNotifications(Array.isArray(nextNotifications) ? nextNotifications : DEFAULT_NOTIFICATIONS);
      }
      if (event.key === STORAGE_KEYS.posts) {
        const nextPosts = safeParse<Post[]>(event.newValue, DEFAULT_POSTS);
        setPosts(Array.isArray(nextPosts) ? nextPosts : DEFAULT_POSTS);
      }
      if (event.key === STORAGE_KEYS.profile) {
        setProfilesVersion((prev) => prev + 1);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Compute hot score for sorting
  const computeHotScore = useCallback((post: Post): number => {
    const hours = Math.max(1, (Date.now() - post.timestamp) / 3600000);
    const votes = (post.vouch_count || 0) * 2 - (post.vent_count || 0);
    const comments = post.comments?.length || 0;
    return (votes + comments * 1.5) / Math.pow(hours, 0.9);
  }, []);

  // Get sorted posts
  const getSortedPosts = useCallback((): Post[] => {
    const sorted = [...posts];
    const boost = (post: Post) => (boostedWallets.has(post.wallet_address) ? 50 : 0);
    if (feedTab === 'new') {
      sorted.sort((a, b) => (b.timestamp + boost(b)) - (a.timestamp + boost(a)));
    } else if (feedTab === 'top') {
      sorted.sort(
        (a, b) =>
          (b.vouch_count || 0) + boost(b) - ((a.vouch_count || 0) + boost(a))
      );
    } else if (feedTab === 'vouch') {
      sorted.sort(
        (a, b) =>
          ((b.vouch_count || 0) - (b.vent_count || 0)) +
          boost(b) -
          (((a.vouch_count || 0) - (a.vent_count || 0)) + boost(a))
      );
    } else {
      sorted.sort((a, b) => computeHotScore(b) + boost(b) - (computeHotScore(a) + boost(a)));
    }
    return sorted;
  }, [posts, feedTab, computeHotScore, boostedWallets]);

  // Calculate overlap score
  const calculateOverlapScore = useCallback(
    (tokens: string[], userPortfolio: Portfolio | null): number => {
      if (!userPortfolio) return 0;
      const map = new Map(userPortfolio.tokens.map((token) => [token.symbol, token]));
      const total = userPortfolio.total_value || 1;
      const sharedValue = tokens.reduce((sum, token) => {
        const match = map.get(token);
        return sum + (match?.usdValue || 0);
      }, 0);
      return Math.min(99, Math.max(1, Math.round((sharedValue / total) * 100)));
    },
    []
  );

  // Create post
  const createPost = useCallback(
    (content: string, walletAddress: string, username: string) => {
      const postTokens = portfolio?.tokens?.length
        ? portfolio.tokens.slice(0, 3).map((token) => token.symbol)
        : ['ETH'];
      const author = anonymous ? 'Anonymous' : username;

      const newPost: Post = {
        id: Date.now(),
        author,
        wallet_address: walletAddress,
        content,
        tokens: postTokens,
        vouch_count: 0,
        vent_count: 0,
        comments: [],
        timestamp: Date.now(),
      };

      setPosts((prev) => [newPost, ...prev]);
      updateTrends(postTokens);
    },
    [portfolio, anonymous]
  );

  // Update trends
  const updateTrends = useCallback((tokens: string[]) => {
    setTrends((prev) => {
      const next = { ...prev };
      tokens.forEach((token) => {
        next[token] = (next[token] || 0) + 1;
      });
      return next;
    });
  }, []);

  // Vote on post
  const votePost = useCallback((postId: number, type: 'vouch' | 'vent') => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        if (post.userVote === type) return post;

        let vouchCount = post.vouch_count || 0;
        let ventCount = post.vent_count || 0;

        if (post.userVote === 'vouch') vouchCount = Math.max(0, vouchCount - 1);
        if (post.userVote === 'vent') ventCount = Math.max(0, ventCount - 1);

        if (type === 'vouch') vouchCount++;
        if (type === 'vent') ventCount++;

        return {
          ...post,
          vouch_count: vouchCount,
          vent_count: ventCount,
          userVote: type,
          userVouched: type === 'vouch',
          userVented: type === 'vent',
        };
      })
    );
    if (type === 'vouch') {
      const target = posts.find((post) => post.id === postId);
      if (target) {
        setBoostedWallets((prev) => {
          const next = new Set(prev);
          next.add(target.wallet_address);
          return next;
        });
      }
    }
  }, [posts]);

  // Add comment
  const addComment = useCallback(
    (postId: number, text: string, username: string) => {
      const holdings = portfolio?.tokens.slice(0, 3).map((token) => token.symbol) || [];
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post;
          return {
            ...post,
            comments: [
              ...(post.comments || []),
              {
                author: username,
                text,
                holdings,
                votes: 0,
              },
            ],
          };
        })
      );
    },
    [portfolio]
  );

  // Vote comment
  const voteComment = useCallback((postId: number, commentIndex: number) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        const comments = [...(post.comments || [])];
        const comment = comments[commentIndex];
        if (!comment || comment.userVoted) return post;

        comments[commentIndex] = {
          ...comment,
          votes: (comment.votes || 0) + 1,
          userVoted: true,
        };
        return { ...post, comments };
      })
    );
  }, []);

  // Build candidate portfolio
  const buildCandidatePortfolio = useCallback((candidate: any): Portfolio => {
    const rawTokens = candidate.tokens || [];
    const tokens = rawTokens.map((token: any) => {
      const price = PRICE_MAP[token.symbol] || 0;
      const usdValue = token.usdValue ?? token.amount * price;
      return {
        symbol: token.symbol,
        amount: token.amount,
        usdValue,
      };
    });
    const computedTotal = tokens.reduce((sum: number, token: Token) => sum + (token.usdValue || 0), 0);
    const totalValue = candidate.total_value ?? computedTotal;
    return {
      tokens,
      total_value: totalValue,
      balance: tokens.find((token: Token) => token.symbol === 'SOL')?.amount || 0,
      nfts: candidate.nfts || [],
    };
  }, []);

  // Calculate match
  const calculateMatch = useCallback(
    (userPortfolio: Portfolio | null, candidatePortfolio: Portfolio) => {
      if (!userPortfolio) {
        return {
          score: 50,
          sharedTokens: [],
          sharedNfts: [],
          diamondHands: false,
        };
      }
      const userMap = new Map(userPortfolio.tokens.map((token) => [token.symbol, token]));
      const candidateMap = new Map(candidatePortfolio.tokens.map((token) => [token.symbol, token]));

      const sharedTokens: string[] = [];
      let sharedValue = 0;

      candidateMap.forEach((token, symbol) => {
        if (userMap.has(symbol)) {
          sharedTokens.push(symbol);
          sharedValue += Math.min(userMap.get(symbol)!.usdValue || 0, token.usdValue || 0);
        }
      });

      const baseScore = userPortfolio.total_value
        ? (sharedValue / userPortfolio.total_value) * 100
        : 0;

      const topUser = userPortfolio.tokens.slice(0, 3).map((token) => token.symbol);
      const topCandidate = candidatePortfolio.tokens.slice(0, 3).map((token) => token.symbol);
      const sharedTop = topUser.filter((token) => topCandidate.includes(token));

      const sharedNfts = (userPortfolio.nfts || []).filter((nft) =>
        (candidatePortfolio.nfts || []).includes(nft)
      );

      let score = baseScore + sharedTop.length * 5 + sharedNfts.length * 3;
      if (userMap.has('SOL') && candidateMap.has('SOL')) score += 5;
      score = Math.min(99, Math.max(1, Math.round(score)));

      return {
        score,
        sharedTokens,
        sharedNfts,
        diamondHands: sharedTop.length >= 2,
      };
    },
    []
  );

  // Generate matches
  type MatchGenerationOptions = {
    ignoreHistory?: boolean;
    preferredGender?: User['gender'];
  };

  const generateMatches = useCallback(
    (
      userPortfolio: Portfolio | null,
      extraCandidates: User[] = [],
      currentUser?: string,
      options?: MatchGenerationOptions
    ) => {
      const ignoreHistory = options?.ignoreHistory ?? false;
      const preferredGender = options?.preferredGender;
      const likesRaw = ignoreHistory ? null : localStorage.getItem(LIKE_KEY);
      const skipsRaw = ignoreHistory ? null : localStorage.getItem(SKIP_KEY);
      const likesMap: Record<string, string[]> = likesRaw ? JSON.parse(likesRaw) : {};
      const skipsMap: Record<string, string[]> = skipsRaw ? JSON.parse(skipsRaw) : {};
      const excluded = new Set<string>();
      if (currentUser) {
        if (!ignoreHistory) {
          (likesMap[currentUser] || []).forEach((addr) => excluded.add(addr));
          (skipsMap[currentUser] || []).forEach((addr) => excluded.add(addr));
        }
        excluded.add(currentUser);
      }
      const merged = [...CANDIDATES, ...extraCandidates];
      const seen = new Set<string>();
      const uniqueAll = merged.filter((candidate) => {
        if (seen.has(candidate.wallet_address)) return false;
        seen.add(candidate.wallet_address);
        return true;
      });
      let unique = uniqueAll.filter((candidate) => !excluded.has(candidate.wallet_address));
      if (!unique.length) {
        unique = [];
      }

      const verifiedSet = new Set(extraCandidates.map((candidate) => candidate.wallet_address));
      const toMatchCandidate = (candidate: User): MatchCandidate => {
        const candidatePortfolio = buildCandidatePortfolio(candidate);
        const match = calculateMatch(userPortfolio, candidatePortfolio);
        const fallbackImage = '';
        const verified = candidate.verified ?? verifiedSet.has(candidate.wallet_address);
        return {
          wallet_address: candidate.wallet_address,
          username: candidate.username,
          portfolio: candidatePortfolio,
          match,
          tokens: candidatePortfolio.tokens,
          nft_count: candidate.nfts?.length || 0,
          total_value: candidatePortfolio.total_value,
          hearts_sent: 0,
          hearts_received: 0,
          bio: candidate.bio || 'Open to new connections.',
          age: candidate.age || 24,
          distance: candidate.distance,
          image: candidate.image || candidate.photo || fallbackImage,
          gender: candidate.gender || 'female',
          instagram: candidate.instagram,
          xHandle: candidate.xHandle,
          verified,
        } as MatchCandidate;
      };

      const matches = unique.map(toMatchCandidate);
      const directoryMatches = uniqueAll.map(toMatchCandidate);

      const preferredCandidateGender =
        preferredGender === 'female' ? 'male' : preferredGender === 'male' ? 'female' : null;
      matches.sort((a, b) => {
        const aVerified = a.verified ? 0 : 1;
        const bVerified = b.verified ? 0 : 1;
        if (aVerified !== bVerified) return aVerified - bVerified;
        if (preferredCandidateGender) {
          const aTier = a.gender === preferredCandidateGender ? 0 : 1;
          const bTier = b.gender === preferredCandidateGender ? 0 : 1;
          if (aTier !== bTier) return aTier - bTier;
          if (preferredGender === 'female') {
            const aNet = a.total_value || a.portfolio.total_value || 0;
            const bNet = b.total_value || b.portfolio.total_value || 0;
            if (aNet !== bNet) return bNet - aNet;
          }
        }
        if (a.match.score !== b.match.score) return b.match.score - a.match.score;
        const aNet = a.total_value || a.portfolio.total_value || 0;
        const bNet = b.total_value || b.portfolio.total_value || 0;
        return bNet - aNet;
      });

      setMatches(matches);
      setMatchDirectory((prev) => {
        const next = { ...prev };
        directoryMatches.forEach((match) => {
          next[match.wallet_address] = match;
        });
        return next;
      });
      if (matches.length) {
        setMatchIndex(0);
      }
      return matches;
    },
    [buildCandidatePortfolio, calculateMatch]
  );

  // Send heart
  const sendHeart = useCallback(
    (match: MatchCandidate, senderAddress: string) => {
      const raw = localStorage.getItem(LIKE_KEY);
      const likes: Record<string, string[]> = raw ? JSON.parse(raw) : {};
      const senderLikes = new Set(likes[senderAddress] || []);
      senderLikes.add(match.wallet_address);
      likes[senderAddress] = Array.from(senderLikes);
      localStorage.setItem(LIKE_KEY, JSON.stringify(likes));

      setHearts((prev) => {
        const next = {
          ...prev,
          sent: { ...prev.sent, [match.wallet_address]: Date.now() },
          total: prev.total + 1,
        };
        return next;
      });
      updateTrends(match.match.sharedTokens);

      // Check for mutual match
      const isMutual = !!likes[match.wallet_address]?.includes(senderAddress);
      if (isMutual) {
        setHearts((prev) => ({
          ...prev,
          received: { ...prev.received, [match.wallet_address]: Date.now() },
        }));
      }
      return isMutual;
    },
    [updateTrends]
  );

  const recordSkip = useCallback((senderAddress: string, targetAddress: string) => {
    const raw = localStorage.getItem(SKIP_KEY);
    const skips: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const senderSkips = new Set(skips[senderAddress] || []);
    senderSkips.add(targetAddress);
    skips[senderAddress] = Array.from(senderSkips);
    localStorage.setItem(SKIP_KEY, JSON.stringify(skips));
  }, []);

  const removeMatch = useCallback((walletAddress: string) => {
    setMatches((prev) => {
      const idx = prev.findIndex((m) => m.wallet_address === walletAddress);
      if (idx === -1) return prev;
      const next = prev.filter((m) => m.wallet_address !== walletAddress);
      setMatchIndex((current) => {
        if (next.length === 0) return 0;
        if (current > idx) return current - 1;
        if (current === idx) return Math.min(idx, next.length - 1);
        return current;
      });
      return next;
    });
  }, []);

  const advanceMatch = useCallback(
    (walletAddress: string) => {
      removeMatch(walletAddress);
    },
    [removeMatch]
  );

  // Skip match
  const skipMatch = useCallback(() => {
    if (matches.length) {
      setMatchIndex((prev) => (prev + 1) % matches.length);
    }
  }, [matches.length]);

  // Save profile
  const saveProfile = useCallback(
    (userProfile: Partial<User>, walletAddress: string, options?: { closeModal?: boolean }) => {
      const tokens = portfolio?.tokens || [];
      const username =
        userProfile.username && userProfile.username.trim().length > 0
          ? userProfile.username
          : formatFallbackUsername(walletAddress);
      const fullProfile: User = {
        ...DEFAULT_PROFILE,
        ...userProfile,
        username,
        wallet_address: walletAddress,
        tokens,
        nft_count: portfolio?.nfts?.length || 0,
        total_value: portfolio?.total_value || 0,
      };
      const profiles = readProfiles();
      profiles[walletAddress] = fullProfile;
      writeProfiles(profiles);
      setProfile(fullProfile);
      if (options?.closeModal ?? true) {
        setIsProfileModalOpen(false);
      }
    },
    [portfolio]
  );

  const ensureProfileForWallet = useCallback(
    (walletAddress: string, defaults?: Partial<User>, options?: { closeModal?: boolean }) => {
      const profiles = readProfiles();
      const existing = profiles[walletAddress];
      if (existing) {
        setProfile(existing);
        return existing;
      }
      const tokens = portfolio?.tokens || [];
      const username =
        defaults?.username && defaults.username.trim().length > 0
          ? defaults.username
          : formatFallbackUsername(walletAddress);
      const fullProfile: User = {
        ...DEFAULT_PROFILE,
        ...defaults,
        username,
        wallet_address: walletAddress,
        tokens,
        nft_count: portfolio?.nfts?.length || 0,
        total_value: portfolio?.total_value || 0,
      };
      profiles[walletAddress] = fullProfile;
      writeProfiles(profiles);
      setProfile(fullProfile);
      if (options?.closeModal ?? true) {
        setIsProfileModalOpen(false);
      }
      return fullProfile;
    },
    [portfolio]
  );

  const loadProfileForWallet = useCallback((walletAddress: string) => {
    const profiles = readProfiles();
    const loaded = profiles[walletAddress];
    if (loaded) {
      setProfile(loaded);
      return loaded;
    }
    setProfile(null);
    return null;
  }, []);

  const getAllSavedProfiles = useCallback((): User[] => {
    const profiles = readProfiles();
    return Object.values(profiles);
  }, []);

  // Send message
  const sendMessage = useCallback(
    (receiver: string, content: string, senderAddress: string) => {
      const newMessage: Message = {
        id: crypto.randomUUID(),
        sender: senderAddress,
        receiver,
        content,
        timestamp: Date.now(),
        read: false,
      };
      setMessages((prev) => [...prev, newMessage]);
    },
    []
  );

  const markMessagesRead = useCallback((userAddress: string, otherAddress: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.receiver !== userAddress) return msg;
        if (msg.sender !== otherAddress) return msg;
        if (msg.read) return msg;
        return { ...msg, read: true };
      })
    );
  }, []);

  const boostWallet = useCallback((walletAddress: string) => {
    setBoostedWallets((prev) => {
      const next = new Set(prev);
      next.add(walletAddress);
      return next;
    });
  }, []);

  // Get conversations
  const getConversations = useCallback(
    (userAddress: string) => {
      const conversations = new Map<string, Message[]>();
      messages.forEach((msg) => {
        const other = msg.sender === userAddress ? msg.receiver : msg.sender;
        if (!conversations.has(other)) {
          conversations.set(other, []);
        }
        conversations.get(other)!.push(msg);
      });
      return conversations;
    },
    [messages]
  );

  const addNotification = useCallback((note: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications((prev) => [
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        read: false,
        ...note,
      },
      ...prev,
    ]);
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((note) => (note.id === id ? { ...note, read: true } : note))
    );
  }, []);

  const clearUserState = useCallback(() => {
    setProfile(null);
    setPortfolio(null);
    setScanPortfolio(null);
    setIsProfileModalOpen(false);
  }, []);

  const seedMessagesFor = useCallback(
    (receiverAddress: string) => {
      setMessages((prev) => {
        if (prev.length) return prev;
        const seeded = DEFAULT_INBOX_MESSAGES.map((item, idx) => ({
          id: crypto.randomUUID(),
          sender: item.sender,
          receiver: receiverAddress,
          content: item.content,
          timestamp: Date.now() - (idx + 1) * 3600000,
          read: false,
        }));
        return seeded;
      });
      setNotifications((prev) => {
        if (prev.length) return prev;
        return DEFAULT_NOTIFICATIONS;
      });
    },
    []
  );

  const syncHeartsFor = useCallback((walletAddress: string) => {
    const raw = localStorage.getItem(LIKE_KEY);
    const likes: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const received: Record<string, number> = {};
    Object.entries(likes).forEach(([sender, targets]) => {
      if (targets.includes(walletAddress)) {
        received[sender] = Date.now();
      }
    });
    const sent: Record<string, number> = {};
    (likes[walletAddress] || []).forEach((target) => {
      sent[target] = Date.now();
    });
    setHearts((prev) => ({
      ...prev,
      sent,
      received,
      total: Object.keys(sent).length,
    }));
  }, []);

  const ensureProfilePost = useCallback(
    (walletAddress: string, username: string, portfolio: Portfolio | null) => {
      setPosts((prev) => {
        const tokens =
          portfolio?.tokens?.slice(0, 3).map((token) => token.symbol) || ['ETH'];
        const existingIndex = prev.findIndex(
          (post) => post.wallet_address === walletAddress && post.type === 'profile'
        );
        if (existingIndex !== -1) {
          const existing = prev[existingIndex];
          const nextPost = {
            ...existing,
            author: username || existing.author,
            tokens,
          };
          const next = [...prev];
          next[existingIndex] = nextPost;
          return next;
        }
        const newPost: Post = {
          id: Date.now(),
          author: username || walletAddress.slice(0, 6),
          wallet_address: walletAddress,
          content: 'New profile just dropped. Let’s connect.',
          type: 'profile',
          tokens,
          vouch_count: 0,
          vent_count: 0,
          comments: [],
          timestamp: Date.now(),
        };
        return [newPost, ...prev];
      });
    },
    [portfolio]
  );

  const ensureMatchPost = useCallback((match: MatchCandidate) => {
    setPosts((prev) => {
      const exists = prev.some((post) => post.wallet_address === match.wallet_address);
      if (exists) return prev;
      const tokens = match.portfolio.tokens.slice(0, 3).map((t) => t.symbol);
      const newPost: Post = {
        id: Date.now(),
        author: match.username,
        wallet_address: match.wallet_address,
        content: match.bio || 'Open to new connections.',
        type: 'profile',
        tokens,
        vouch_count: 0,
        vent_count: 0,
        comments: [],
        timestamp: Date.now(),
      };
      return [newPost, ...prev];
    });
  }, []);

  return {
    view,
    setView,
    feedTab,
    setFeedTab,
    anonymous,
    setAnonymous,
    posts,
    profile,
    portfolio,
    scanPortfolio,
    setScanPortfolio,
    matches,
    matchDirectory,
    matchIndex,
    profilesVersion,
    hearts,
    trends,
    messages,
    isProfileModalOpen,
    setIsProfileModalOpen,
    notifications,
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
    removeMatch,
    skipMatch,
    saveProfile,
    ensureProfileForWallet,
    sendMessage,
    markMessagesRead,
    getConversations,
    seedMessagesFor,
    boostWallet,
    addNotification,
    markNotificationRead,
    clearUserState,
    ensureProfilePost,
    ensureMatchPost,
    syncHeartsFor,
    loadProfileForWallet,
    getAllSavedProfiles,
    setPortfolio,
  };
}

// Default posts
const DEFAULT_POSTS: Post[] = [
  {
    id: 1,
    author: '@ChainCharm',
    wallet_address: 'GkN2d7uYz3gT7Q3h6S2k1N8d9kX1m9e3tD2cY7g1s4mP',
    content: 'Looking for someone who understands that SOL is a love language.',
    type: 'story',
    tokens: ['SOL', 'JUP', 'BONK'],
    vouch_count: 234,
    vent_count: 12,
    comments: [
      { author: 'SolanaBae', text: 'Same energy. Let’s connect.', votes: 3 },
      { author: 'BonkBae', text: 'SOL + BONK is the move.', votes: 5 },
    ],
    timestamp: Date.now() - 3600000,
  },
  {
    id: 2,
    author: '@PythPearl',
    wallet_address: '8bZ4s6z6Q2m5W7V9o2s6Y8k5J9x1D4p8F7a6L3r2v9q',
    content: 'If you hold PYTH, we already have something in common. Slide in.',
    type: 'crush',
    tokens: ['PYTH', 'SOL', 'USDC'],
    vouch_count: 156,
    vent_count: 8,
    comments: [{ author: 'PythPearl', text: 'PYTH fam, unite.', votes: 2 }],
    timestamp: Date.now() - 7200000,
  },
  {
    id: 3,
    author: '@AlphaHunter',
    wallet_address: '7y5mH7k2W8a4t7L2p8q2K5V5m7Q3n9s9F7z2e7b3Q2u',
    content: 'BONK season is real. Also, coffee dates are on me.',
    type: 'alpha',
    tokens: ['BONK', 'SOL'],
    vouch_count: 88,
    vent_count: 5,
    comments: [],
    timestamp: Date.now() - 10800000,
  },
  {
    id: 4,
    author: '@BagHolder',
    wallet_address: '0x7a25c89d3f9e2b1c4d8e5a6f7b8c9d0e1f2a3b4',
    content: "Lost 50 ETH on $DOGE2. Never again. Looking for someone to hold my bags... and my hand. 💔",
    type: 'rug',
    tokens: ['ETH', 'BAYC', 'PEPE'],
    vouch_count: 234,
    vent_count: 12,
    comments: [],
    timestamp: Date.now() - 3600000,
  },
  {
    id: 5,
    author: '@StakeQueen',
    wallet_address: '0x2b8c4d6e8f0a1b3c5d7e9f1a2b4c6d8e0f2a4b6',
    content: "Just staked my entire net worth. If this goes to zero, at least I'm looking for a date first. 🎰",
    type: 'story',
    tokens: ['ETH', 'USDC', 'AAVE'],
    vouch_count: 156,
    vent_count: 8,
    comments: [],
    timestamp: Date.now() - 7200000,
  },
  {
    id: 6,
    author: '@DeFiSeed',
    wallet_address: '0x9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7',
    content: 'New to crypto, bought my first 0.05 ETH today! Who wants to teach me about DeFi? 🌱',
    type: 'story',
    tokens: ['ETH'],
    vouch_count: 89,
    vent_count: 3,
    comments: [],
    timestamp: Date.now() - 10800000,
  },
  {
    id: 7,
    author: '@RuggedRealist',
    wallet_address: '0x4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2',
    content: 'Got rugged 3 times this month. Starting to think the real treasure was the friends we made along the way. 🤡',
    type: 'rug',
    tokens: ['ETH', 'PEPE', 'SHIB'],
    vouch_count: 312,
    vent_count: 45,
    comments: [],
    timestamp: Date.now() - 14400000,
  },
  {
    id: 8,
    author: '@DiamondPulse',
    wallet_address: '0x1a3c5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9',
    content: "Looking for a crypto partner who understands that 'diamond hands' applies to relationships too. 💎🙌",
    type: 'story',
    tokens: ['PEPE'],
    vouch_count: 67,
    vent_count: 5,
    comments: [],
    timestamp: Date.now() - 18000000,
  },
  {
    id: 9,
    author: '@LayerTwo',
    wallet_address: '0x5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3',
    content: "ALPHA: New L2 launching next week. DYOR but I'm aping in. NFA. 🚀",
    type: 'alpha',
    tokens: ['ETH', 'MATIC', 'ARB'],
    vouch_count: 445,
    vent_count: 23,
    comments: [],
    timestamp: Date.now() - 21600000,
  },
  {
    id: 10,
    author: '@CookerFlips',
    wallet_address: '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6',
    content: 'If you survived 2022 and still believe in ETH, we already trauma bonded.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 512,
    vent_count: 11,
    comments: [{ author: 'Zyaf', text: 'That bear market built character.', votes: 9 }],
    timestamp: Date.now() - 2500000,
  },
  {
    id: 11,
    author: '@traderpow',
    wallet_address: '8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd',
    content: 'Looking for a man who treats me like a low cap before Binance listing.',
    type: 'crush',
    tokens: ['ETH', 'ARB'],
    vouch_count: 388,
    vent_count: 7,
    comments: [],
    timestamp: Date.now() - 3000000,
  },
  {
    id: 12,
    author: '@ohbrox',
    wallet_address: '7VBTpiiEjkwRbRGHJFUz6o5fWuhPFtAmy8JGhNqwHNnn',
    content: 'Compatibility 54%? That’s still higher than most token launches.',
    type: 'alpha',
    tokens: ['ETH', 'SOL'],
    vouch_count: 276,
    vent_count: 4,
    comments: [{ author: 'Cooker', text: '54% is premium now.', votes: 3 }],
    timestamp: Date.now() - 3400000,
  },
  {
    id: 13,
    author: '@TobxG',
    wallet_address: 'HmBmSYwYEgEZuBUYuDs9xofyqBAkw4ywugB1d7R7sTGh',
    content: 'I don’t chase men. I chase narratives. If you’re both, DM me.',
    type: 'story',
    tokens: ['ETH', 'AAVE'],
    vouch_count: 421,
    vent_count: 6,
    comments: [],
    timestamp: Date.now() - 4200000,
  },
  {
    id: 14,
    author: '@igndex',
    wallet_address: 'mW4PZB45isHmnjGkLpJvjKBzVS5NXzTJ8UDyug4gTsM',
    content: 'If your love language isn’t “buying the dip,” we won’t work.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 504,
    vent_count: 12,
    comments: [],
    timestamp: Date.now() - 4800000,
  },
  {
    id: 15,
    author: '@Ga__ke',
    wallet_address: 'DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm',
    content: 'He has $28.8K net worth. I have conviction. Let’s build generational wealth.',
    type: 'crush',
    tokens: ['ETH', 'USDC', 'AAVE'],
    vouch_count: 612,
    vent_count: 18,
    comments: [{ author: 'NachSOL', text: 'Conviction > valuation.', votes: 6 }],
    timestamp: Date.now() - 5200000,
  },
  {
    id: 16,
    author: '@NachSOL',
    wallet_address: 'ATKi3ZvMbo31pbgBgGSGQPDPKEbQ4oGzoDrwG2sms56k',
    content: 'Green candles turn me on more than compliments.',
    type: 'story',
    tokens: ['SOL', 'USDC'],
    vouch_count: 330,
    vent_count: 5,
    comments: [],
    timestamp: Date.now() - 5600000,
  },
  {
    id: 17,
    author: '@BastilleBtc',
    wallet_address: '3kebnKw7cPdSkLRfiMEALyZJGZ4wdiSRvmoN4rD1yPzV',
    content: 'Shared holdings: ETH. Shared future: TBD.',
    type: 'story',
    tokens: ['ETH'],
    vouch_count: 298,
    vent_count: 3,
    comments: [],
    timestamp: Date.now() - 6000000,
  },
  {
    id: 18,
    author: '@blknoiz06',
    wallet_address: 'AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm',
    content: 'If you can read charts and read emotions, you’re dangerous.',
    type: 'alpha',
    tokens: ['ETH', 'ARB'],
    vouch_count: 845,
    vent_count: 21,
    comments: [{ author: 'OGAntD', text: 'Dangerous and profitable.', votes: 8 }],
    timestamp: Date.now() - 6400000,
  },
  {
    id: 19,
    author: '@0GAntD',
    wallet_address: '215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP',
    content: 'I date like I invest: • Early • High risk • High reward',
    type: 'story',
    tokens: ['ETH', 'MATIC'],
    vouch_count: 410,
    vent_count: 9,
    comments: [],
    timestamp: Date.now() - 6800000,
  },
  {
    id: 20,
    author: '@ChartFuMonkey',
    wallet_address: '7i7vHEv87bs135DuoJVKe9c7abentawA5ydfWcWc8iY2',
    content: 'I don’t need flowers. Send liquidity.',
    type: 'crush',
    tokens: ['USDC', 'ETH'],
    vouch_count: 512,
    vent_count: 14,
    comments: [],
    timestamp: Date.now() - 7200000,
  },
  {
    id: 21,
    author: '@0xZyaf',
    wallet_address: 'F5TjPySiUJMdvqMZHnPP85Rc1vErDGV5FR5P2vdVm429',
    content: 'Real question: Are we building long-term value or just farming short-term attention?',
    type: 'story',
    tokens: ['ETH', 'AAVE'],
    vouch_count: 620,
    vent_count: 17,
    comments: [],
    timestamp: Date.now() - 7600000,
  },
  {
    id: 22,
    author: '@ShockedJS',
    wallet_address: '6m5sW6EAPAHncxnzapi1ZVJNRb9RZHQ3Bj7FD84X9rAF',
    content: 'I want a partner who understands: Stablecoins are safe. People aren’t.',
    type: 'story',
    tokens: ['USDC', 'ETH'],
    vouch_count: 488,
    vent_count: 10,
    comments: [],
    timestamp: Date.now() - 8000000,
  },
  {
    id: 23,
    author: '@gorillacapsol',
    wallet_address: 'DpNVrtA3ERfKzX4F8Pi2CVykdJJjoNxyY5QgoytAwD26',
    content: 'If you survived FTX, we can survive anything.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 732,
    vent_count: 22,
    comments: [],
    timestamp: Date.now() - 8400000,
  },
  {
    id: 24,
    author: '@insentos',
    wallet_address: '7SDs3PjT2mswKQ7Zo4FTucn9gJdtuW4jaacPA65BseHS',
    content: 'Looking for someone who holds through volatility — markets and emotions.',
    type: 'story',
    tokens: ['ETH', 'SOL'],
    vouch_count: 404,
    vent_count: 8,
    comments: [],
    timestamp: Date.now() - 8800000,
  },
  {
    id: 25,
    author: '@runitbackghost',
    wallet_address: 'ApRnQN2HkbCn7W2WWiT2FEKvuKJp9LugRyAE1a9Hdz1',
    content: 'Are you staking or just flirting?',
    type: 'alpha',
    tokens: ['SOL', 'JTO'],
    vouch_count: 286,
    vent_count: 4,
    comments: [],
    timestamp: Date.now() - 9200000,
  },
  {
    id: 26,
    author: '@quarsays',
    wallet_address: '9AqzsYXj1M2z8shG6resmM7LNM6GdvsjcjhjRUPc1dNf',
    content: 'Let’s merge wallets before we merge feelings.',
    type: 'crush',
    tokens: ['ETH', 'USDC'],
    vouch_count: 360,
    vent_count: 6,
    comments: [],
    timestamp: Date.now() - 9600000,
  },
  {
    id: 27,
    author: '@LevisNFT',
    wallet_address: 'GwoFJFjUTUSWq2EwTz4P2Sznoq9XYLrf8t4q5kbTgZ1R',
    content: 'I like my men how I like my tokens:',
    type: 'story',
    tokens: ['ETH'],
    vouch_count: 298,
    vent_count: 5,
    comments: [],
    timestamp: Date.now() - 10000000,
  },
  {
    id: 28,
    author: '@dukezfn',
    wallet_address: 'DeVjHYTEZEi7Wvcvfjz8KZMzpuZpijABgutSfXn1BxjX',
    content: 'If you rug me, at least do it creatively.',
    type: 'rug',
    tokens: ['PEPE', 'ETH'],
    vouch_count: 512,
    vent_count: 19,
    comments: [],
    timestamp: Date.now() - 10400000,
  },
  {
    id: 29,
    author: '@Lowskii_gg',
    wallet_address: '41uh7g1DxYaYXdtjBiYCHcgBniV9Wx57b7HU7RXmx1Gg',
    content: 'Charts during the day. Chaos at night.',
    type: 'story',
    tokens: ['ETH', 'MATIC'],
    vouch_count: 402,
    vent_count: 9,
    comments: [],
    timestamp: Date.now() - 10800000,
  },
  {
    id: 30,
    author: '@10piecedawg',
    wallet_address: 'c3XGUoDSBaJDA8qaJ5pUkCnamMERwZLJBVjxdkNepGo',
    content: 'Drop your biggest bag below. I’ll judge compatibility accordingly.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 589,
    vent_count: 15,
    comments: [],
    timestamp: Date.now() - 11200000,
  },
  {
    id: 31,
    author: '@henn100x',
    wallet_address: 'FRbUNvGxYNC1eFngpn7AD3f14aKKTJVC6zSMtvj2dyCS',
    content: 'Red flag in crypto dating? I’ll start: “I only trade memecoins.”',
    type: 'rug',
    tokens: ['PEPE', 'SHIB'],
    vouch_count: 620,
    vent_count: 20,
    comments: [],
    timestamp: Date.now() - 11600000,
  },
  {
    id: 32,
    author: '@daumeneth',
    wallet_address: '8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5',
    content: 'Would you rather: A) 10x portfolio B) 10/10 soulmate Be honest.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 710,
    vent_count: 28,
    comments: [],
    timestamp: Date.now() - 12000000,
  },
  {
    id: 33,
    author: '@ferbsol',
    wallet_address: 'm7Kaas3Kd8FHLnCioSjCoSuVDReZ6FDNBVM6HTNYuF7',
    content: 'If your ex sold BTC at $3K, that’s emotional damage.',
    type: 'story',
    tokens: ['BTC', 'USDC'],
    vouch_count: 498,
    vent_count: 13,
    comments: [],
    timestamp: Date.now() - 12400000,
  },
  {
    id: 34,
    author: '@BitBoyJay',
    wallet_address: 'HwRnKq7RPtKHvX9wyHsc1zvfHtGjPQa5tyZtGtbvfXE',
    content: 'Convince me why we should be more than a 54% match.',
    type: 'crush',
    tokens: ['ETH', 'SOL'],
    vouch_count: 402,
    vent_count: 12,
    comments: [],
    timestamp: Date.now() - 12800000,
  },
  {
    id: 35,
    author: '@LunaVibe',
    wallet_address: '4s9qT2m8V6p1N7c3L5x2K9r4B6d1Q8w3M7v2Y5t1S9a',
    content: 'I don’t chase men. I chase narratives. If you’re both, DM me.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 312,
    vent_count: 6,
    comments: [{ author: 'NovaBelle', text: 'Narratives and patience. Same.', votes: 4 }],
    timestamp: Date.now() - 5200000,
  },
  {
    id: 36,
    author: '@NovaBelle',
    wallet_address: '5q2L9m7V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A7d',
    content: 'If you can read charts and read emotions, you’re dangerous.',
    type: 'story',
    tokens: ['ETH', 'SOL'],
    vouch_count: 402,
    vent_count: 9,
    comments: [{ author: 'ScarletPulse', text: 'Dangerous is the vibe.', votes: 5 }],
    timestamp: Date.now() - 6100000,
  },
  {
    id: 37,
    author: '@ScarletPulse',
    wallet_address: '9n1Q6v3M8b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8e',
    content: 'He has $28.8K net worth. I have conviction. Let’s build generational wealth.',
    type: 'crush',
    tokens: ['ETH', 'USDC', 'ARB'],
    vouch_count: 530,
    vent_count: 14,
    comments: [{ author: 'AriaBloom', text: 'Conviction beats flex.', votes: 6 }],
    timestamp: Date.now() - 7200000,
  },
  {
    id: 38,
    author: '@AriaBloom',
    wallet_address: '3c7V2m9Q1x4B8r6N5t2K9w3L7p1S6y4A8v2M5n1D9h',
    content: 'Shared holdings: ETH. Shared future: TBD.',
    type: 'story',
    tokens: ['ETH'],
    vouch_count: 280,
    vent_count: 5,
    comments: [],
    timestamp: Date.now() - 8000000,
  },
  {
    id: 39,
    author: '@VelvetByte',
    wallet_address: '2m9Q8v4W7t6Y1r5L3k2P8n6b7C1x9q5A4v6M8z7s2t',
    content: 'Green candles turn me on more than compliments.',
    type: 'story',
    tokens: ['BONK', 'WIF'],
    vouch_count: 360,
    vent_count: 8,
    comments: [],
    timestamp: Date.now() - 8800000,
  },
  {
    id: 40,
    author: '@MilaStorm',
    wallet_address: '7p3Q6v9M1b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8f',
    content: 'If your love language isn’t “buying the dip,” we won’t work.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 420,
    vent_count: 7,
    comments: [{ author: 'SiennaRay', text: 'Dip buyers are a different breed.', votes: 3 }],
    timestamp: Date.now() - 9100000,
  },
  {
    id: 41,
    author: '@SiennaRay',
    wallet_address: '2k8L5m9V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A7e',
    content: 'Real question: Are we building long-term value or just farming short-term attention?',
    type: 'story',
    tokens: ['ETH', 'SOL'],
    vouch_count: 388,
    vent_count: 6,
    comments: [],
    timestamp: Date.now() - 9500000,
  },
  {
    id: 42,
    author: '@VeraLuxe',
    wallet_address: '8m2Q6v3M9b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8g',
    content: 'If you survived FTX, we can survive anything.',
    type: 'story',
    tokens: ['ETH', 'USDC'],
    vouch_count: 540,
    vent_count: 12,
    comments: [],
    timestamp: Date.now() - 9800000,
  },
];

// Mock candidates
const CANDIDATES = [
  {
    wallet_address: '8bZ4s6z6Q2m5W7V9o2s6Y8k5J9x1D4p8F7a6L3r2v9q',
    username: 'Satoshi Lover',
    age: 24,
    distance: '2 miles away',
    bio: 'Looking for someone who understands that SOL is a love language. Holding for the long term, both in crypto and in life.',
    gender: 'female',
    instagram: 'satoshi.love',
    xHandle: 'satoshilover',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'SOL', amount: 42.5 },
      { symbol: 'BONK', amount: 1200000 },
      { symbol: 'JUP', amount: 550 },
    ],
    nfts: ['madlad-1', 'madlad-2'],
  },
  {
    wallet_address: 'AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm',
    username: 'Ansem',
    age: 30,
    distance: '6 miles away',
    bio: 'Long-term thesis, short-term chemistry.',
    gender: 'male',
    instagram: 'ansem.sol',
    xHandle: 'blknoiz06',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 80 },
      { symbol: 'SOL', amount: 140 },
      { symbol: 'USDC', amount: 120000 },
    ],
    total_value: 1500000,
    nfts: ['degods-1'],
  },
  {
    wallet_address: '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6',
    username: 'Cooker',
    age: 29,
    distance: '5 miles away',
    bio: 'Alpha hunter with a long horizon.',
    gender: 'male',
    instagram: 'cooker.flips',
    xHandle: 'CookerFlips',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 35 },
      { symbol: 'SOL', amount: 60 },
      { symbol: 'USDC', amount: 40000 },
    ],
    total_value: 420000,
    nfts: ['madlad-44'],
  },
  {
    wallet_address: 'DpNVrtA3ERfKzX4F8Pi2CVykdJJjoNxyY5QgoytAwD26',
    username: 'Gorilla Capital',
    age: 33,
    distance: '8 miles away',
    bio: 'Capital first, feelings second.',
    gender: 'male',
    instagram: 'gorillacap',
    xHandle: 'gorillacapsol',
    image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 48 },
      { symbol: 'USDC', amount: 95000 },
      { symbol: 'ARB', amount: 15000 },
    ],
    total_value: 840000,
    nfts: ['doodle-29'],
  },
  {
    wallet_address: '215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP',
    username: 'OGAntD',
    age: 31,
    distance: '6 miles away',
    bio: 'If it’s not conviction, it’s not worth it.',
    gender: 'male',
    instagram: 'ogantd',
    xHandle: '0GAntD',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 40 },
      { symbol: 'MATIC', amount: 12000 },
      { symbol: 'USDC', amount: 50000 },
    ],
    total_value: 470000,
    nfts: ['azuki-33'],
  },
  {
    wallet_address: '3FDci33mzMKNdNxzSS9D13XyNZQAdfmpvtDZLWPbZiAU',
    username: 'Sachs',
    age: 34,
    distance: '9 miles away',
    bio: 'Big bags, bigger patience.',
    gender: 'male',
    instagram: 'gudmansachs',
    xHandle: 'gudmansachs',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 50 },
      { symbol: 'BTC', amount: 3 },
      { symbol: 'USDC', amount: 70000 },
    ],
    total_value: 520000,
    nfts: ['bayc-18'],
  },
  {
    wallet_address: 'F5TjPySiUJMdvqMZHnPP85Rc1vErDGV5FR5P2vdVm429',
    username: 'Zyaf',
    age: 28,
    distance: '4 miles away',
    bio: 'Conviction and patience. Let’s build.',
    gender: 'male',
    instagram: 'zyaf.eth',
    xHandle: '0xZyaf',
    image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 55 },
      { symbol: 'ARB', amount: 18000 },
      { symbol: 'USDC', amount: 90000 },
    ],
    total_value: 730000,
    nfts: ['azuki-21'],
  },
  {
    wallet_address: 'ATKi3ZvMbo31pbgBgGSGQPDPKEbQ4oGzoDrwG2sms56k',
    username: 'Nach',
    age: 31,
    distance: '7 miles away',
    bio: 'Trader by day, romantic by night.',
    gender: 'male',
    instagram: 'nach.sol',
    xHandle: 'NachSOL',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 42 },
      { symbol: 'SOL', amount: 120 },
      { symbol: 'USDC', amount: 60000 },
    ],
    total_value: 610000,
    nfts: ['madlad-33'],
  },
  {
    wallet_address: '3kebnKw7cPdSkLRfiMEALyZJGZ4wdiSRvmoN4rD1yPzV',
    username: 'Bastille',
    age: 29,
    distance: '5 miles away',
    bio: 'Highest net worth isn’t my only flex.',
    gender: 'male',
    instagram: 'bastille.btc',
    xHandle: 'BastilleBtc',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 90 },
      { symbol: 'BTC', amount: 5 },
      { symbol: 'USDC', amount: 150000 },
    ],
    total_value: 900000,
    nfts: ['bayc-12'],
  },
  {
    wallet_address: 'GkN2d7uYz3gT7Q3h6S2k1N8d9kX1m9e3tD2cY7g1s4mP',
    username: 'AlphaHunter',
    age: 27,
    distance: '5 miles away',
    bio: 'DeFi first, dates second. If you love yield, let’s talk.',
    gender: 'male',
    instagram: 'alpha.hunter',
    xHandle: 'AlphaHunter',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=2574&auto=format&fit=crop',
    tokens: [
      { symbol: 'SOL', amount: 16.2 },
      { symbol: 'PYTH', amount: 1800 },
      { symbol: 'USDC', amount: 2200 },
    ],
    nfts: ['space-ape-1'],
  },
  {
    wallet_address: '7y5mH7k2W8a4t7L2p8q2K5V5m7Q3n9s9F7z2e7b3Q2u',
    username: 'PythPearl',
    age: 23,
    distance: '1 mile away',
    bio: 'Numbers, charts, and sunsets. PYTH is my love language.',
    gender: 'female',
    instagram: 'pythpearl',
    xHandle: 'PythPearl',
    image: 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'PYTH', amount: 3200 },
      { symbol: 'SOL', amount: 9.8 },
      { symbol: 'JUP', amount: 900 },
    ],
    nfts: ['mythic-1', 'mythic-2', 'mythic-3'],
  },
  {
    wallet_address: 'F3b2n6a9Q7w5v4K2t8J1m3p7z6R5x2c9v8B4n1m7Q2p',
    username: 'EtherMuse',
    age: 26,
    distance: '3 miles away',
    bio: 'Spreadsheets by day, sunsets by night. Looking for soft DeFi energy.',
    gender: 'female',
    instagram: 'ether.muse',
    xHandle: 'ethermuse',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 4.2 },
      { symbol: 'USDC', amount: 3200 },
      { symbol: 'AAVE', amount: 120 },
    ],
    nfts: ['azuki-1'],
  },
  {
    wallet_address: '9xV7p2A6h5L3k8M1q4T6z7R8b5C2n1m4P9v7Q2x6a3s',
    username: 'DegenDuke',
    age: 29,
    distance: '7 miles away',
    bio: 'I like charts, risk, and good espresso. Here for real connections.',
    gender: 'male',
    instagram: 'degenduke',
    xHandle: 'DegenDuke',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 7.9 },
      { symbol: 'ARB', amount: 1400 },
      { symbol: 'MATIC', amount: 2200 },
    ],
    nfts: ['doodle-1'],
  },
  {
    wallet_address: '2m9Q8v4W7t6Y1r5L3k2P8n6b7C1x9q5A4v6M8z7s2t',
    username: 'VelvetByte',
    age: 22,
    distance: '4 miles away',
    bio: 'Meme coins and moonlight walks. Bonus points for good playlists.',
    gender: 'female',
    instagram: 'velvet.byte',
    xHandle: 'VelvetByte',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'BONK', amount: 2500000 },
      { symbol: 'WIF', amount: 420 },
      { symbol: 'SHIB', amount: 1200000 },
    ],
    nfts: ['madlad-7'],
  },
  {
    wallet_address: '6p9M2v7N4x1Q8c5T3r6L9b2A7m5K1z4V8w2J6p7Y3n',
    username: 'MoonshotMax',
    age: 28,
    distance: '6 miles away',
    bio: 'Builder mindset. Looking for someone who loves both gains and growth.',
    gender: 'male',
    instagram: 'moonshot.max',
    xHandle: 'MoonshotMax',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'SOL', amount: 28 },
      { symbol: 'JTO', amount: 240 },
      { symbol: 'USDC', amount: 900 },
    ],
    nfts: ['tensor-1'],
  },
  {
    wallet_address: '4s9qT2m8V6p1N7c3L5x2K9r4B6d1Q8w3M7v2Y5t1S9a',
    username: 'LunaVibe',
    age: 25,
    distance: '2 miles away',
    bio: 'Golden hour walks and clean charts. I trade with patience.',
    gender: 'female',
    instagram: 'luna.vibe',
    xHandle: 'LunaVibe',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 3.1 },
      { symbol: 'USDC', amount: 1800 },
      { symbol: 'AAVE', amount: 65 },
    ],
    nfts: ['azuki-9'],
  },
  {
    wallet_address: '5q2L9m7V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A7d',
    username: 'NovaBelle',
    age: 24,
    distance: '3 miles away',
    bio: 'Soft spots for strong conviction and good playlists.',
    gender: 'female',
    instagram: 'nova.belle',
    xHandle: 'NovaBelle',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 2.4 },
      { symbol: 'SOL', amount: 15 },
      { symbol: 'USDC', amount: 900 },
    ],
    nfts: ['madlad-12'],
  },
  {
    wallet_address: '9n1Q6v3M8b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8e',
    username: 'ScarletPulse',
    age: 27,
    distance: '4 miles away',
    bio: 'If you bring honesty, I bring alpha.',
    gender: 'female',
    instagram: 'scarlet.pulse',
    xHandle: 'ScarletPulse',
    image: 'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 5.2 },
      { symbol: 'ARB', amount: 900 },
      { symbol: 'USDC', amount: 1200 },
    ],
    nfts: ['doodle-3'],
  },
  {
    wallet_address: '3c7V2m9Q1x4B8r6N5t2K9w3L7p1S6y4A8v2M5n1D9h',
    username: 'AriaBloom',
    age: 23,
    distance: '2 miles away',
    bio: 'I like smart bets and soft edges.',
    gender: 'female',
    instagram: 'aria.bloom',
    xHandle: 'AriaBloom',
    image: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 1.9 },
      { symbol: 'USDC', amount: 1400 },
      { symbol: 'PEPE', amount: 1200000 },
    ],
    nfts: ['mythic-9'],
  },
  {
    wallet_address: '7p3Q6v9M1b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8f',
    username: 'MilaStorm',
    age: 26,
    distance: '3 miles away',
    bio: 'High volatility, higher standards.',
    gender: 'female',
    instagram: 'mila.storm',
    xHandle: 'MilaStorm',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 4.4 },
      { symbol: 'USDC', amount: 2100 },
      { symbol: 'ARB', amount: 750 },
    ],
    nfts: ['azuki-11'],
  },
  {
    wallet_address: '2k8L5m9V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A7e',
    username: 'SiennaRay',
    age: 24,
    distance: '4 miles away',
    bio: 'Proof-of-work in love and life.',
    gender: 'female',
    instagram: 'sienna.ray',
    xHandle: 'SiennaRay',
    image: 'https://images.unsplash.com/photo-1499952127939-9bbf5af6c51c?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 2.9 },
      { symbol: 'SOL', amount: 12 },
      { symbol: 'USDC', amount: 1100 },
    ],
    nfts: ['madlad-19'],
  },
  {
    wallet_address: '8m2Q6v3M9b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8g',
    username: 'VeraLuxe',
    age: 28,
    distance: '5 miles away',
    bio: 'Long-term mindset. Short-term flirting.',
    gender: 'female',
    instagram: 'vera.luxe',
    xHandle: 'VeraLuxe',
    image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 6.1 },
      { symbol: 'USDC', amount: 2600 },
      { symbol: 'AAVE', amount: 90 },
    ],
    nfts: ['doodle-7'],
  },
  {
    wallet_address: '9v3Q2m8L1p7T5x4C6r9N2b1K3w8M5s7Q1v4Y6t2A8h',
    username: 'SableRose',
    age: 24,
    distance: '2 miles away',
    bio: 'Soft energy, strong conviction. Tell me your favorite narrative.',
    gender: 'female',
    instagram: 'sable.rose',
    xHandle: 'SableRose',
    image: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 2.7 },
      { symbol: 'USDC', amount: 1400 },
      { symbol: 'ARB', amount: 600 },
    ],
    nfts: ['azuki-14'],
  },
  {
    wallet_address: '2x7M4v9Q1b5C8r6N3t2K9w4L7p1S6y3A8v2M5n1D9k',
    username: 'IvySkye',
    age: 23,
    distance: '3 miles away',
    bio: 'Candle closes and city nights. Looking for a steady hand.',
    gender: 'female',
    instagram: 'ivy.skye',
    xHandle: 'IvySkye',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 1.6 },
      { symbol: 'SOL', amount: 11 },
      { symbol: 'USDC', amount: 800 },
    ],
    nfts: ['madlad-21'],
  },
  {
    wallet_address: '6p2Q9m7V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A7f',
    username: 'LuxeNora',
    age: 26,
    distance: '4 miles away',
    bio: 'I like clear signals and clean charts.',
    gender: 'female',
    instagram: 'luxe.nora',
    xHandle: 'LuxeNora',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 3.4 },
      { symbol: 'USDC', amount: 1600 },
      { symbol: 'AAVE', amount: 45 },
    ],
    nfts: ['doodle-11'],
  },
  {
    wallet_address: '3m8Q2v6N9b1C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8j',
    username: 'NovaMuse',
    age: 25,
    distance: '2 miles away',
    bio: 'Low noise, high quality. Let’s see if we match.',
    gender: 'female',
    instagram: 'nova.muse',
    xHandle: 'NovaMuse',
    image: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 2.1 },
      { symbol: 'USDC', amount: 1200 },
      { symbol: 'ARB', amount: 520 },
    ],
    nfts: ['azuki-16'],
  },
  {
    wallet_address: '7q1M9v3Q2b5C8r6N4t2K9w3L7p1S6y4A8v2M5n1D9p',
    username: 'RheaVale',
    age: 27,
    distance: '5 miles away',
    bio: 'Patient in markets, intentional in life.',
    gender: 'female',
    instagram: 'rhea.vale',
    xHandle: 'RheaVale',
    image: 'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 4.6 },
      { symbol: 'USDC', amount: 1900 },
      { symbol: 'SOL', amount: 7 },
    ],
    nfts: ['mythic-12'],
  },
  {
    wallet_address: '4p6Q2m9V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A7h',
    username: 'AvaNoir',
    age: 24,
    distance: '2 miles away',
    bio: 'Soft voice, sharp thesis.',
    gender: 'female',
    instagram: 'ava.noir',
    xHandle: 'AvaNoir',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 1.8 },
      { symbol: 'USDC', amount: 1000 },
      { symbol: 'SOL', amount: 10 },
    ],
    nfts: ['azuki-19'],
  },
  {
    wallet_address: '6k1Q8v3M9b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8q',
    username: 'KiraLuxe',
    age: 25,
    distance: '3 miles away',
    bio: 'Risk-aware, romance-forward.',
    gender: 'female',
    instagram: 'kira.luxe',
    xHandle: 'KiraLuxe',
    image: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 2.2 },
      { symbol: 'USDC', amount: 1300 },
      { symbol: 'ARB', amount: 500 },
    ],
    nfts: ['madlad-27'],
  },
  {
    wallet_address: '9m2Q6v3M9b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8r',
    username: 'ZaraBloom',
    age: 23,
    distance: '4 miles away',
    bio: 'Chasing clean entries and clean energy.',
    gender: 'female',
    instagram: 'zara.bloom',
    xHandle: 'ZaraBloom',
    image: 'https://images.unsplash.com/photo-1500917293891-ef795e70e1f6?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 1.4 },
      { symbol: 'USDC', amount: 900 },
      { symbol: 'SOL', amount: 8 },
    ],
    nfts: ['doodle-13'],
  },
  {
    wallet_address: '2n8Q5v9M1b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8s',
    username: 'MilaVoss',
    age: 26,
    distance: '5 miles away',
    bio: 'If you can read charts and feelings, say hi.',
    gender: 'female',
    instagram: 'mila.voss',
    xHandle: 'MilaVoss',
    image: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?q=80&w=2560&auto=format&fit=crop',
    tokens: [
      { symbol: 'ETH', amount: 3.1 },
      { symbol: 'USDC', amount: 1500 },
      { symbol: 'AAVE', amount: 40 },
    ],
    nfts: ['azuki-24'],
  },
  {
    wallet_address: '5t2Q9v7M1b3C6r8T4x2L9k3P6s2W8y5A7v4G2m1Z8u',
    username: 'AtlasGray',
    age: 32,
    distance: '7 miles away',
    bio: 'Quiet confidence, long-term conviction.',
    gender: 'male',
    instagram: 'atlas.gray',
    xHandle: 'AtlasGray',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,man&sig=101',
    tokens: [
      { symbol: 'BTC', amount: 2.4 },
      { symbol: 'ETH', amount: 36 },
      { symbol: 'USDC', amount: 82000 },
    ],
    total_value: 860000,
    nfts: ['bayc-31'],
  },
  {
    wallet_address: '8r1Q6v3M9b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8v',
    username: 'KaneRivers',
    age: 30,
    distance: '5 miles away',
    bio: 'Low drama, high ROI.',
    gender: 'male',
    instagram: 'kane.rivers',
    xHandle: 'KaneRivers',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,man&sig=102',
    tokens: [
      { symbol: 'SOL', amount: 210 },
      { symbol: 'ETH', amount: 18 },
      { symbol: 'USDC', amount: 54000 },
    ],
    total_value: 520000,
    nfts: ['madlad-52'],
  },
  {
    wallet_address: '3p8Q2v6N9b1C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8w',
    username: 'EliStone',
    age: 29,
    distance: '4 miles away',
    bio: 'Precision entries, intentional dates.',
    gender: 'male',
    instagram: 'eli.stone',
    xHandle: 'EliStone',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,man&sig=103',
    tokens: [
      { symbol: 'ETH', amount: 28 },
      { symbol: 'ARB', amount: 22000 },
      { symbol: 'USDC', amount: 65000 },
    ],
    total_value: 580000,
    nfts: ['azuki-38'],
  },
  {
    wallet_address: '4k1Q8v3M9b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8y',
    username: 'IrisVale',
    age: 25,
    distance: '2 miles away',
    bio: 'Soft edge, strong thesis.',
    gender: 'female',
    instagram: 'iris.vale',
    xHandle: 'IrisVale',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=104',
    tokens: [
      { symbol: 'ETH', amount: 2.5 },
      { symbol: 'USDC', amount: 1300 },
      { symbol: 'SOL', amount: 12 },
    ],
    nfts: ['doodle-18'],
  },
  {
    wallet_address: '6p2Q9m7V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A7z',
    username: 'TaliaMoon',
    age: 24,
    distance: '3 miles away',
    bio: 'Golden hour walks and clean charts.',
    gender: 'female',
    instagram: 'talia.moon',
    xHandle: 'TaliaMoon',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=105',
    tokens: [
      { symbol: 'ETH', amount: 1.7 },
      { symbol: 'USDC', amount: 900 },
      { symbol: 'ARB', amount: 420 },
    ],
    nfts: ['azuki-44'],
  },
  {
    wallet_address: '2h8Q5v9M1b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z8z',
    username: 'CelesteAri',
    age: 26,
    distance: '4 miles away',
    bio: 'High signal, low noise.',
    gender: 'female',
    instagram: 'celeste.ari',
    xHandle: 'CelesteAri',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=106',
    tokens: [
      { symbol: 'ETH', amount: 2.9 },
      { symbol: 'USDC', amount: 1700 },
      { symbol: 'SOL', amount: 9 },
    ],
    nfts: ['madlad-31'],
  },
  {
    wallet_address: '7s1M9v3Q2b5C8r6N4t2K9w3L7p1S6y4A8v2M5n1D9t',
    username: 'NoaLuxe',
    age: 25,
    distance: '5 miles away',
    bio: 'Patient in markets, direct in love.',
    gender: 'female',
    instagram: 'noa.luxe',
    xHandle: 'NoaLuxe',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=107',
    tokens: [
      { symbol: 'ETH', amount: 2.2 },
      { symbol: 'USDC', amount: 1100 },
      { symbol: 'AAVE', amount: 35 },
    ],
    nfts: ['doodle-21'],
  },
];

const DEFAULT_INBOX_MESSAGES = [
  { sender: 'GkN2d7uYz3gT7Q3h6S2k1N8d9kX1m9e3tD2cY7g1s4mP', content: "You seem pretty. Let's chat?" },
  { sender: '7y5mH7k2W8a4t7L2p8q2K5V5m7Q3n9s9F7z2e7b3Q2u', content: 'Your vibe is immaculate. Coffee this week?' },
  { sender: '8bZ4s6z6Q2m5W7V9o2s6Y8k5J9x1D4p8F7a6L3r2v9q', content: 'I think we’d match well. Want to talk?' },
];

const DEFAULT_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-1',
    type: 'vote',
    actor: 'Cooker',
    content: 'vouched your post',
    timestamp: Date.now() - 3600000,
    read: false,
  },
  {
    id: 'notif-2',
    type: 'comment',
    actor: 'PythPearl',
    content: 'commented: “Same energy. Let’s connect.”',
    timestamp: Date.now() - 5400000,
    read: false,
  },
  {
    id: 'notif-3',
    type: 'match',
    actor: 'AlphaHunter',
    content: 'matched with you',
    timestamp: Date.now() - 7200000,
    read: true,
  },
  {
    id: 'notif-4',
    type: 'message',
    actor: 'Satoshi Lover',
    wallet_address: '8bZ4s6z6Q2m5W7V9o2s6Y8k5J9x1D4p8F7a6L3r2v9q',
    content: 'sent you a message',
    timestamp: Date.now() - 8200000,
    read: true,
  },
];

const LIKE_KEY = 'sugar-likes';
const SKIP_KEY = 'sugar-skips';
