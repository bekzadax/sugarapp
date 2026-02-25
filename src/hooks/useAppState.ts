import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Post,
  User,
  Comment,
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
import { supabase } from '@/lib/supabaseClient';
import rawKols from '@/data/kols.json';

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

type KolSeed = {
  wallet?: string;
  name?: string;
  xHandle?: string;
  netWorth?: number;
  tokens?: { symbol: string; amount: number }[];
};

const KOL_SEED: KolSeed[] = Array.isArray(rawKols) ? (rawKols as KolSeed[]) : [];
const normalizeXHandle = (handle?: string) => {
  if (!handle) return '';
  const cleaned = handle.replace(/^@/, '').trim();
  if (cleaned.toLowerCase() === 'kolscan') return '';
  if (cleaned.toLowerCase() === 'gorillacapsol') return 'gorillacap';
  return cleaned;
};
const KOL_AVATARS = KOL_SEED.reduce<Record<string, string>>((acc, kol) => {
  const handle = normalizeXHandle(kol.xHandle);
  if (kol.wallet && handle) {
    acc[kol.wallet] = handle;
  }
  return acc;
}, {});

const normalizeCandidateUser = (candidate: any): User => {
  const tokens = Array.isArray(candidate.tokens)
    ? candidate.tokens.map((token: any) => {
        if (typeof token === 'string') {
          return { symbol: token, amount: 0, usdValue: 0 };
        }
        const amount = token.amount ?? 0;
        const price = PRICE_MAP[token.symbol] || 0;
        return {
          symbol: token.symbol,
          amount,
          usdValue: token.usdValue ?? amount * price,
          mint: token.mint,
        };
      })
    : [];
  const nfts = Array.isArray(candidate.nfts) ? candidate.nfts : [];
  const computedTotal = tokens.reduce((sum: number, token: Token) => sum + (token.usdValue || 0), 0);
  return {
    wallet_address: candidate.wallet_address,
    username: candidate.username,
    gender: candidate.gender,
    image: candidate.image,
    photo: candidate.photo,
    instagram: candidate.instagram,
    xHandle: candidate.xHandle,
    verified: candidate.verified ?? true,
    tokens,
    nfts,
    nft_count: candidate.nft_count ?? nfts.length ?? 0,
    total_value: candidate.total_value ?? computedTotal,
    hearts_sent: 0,
    hearts_received: 0,
    bio: candidate.bio,
    age: candidate.age,
    distance: candidate.distance,
  };
};

const getProfilePostId = (walletAddress: string) => {
  let hash = 0;
  for (let i = 0; i < walletAddress.length; i += 1) {
    hash = (hash * 31 + walletAddress.charCodeAt(i)) >>> 0;
  }
  return 1_000_000_000 + (hash % 1_000_000_000);
};

const extractTokenSymbols = (tokens: any[]): string[] => {
  if (!Array.isArray(tokens)) return ['ETH'];
  const symbols = tokens
    .map((token) => (typeof token === 'string' ? token : token?.symbol))
    .filter(Boolean)
    .slice(0, 3);
  return symbols.length ? symbols : ['ETH'];
};

const KOL_PROFILES: User[] = KOL_SEED.filter((kol) => kol.wallet).map((kol) => {
  const handle = normalizeXHandle(kol.xHandle);
  const safeName = kol.name && kol.name.toLowerCase() !== 'kolscan' ? kol.name : '';
  return {
    wallet_address: kol.wallet!,
    username: handle ? `@${handle}` : safeName || `@${kol.wallet!.slice(0, 8)}`,
    xHandle: handle || undefined,
    photo: handle ? `https://unavatar.io/x/${handle}` : undefined,
    tokens: (kol.tokens || []).map((token) => ({
      symbol: token.symbol,
      amount: token.amount,
      usdValue: 0,
    })),
    nft_count: 0,
    total_value: kol.netWorth || 0,
    hearts_sent: 0,
    hearts_received: 0,
    bio: kol.name ? `KOL • ${kol.name}` : 'KOL profile',
    gender: 'male',
    verified: true,
  };
});

export function useAppState() {
  const [view, setView] = useState<'feed' | 'messages' | 'profile' | 'kol' | 'notifications'>('feed');
  const [feedTab, setFeedTab] = useState<'vouch' | 'hot' | 'new' | 'top' | 'liked'>('vouch');
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
  const [hydrated, setHydrated] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const supabaseEnabled = !!supabase;
  const lastProfileSyncRef = useRef<string | null>(null);

  useEffect(() => {
    if (matches.length > 0 && matchIndex >= matches.length) {
      setMatchIndex(0);
    }
  }, [matches.length, matchIndex]);

  const safeParse = useCallback(<T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn('Failed to parse localStorage value', error);
      return fallback;
    }
  }, [supabaseEnabled]);

  const boostSeedPosts = useCallback((input: Post[]) => {
    return input.map((post) => {
      if (post.id > 1000) return post;
      const nextComments = (post.comments || []).map((comment) => ({
        ...comment,
        votes: Math.max(comment.votes || 0, 25),
      }));
      if (nextComments.length === 0) {
        nextComments.push(
          { author: 'NovaBelle', text: 'This one made me laugh out loud.', votes: 28 },
          { author: 'AtlasGray', text: 'Vouched. The energy is elite.', votes: 26 },
          { author: 'SiennaRay', text: 'Signal is strong on this one.', votes: 22 }
        );
      }
      return {
        ...post,
        vouch_count: Math.max(post.vouch_count || 0, 35),
        vent_count: Math.max(post.vent_count || 0, 22),
        comments: nextComments,
      };
    });
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const savedPosts = safeParse<Post[]>(localStorage.getItem(STORAGE_KEYS.posts), DEFAULT_POSTS);
    const normalizedPosts = boostSeedPosts(Array.isArray(savedPosts) ? savedPosts : DEFAULT_POSTS);
    setPosts(normalizedPosts);

    const savedHearts = safeParse<{ sent: Record<string, number>; received: Record<string, number>; total: number }>(
      localStorage.getItem(STORAGE_KEYS.hearts),
      { sent: {}, received: {}, total: 0 }
    );
    const parsedHearts = savedHearts || { sent: {}, received: {}, total: 0 };
    // Add a mock received heart if empty
    if (!Object.keys(parsedHearts.received || {}).length) {
      parsedHearts.received = { [CANDIDATE_USERS[1].wallet_address]: Date.now() - 200000 };
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
    setHydrated(true);
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.posts, JSON.stringify(posts));
  }, [posts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.hearts, JSON.stringify(hearts));
  }, [hearts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.trends, JSON.stringify(trends));
  }, [trends, hydrated]);

  const readProfiles = () => {
    return safeParse<Record<string, User>>(localStorage.getItem(STORAGE_KEYS.profile), {});
  };

  const writeProfiles = (profiles: Record<string, User>) => {
    try {
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profiles));
    } catch (error) {
      console.warn('Failed to write profiles to localStorage', error);
    }
    setProfilesVersion((prev) => prev + 1);
  };

  const formatFallbackUsername = (walletAddress: string) => {
    return `@${walletAddress.slice(0, 8)}`;
  };

  const mapProfileRow = (row: any): User => {
    return {
      wallet_address: row.wallet_address,
      username: row.username || formatFallbackUsername(row.wallet_address),
      gender: row.gender || undefined,
      photo: row.photo || undefined,
      image: row.image || row.photo || undefined,
      instagram: row.instagram || undefined,
      xHandle: row.x_handle || row.xHandle || undefined,
      verified: row.verified ?? true,
      tokens: Array.isArray(row.tokens) ? row.tokens : [],
      nft_count: row.nft_count || 0,
      total_value: Number(row.total_value) || 0,
      hearts_sent: 0,
      hearts_received: 0,
      bio: row.bio || undefined,
      age: row.age || undefined,
      distance: row.distance || undefined,
    };
  };

  const mapPostRow = (row: any): Post => {
    return {
      id: Number(row.id),
      author: row.author,
      wallet_address: row.wallet_address,
      content: row.content,
      tokens: Array.isArray(row.tokens) ? row.tokens : [],
      type: row.type || undefined,
      vouch_count: row.vouch_count || 0,
      vent_count: row.vent_count || 0,
      comments: [],
      timestamp: Number(row.timestamp) || Date.now(),
    };
  };

  const upsertProfileToSupabase = useCallback(async (fullProfile: User) => {
    if (!supabaseEnabled || !supabase) {
      console.warn('Supabase not enabled: profiles will only be stored locally.');
      return;
    }
    try {
      const resolvedPhoto = fullProfile.photo || fullProfile.image || null;
      const { error } = await supabase.from('profiles').upsert({
        wallet_address: fullProfile.wallet_address,
        username: fullProfile.username,
        gender: fullProfile.gender || null,
        photo: resolvedPhoto,
        instagram: fullProfile.instagram || null,
        x_handle: fullProfile.xHandle || null,
        verified: fullProfile.verified ?? true,
        tokens: fullProfile.tokens || [],
        nft_count: fullProfile.nft_count || 0,
        total_value: fullProfile.total_value || 0,
        bio: fullProfile.bio || null,
        age: fullProfile.age || null,
        distance: fullProfile.distance || null,
      }, { onConflict: 'wallet_address' });
      if (error) {
        console.warn('Supabase save profile failed', error);
      }
    } catch (error) {
      console.warn('Supabase save profile error', error);
    }
  }, [supabaseEnabled]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(notifications));
  }, [notifications, hydrated]);

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
  }, [supabaseEnabled]);

  const seedSupabasePosts = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return;
    try {
      const { count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true });
      if (error) {
        console.warn('Supabase count posts failed', error);
        return;
      }
      const shouldSeedDefaults = !count || count === 0;
      if (shouldSeedDefaults) {
        const postsToInsert = DEFAULT_POSTS.map((post) => ({
          id: post.id,
          wallet_address: post.wallet_address,
          author: post.author,
          content: post.content,
          tokens: post.tokens,
          type: post.type || null,
          vouch_count: post.vouch_count || 0,
          vent_count: post.vent_count || 0,
          timestamp: post.timestamp,
        }));
        const { error: insertError } = await supabase.from('posts').insert(postsToInsert);
        if (insertError) {
          console.warn('Supabase seed posts failed', insertError);
        } else {
          const extraCommenters = [
            'NovaBelle',
            'AtlasGray',
            'ScarletPulse',
            'AriaBloom',
            'SolanaBae',
            'BonkBae',
            'PythPearl',
            'AlphaHunter',
            'YieldYume',
            'GasFeeGoddess',
          ];
          const extraLines = [
            'This one made me laugh out loud.',
            'Vouched. The energy is elite.',
            'I felt this one.',
            'Strong thesis, stronger vibe.',
            'This is the kind of post I’m here for.',
            'Green flags only.',
            'Low drama, high ROI.',
            'That’s the mindset.',
          ];
          const extraComments = DEFAULT_POSTS.flatMap((post, idx) => {
            const first = extraCommenters[idx % extraCommenters.length];
            const second = extraCommenters[(idx + 3) % extraCommenters.length];
            return [
              {
                client_id: `seed-extra-${post.id}-0`,
                post_id: post.id,
                author: first,
                text: extraLines[idx % extraLines.length],
                holdings: [],
                votes: 18,
                timestamp: post.timestamp,
              },
              {
                client_id: `seed-extra-${post.id}-1`,
                post_id: post.id,
                author: second,
                text: extraLines[(idx + 2) % extraLines.length],
                holdings: [],
                votes: 16,
                timestamp: post.timestamp,
              },
            ];
          });
          const commentsToInsert = DEFAULT_POSTS.flatMap((post) =>
            (post.comments || []).map((comment, idx) => ({
              client_id: `seed-${post.id}-${idx}`,
              post_id: post.id,
              author: comment.author,
              text: comment.text,
              holdings: comment.holdings || [],
              votes: comment.votes || 0,
              timestamp: post.timestamp,
            }))
          );
          const allComments = [...commentsToInsert, ...extraComments];
          if (allComments.length) {
            const { error: commentError } = await supabase
              .from('comments')
              .insert(allComments);
            if (commentError) {
              console.warn('Supabase seed comments failed', commentError);
            }
          }
        }
      }

      const { count: voteCount } = await supabase
        .from('post_votes')
        .select('post_id', { count: 'exact', head: true });
      if (!voteCount || voteCount === 0) {
        const voters = [
          ...CANDIDATE_USERS.slice(0, 8).map((c) => c.wallet_address),
          ...KOL_PROFILES.slice(0, 8).map((c) => c.wallet_address),
        ];
        const voteRows = DEFAULT_POSTS.flatMap((post, idx) =>
          voters.slice(0, 8).map((voter, vIdx) => ({
            post_id: post.id,
            voter,
            type: (idx + vIdx) % 4 === 0 ? 'vent' : 'vouch',
            timestamp: post.timestamp + (vIdx + 1) * 1000,
          }))
        );
        if (voteRows.length) {
          const { error: voteError } = await supabase.from('post_votes').insert(voteRows);
          if (voteError) {
            console.warn('Supabase seed post_votes failed', voteError);
          }
        }
      }

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('wallet_address,username,bio,tokens');
      if (profileError) {
        console.warn('Supabase load profiles for posts failed', profileError);
      } else if (profileRows && profileRows.length) {
        const profilePosts = profileRows.map((profile) => ({
          id: getProfilePostId(profile.wallet_address),
          wallet_address: profile.wallet_address,
          author: profile.username || profile.wallet_address.slice(0, 6),
          content: profile.bio || 'New profile just dropped. Let’s connect.',
          tokens: extractTokenSymbols(profile.tokens || []),
          type: 'profile',
          vouch_count: 0,
          vent_count: 0,
          timestamp: Date.now(),
        }));
        const ids = profilePosts.map((post) => post.id);
        const { data: existing } = await supabase
          .from('posts')
          .select('id')
          .in('id', ids);
        const existingIds = new Set((existing || []).map((row) => row.id));
        const missing = profilePosts.filter((post) => !existingIds.has(post.id));
        if (missing.length) {
          const { error: insertProfilePostsError } = await supabase
            .from('posts')
            .insert(missing);
          if (insertProfilePostsError) {
            console.warn('Supabase seed profile posts failed', insertProfilePostsError);
          }
        }
      }
    } catch (error) {
      console.warn('Supabase seed posts error', error);
    }
  }, [supabaseEnabled, safeParse]);

  const seedSupabaseProfiles = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return;
    try {
      const { count, error } = await supabase
        .from('profiles')
        .select('wallet_address', { count: 'exact', head: true });
      if (error) {
        console.warn('Supabase count profiles failed', error);
        return;
      }
      if (count && count > 0) return;
      const storedProfiles = readProfiles();
      const merged = new Map<string, User>();
      KOL_PROFILES.forEach((profile) => merged.set(profile.wallet_address, profile));
      CANDIDATE_USERS.forEach((profile) => merged.set(profile.wallet_address, profile));
      Object.values(storedProfiles).forEach((profile) => merged.set(profile.wallet_address, profile));
      const rows = Array.from(merged.values()).map((fullProfile) => ({
        wallet_address: fullProfile.wallet_address,
        username: fullProfile.username,
        gender: fullProfile.gender || null,
        photo: fullProfile.photo || null,
        instagram: fullProfile.instagram || null,
        x_handle: fullProfile.xHandle || null,
        verified: fullProfile.verified ?? true,
        tokens: fullProfile.tokens || [],
        nft_count: fullProfile.nft_count || 0,
        total_value: fullProfile.total_value || 0,
        bio: fullProfile.bio || null,
        age: fullProfile.age || null,
        distance: fullProfile.distance || null,
      }));
      if (rows.length) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(rows, { onConflict: 'wallet_address' });
        if (profileError) {
          console.warn('Supabase seed profiles failed', profileError);
        }
      }
    } catch (error) {
      console.warn('Supabase seed profiles error', error);
    }
  }, [supabaseEnabled]);

  const seedSupabaseEngagement = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return;
    try {
      const { count: heartsCount } = await supabase
        .from('hearts')
        .select('sender', { count: 'exact', head: true });
      if (!heartsCount || heartsCount === 0) {
        const pairs = [
          [CANDIDATE_USERS[0].wallet_address, CANDIDATE_USERS[1].wallet_address],
          [CANDIDATE_USERS[2].wallet_address, CANDIDATE_USERS[3].wallet_address],
          [CANDIDATE_USERS[4].wallet_address, CANDIDATE_USERS[5].wallet_address],
        ];
        const heartRows = pairs.map(([sender, target]) => ({
          sender,
          target,
          timestamp: Date.now() - 3600000,
        }));
        if (heartRows.length) {
          await supabase.from('hearts').insert(heartRows);
        }
      }

      const { count: messageCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true });
      if (!messageCount || messageCount === 0) {
        const a = CANDIDATE_USERS[0].wallet_address;
        const b = CANDIDATE_USERS[1].wallet_address;
        const c = CANDIDATE_USERS[2].wallet_address;
        const messagesSeed = [
          { id: crypto.randomUUID(), sender: a, receiver: b, content: 'Hey! Loved your vibe.', image: null },
          { id: crypto.randomUUID(), sender: b, receiver: a, content: 'You too. Coffee this week?', image: null },
          { id: crypto.randomUUID(), sender: c, receiver: a, content: 'Are you free tonight?', image: null },
        ].map((msg, idx) => ({
          ...msg,
          timestamp: Date.now() - (idx + 1) * 3600000,
          read: false,
        }));
        await supabase.from('messages').insert(messagesSeed);
      }

      const { count: notificationCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true });
      if (!notificationCount || notificationCount === 0) {
        const recipient = CANDIDATE_USERS[0].wallet_address;
        const notificationSeed = [
          {
            id: crypto.randomUUID(),
            recipient,
            actor: 'SUGAR',
            type: 'match',
            content: 'You received a new heart. Like back to reveal.',
            wallet_address: CANDIDATE_USERS[1].wallet_address,
            post_id: null,
          },
          {
            id: crypto.randomUUID(),
            recipient,
            actor: 'NovaBelle',
            type: 'comment',
            content: 'commented: “This is the energy.”',
            wallet_address: CANDIDATE_USERS[2].wallet_address,
            post_id: DEFAULT_POSTS[0].id,
          },
        ].map((note, idx) => ({
          ...note,
          timestamp: Date.now() - (idx + 1) * 3000000,
          read: false,
        }));
        await supabase.from('notifications').insert(notificationSeed);
      }
    } catch (error) {
      console.warn('Supabase seed engagement error', error);
    }
  }, [supabaseEnabled]);

  const loadPostsFromSupabase = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return;
    try {
      await seedSupabasePosts();
      const { data: postRows, error } = await supabase
        .from('posts')
        .select('*')
        .order('timestamp', { ascending: false });
      if (error) {
        console.warn('Supabase load posts failed', error);
        return;
      }
      const postsFromDb = (postRows || []).map(mapPostRow);
      const ids = postsFromDb.map((post) => post.id);
      let commentRows: any[] = [];
      if (ids.length) {
        const { data: comments, error: commentsError } = await supabase
          .from('comments')
          .select('*')
          .in('post_id', ids);
        if (commentsError) {
          console.warn('Supabase load comments failed', commentsError);
        } else {
          commentRows = comments || [];
        }
      }
      const commentsByPost = new Map<number, Comment[]>();
      commentRows.forEach((row) => {
        const postId = Number(row.post_id);
        const list = commentsByPost.get(postId) || [];
        list.push({
          id: row.client_id || row.id,
          author: row.author,
          text: row.text,
          holdings: Array.isArray(row.holdings) ? row.holdings : [],
          votes: row.votes || 0,
          userVoted: false,
        });
        commentsByPost.set(postId, list);
      });
      const nextPostsFromDb = postsFromDb.map((post) => ({
        ...post,
        comments: commentsByPost.get(post.id) || [],
      }));
      setPosts((prev) => {
        const merged = new Map<number, Post>();
        nextPostsFromDb.forEach((post) => merged.set(post.id, post));
        prev.forEach((post) => {
          if (!merged.has(post.id)) {
            merged.set(post.id, post);
          }
        });
        const mergedPosts = Array.from(merged.values());
        return mergedPosts.length ? boostSeedPosts(mergedPosts) : prev;
      });
    } catch (error) {
      console.warn('Supabase load posts error', error);
    }
  }, [supabaseEnabled, seedSupabasePosts, boostSeedPosts]);

  const syncProfilesFromSupabase = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return;
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) {
        console.warn('Supabase load profiles failed', error);
        return;
      }
      if (!data) return;
      const existing = readProfiles();
      const mappedProfiles: User[] = [];
      data.forEach((row) => {
        const mapped = mapProfileRow(row);
        existing[row.wallet_address] = mapped;
        mappedProfiles.push(mapped);
      });
      writeProfiles(existing);
      if (mappedProfiles.length) {
        setMatchDirectory((prev) => {
          const next = { ...prev };
          mappedProfiles.forEach((profile) => {
            const rawTokens = Array.isArray(profile.tokens) ? profile.tokens : [];
            const tokens = rawTokens
              .map((token: any) => {
                if (typeof token === 'string') {
                  return { symbol: token, amount: 0, usdValue: 0 };
                }
                const amount = token.amount ?? 0;
                const price = PRICE_MAP[token.symbol] || 0;
                return {
                  symbol: token.symbol,
                  amount,
                  usdValue: token.usdValue ?? amount * price,
                };
              })
              .filter((token: any) => token.symbol);
            const totalValue =
              profile.total_value ?? tokens.reduce((sum: number, t: Token) => sum + (t.usdValue || 0), 0);
            const kolAvatar = KOL_AVATARS[profile.wallet_address];
            const image = kolAvatar
              ? `https://unavatar.io/x/${kolAvatar}`
              : (profile as any).image || profile.photo || '';
            next[profile.wallet_address] = {
              wallet_address: profile.wallet_address,
              username: profile.username,
              portfolio: {
                tokens,
                total_value: totalValue,
                balance: tokens.find((t: Token) => t.symbol === 'SOL')?.amount || 0,
                nfts: profile.nfts || [],
              },
              match: {
                score: 50,
                sharedTokens: [],
                sharedNfts: [],
                diamondHands: false,
              },
              tokens,
              nft_count: profile.nft_count || 0,
              total_value: totalValue,
              hearts_sent: 0,
              hearts_received: 0,
              bio: profile.bio || 'Open to new connections.',
              age: profile.age || 24,
              distance: profile.distance,
              image,
              gender: profile.gender || 'female',
              instagram: profile.instagram,
              xHandle: profile.xHandle,
              verified: profile.verified ?? true,
            };
          });
          return next;
        });
      }
      if (mappedProfiles.length) {
        setPosts((prev) => {
          const existingWallets = new Set(
            prev.filter((post) => post.type === 'profile').map((post) => post.wallet_address)
          );
          const additions = mappedProfiles
            .filter((profile) => !existingWallets.has(profile.wallet_address))
            .map((profile) => ({
              id: getProfilePostId(profile.wallet_address),
              author: profile.username || profile.wallet_address.slice(0, 6),
              wallet_address: profile.wallet_address,
              content: profile.bio || 'New profile just dropped. Let’s connect.',
              type: 'profile',
              tokens: extractTokenSymbols(profile.tokens || []),
              vouch_count: 0,
              vent_count: 0,
              comments: [],
              timestamp: Date.now(),
            }));
          if (!additions.length) return prev;
          return [...additions, ...prev];
        });
        const profilePosts = mappedProfiles.map((profile) => ({
          id: getProfilePostId(profile.wallet_address),
          wallet_address: profile.wallet_address,
          author: profile.username || profile.wallet_address.slice(0, 6),
          content: profile.bio || 'New profile just dropped. Let’s connect.',
          tokens: extractTokenSymbols(profile.tokens || []),
          type: 'profile',
          vouch_count: 0,
          vent_count: 0,
          timestamp: Date.now(),
        }));
        const ids = profilePosts.map((post) => post.id);
        const { data: existingPosts } = await supabase
          .from('posts')
          .select('id')
          .in('id', ids);
        const existingIds = new Set((existingPosts || []).map((row) => row.id));
        const missing = profilePosts.filter((post) => !existingIds.has(post.id));
        if (missing.length) {
          const { error: insertProfilePostsError } = await supabase
            .from('posts')
            .insert(missing);
          if (insertProfilePostsError) {
            console.warn('Supabase seed profile posts failed', insertProfilePostsError);
          }
        }
      }
    } catch (error) {
      console.warn('Supabase load profiles error', error);
    }
  }, [supabaseEnabled]);

  const subscribeToProfiles = useCallback(() => {
    const client = supabase;
    if (!supabaseEnabled || !client) return () => {};
    const channel = client
      .channel('profiles:changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          const row: any = payload.new;
          if (!row || !row.wallet_address) return;
          const mapped = mapProfileRow(row);
          const profiles = readProfiles();
          profiles[mapped.wallet_address] = mapped;
          writeProfiles(profiles);
          setMatchDirectory((prev) => {
            const next = { ...prev };
            const rawTokens = Array.isArray(mapped.tokens) ? mapped.tokens : [];
            const tokens = rawTokens
              .map((token: any) => {
                if (typeof token === 'string') {
                  return { symbol: token, amount: 0, usdValue: 0 };
                }
                const amount = token.amount ?? 0;
                const price = PRICE_MAP[token.symbol] || 0;
                return {
                  symbol: token.symbol,
                  amount,
                  usdValue: token.usdValue ?? amount * price,
                };
              })
              .filter((token: any) => token.symbol);
            const totalValue =
              mapped.total_value ?? tokens.reduce((sum: number, t: Token) => sum + (t.usdValue || 0), 0);
            const kolAvatar = KOL_AVATARS[mapped.wallet_address];
            const image = kolAvatar ? `https://unavatar.io/x/${kolAvatar}` : mapped.photo || '';
            next[mapped.wallet_address] = {
              wallet_address: mapped.wallet_address,
              username: mapped.username,
              portfolio: {
                tokens,
                total_value: totalValue,
                balance: tokens.find((t: Token) => t.symbol === 'SOL')?.amount || 0,
                nfts: mapped.nfts || [],
              },
              match: {
                score: 50,
                sharedTokens: [],
                sharedNfts: [],
                diamondHands: false,
              },
              tokens,
              nft_count: mapped.nft_count || 0,
              total_value: totalValue,
              hearts_sent: 0,
              hearts_received: 0,
              bio: mapped.bio || 'Open to new connections.',
              age: mapped.age || 24,
              distance: mapped.distance,
              image,
              gender: mapped.gender || 'female',
              instagram: mapped.instagram,
              xHandle: mapped.xHandle,
              verified: mapped.verified ?? true,
            };
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [supabaseEnabled]);

  const syncSkipsFor = useCallback(async (walletAddress: string) => {
    if (supabaseEnabled && supabase) {
      try {
        const { data, error } = await supabase
          .from('skips')
          .select('*')
          .eq('sender', walletAddress);
        if (error) {
          console.warn('Supabase load skips failed', error);
        } else if (data) {
          const skips: Record<string, string[]> = {};
          data.forEach((row) => {
            if (!skips[walletAddress]) skips[walletAddress] = [];
            skips[walletAddress].push(row.target);
          });
          localStorage.setItem(SKIP_KEY, JSON.stringify(skips));
          return;
        }
      } catch (error) {
        console.warn('Supabase load skips error', error);
      }
    }
    const raw = localStorage.getItem(SKIP_KEY);
    if (!raw) {
      localStorage.setItem(SKIP_KEY, JSON.stringify({}));
    }
  }, [supabaseEnabled]);

  const loadProfileFromSupabase = useCallback(async (walletAddress: string) => {
    if (!supabaseEnabled || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      if (error) {
        console.warn('Supabase load profile failed', error);
        return null;
      }
      if (data?.wallet_address) {
        const profileFromDb = mapProfileRow(data);
        const existing = readProfiles();
        existing[walletAddress] = profileFromDb;
        writeProfiles(existing);
        setProfile(profileFromDb);
        return profileFromDb;
      }
      return null;
    } catch (error) {
      console.warn('Supabase load profile error', error);
      return null;
    }
  }, [supabaseEnabled]);

  const hydrateMessagesForUser = useCallback((walletAddress: string) => {
    const raw = localStorage.getItem(STORAGE_KEYS.messages);
    const all = safeParse<Message[]>(raw, []);
    if (!Array.isArray(all) || all.length === 0) return;
    const forUser = all.filter(
      (m) => m.sender === walletAddress || m.receiver === walletAddress
    );
    if (forUser.length > 0) {
      const sorted = [...forUser].sort((a, b) => a.timestamp - b.timestamp);
      setMessages(sorted);
    }
  }, []);

  const loadMessagesForUser = useCallback(async (walletAddress: string) => {
    if (!supabaseEnabled || !supabase) {
      hydrateMessagesForUser(walletAddress);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender.eq.${walletAddress},receiver.eq.${walletAddress}`)
        .order('timestamp', { ascending: true });
      if (error) {
        console.warn('Supabase load messages failed', error.message, error.details);
        hydrateMessagesForUser(walletAddress);
        return;
      }
      let rows = data ?? [];
      if (rows.length === 0) {
        const [sent, received] = await Promise.all([
          supabase.from('messages').select('*').eq('sender', walletAddress).order('timestamp', { ascending: true }),
          supabase.from('messages').select('*').eq('receiver', walletAddress).order('timestamp', { ascending: true }),
        ]);
        const byId = new Map<string, (typeof rows)[0]>();
        (sent.data ?? []).forEach((r) => byId.set(r.id, r));
        (received.data ?? []).forEach((r) => byId.set(r.id, r));
        rows = Array.from(byId.values()).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      }
      const fromDb = rows.map((row) => ({
        id: row.id,
        sender: row.sender,
        receiver: row.receiver,
        content: row.content,
        image: row.image ?? undefined,
        timestamp: Number(row.timestamp),
        read: !!row.read,
      }));
      if (fromDb.length > 0) {
        setMessages((prev) => {
          const byId = new Map<string, Message>();
          fromDb.forEach((m) => byId.set(m.id, m));
          prev.forEach((m) => {
            if (!byId.has(m.id)) byId.set(m.id, m);
          });
          const merged = Array.from(byId.values()).sort(
            (a, b) => a.timestamp - b.timestamp
          );
          try {
            localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(merged));
          } catch (e) {
            console.warn('Failed to persist messages to localStorage', e);
          }
          return merged;
        });
        return;
      }
      const localMessages = safeParse<Message[]>(
        localStorage.getItem(STORAGE_KEYS.messages),
        []
      );
      if (localMessages.length) {
        setMessages(localMessages);
        try {
          localStorage.setItem(
            STORAGE_KEYS.messages,
            JSON.stringify(localMessages)
          );
        } catch (e) {
          console.warn('Failed to persist messages to localStorage', e);
        }
        void supabase.from('messages').upsert(
          localMessages.map((msg) => ({
            id: msg.id,
            sender: msg.sender,
            receiver: msg.receiver,
            content: msg.content,
            image: msg.image ?? null,
            timestamp: msg.timestamp,
            read: msg.read,
          })),
          { onConflict: 'id' }
        );
      }
    } catch (error) {
      console.warn('Supabase load messages error', error);
      hydrateMessagesForUser(walletAddress);
    }
  }, [supabaseEnabled, safeParse, hydrateMessagesForUser]);

  const subscribeToMessages = useCallback((walletAddress: string) => {
    const client = supabase;
    if (!supabaseEnabled || !client) return () => {};
    const channel = client
      .channel(`messages:${walletAddress}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver=eq.${walletAddress}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (!row || !row.id) return;
          const incoming: Message = {
            id: row.id,
            sender: row.sender,
            receiver: row.receiver,
            content: row.content,
            image: row.image ?? undefined,
            timestamp: Number(row.timestamp),
            read: !!row.read,
          };
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === incoming.id)) return prev;
            const next = [...prev, incoming].sort((a, b) => a.timestamp - b.timestamp);
            if (hydrated) {
              try {
                localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(next));
              } catch (e) {
                console.warn('Failed to persist message to localStorage', e);
              }
            }
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [supabaseEnabled, hydrated]);

  const subscribeToHearts = useCallback((walletAddress: string) => {
    const client = supabase;
    if (!supabaseEnabled || !client) return () => {};
    const channel = client
      .channel(`hearts:${walletAddress}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hearts',
          filter: `target=eq.${walletAddress}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (!row?.sender) return;
          setHearts((prev) => {
            const received = { ...prev.received, [row.sender]: Date.now() };
            const sent = { ...prev.sent };
            const total = Object.keys(sent).length;
            try {
              const raw = localStorage.getItem(LIKE_KEY);
              const likes: Record<string, string[]> = raw ? JSON.parse(raw) : {};
              if (!likes[row.sender]) likes[row.sender] = [];
              if (!likes[row.sender].includes(row.target)) {
                likes[row.sender].push(row.target);
              }
              localStorage.setItem(LIKE_KEY, JSON.stringify(likes));
            } catch (e) {
              console.warn('Failed to update likes map', e);
            }
            return { ...prev, received, total };
          });
        }
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [supabaseEnabled]);

  const loadNotificationsForUser = useCallback(async (walletAddress: string) => {
    if (!supabaseEnabled || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient', walletAddress)
        .order('timestamp', { ascending: false });
      if (error) {
        console.warn('Supabase load notifications failed', error);
        return;
      }
      const fromDb =
        data?.map((row) => ({
          id: row.id,
          type: row.type,
          actor: row.actor,
          content: row.content,
          wallet_address: row.wallet_address || undefined,
          recipient: row.recipient || undefined,
          postId: row.post_id ? Number(row.post_id) : undefined,
          timestamp: Number(row.timestamp),
          read: !!row.read,
        })) ?? [];
      if (fromDb.length > 0) {
        setNotifications((prev) => {
          const byId = new Map<string, Notification>();
          fromDb.forEach((n) => byId.set(n.id, n));
          prev.forEach((n) => {
            if (!byId.has(n.id)) byId.set(n.id, n);
          });
          return Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
        });
        return;
      }
      const localNotes = safeParse<Notification[]>(
        localStorage.getItem(STORAGE_KEYS.notifications),
        DEFAULT_NOTIFICATIONS
      );
      const userNotes = (localNotes || []).filter(
        (note) => note.recipient === walletAddress
      );
      if (userNotes.length) {
        setNotifications(userNotes);
        void supabase.from('notifications').upsert(
          userNotes.map((note) => ({
            id: note.id,
            recipient: note.recipient,
            actor: note.actor,
            type: note.type,
            content: note.content,
            wallet_address: note.wallet_address || null,
            post_id: note.postId || null,
            timestamp: note.timestamp,
            read: note.read,
          })),
          { onConflict: 'id' }
        );
      }
    } catch (error) {
      console.warn('Supabase load notifications error', error);
    }
  }, [supabaseEnabled]);

  useEffect(() => {
    if (!supabaseEnabled) return;
    seedSupabaseProfiles();
    seedSupabaseEngagement();
    loadPostsFromSupabase();
    syncProfilesFromSupabase();
  }, [
    supabaseEnabled,
    loadPostsFromSupabase,
    syncProfilesFromSupabase,
    seedSupabaseProfiles,
    seedSupabaseEngagement,
  ]);

  // Compute hot score for sorting
  const computeHotScore = useCallback((post: Post): number => {
    const hours = Math.max(1, (Date.now() - post.timestamp) / 3600000);
    const votes = (post.vouch_count || 0) * 2 - (post.vent_count || 0);
    const comments = post.comments?.length || 0;
    return (votes + comments * 1.5) / Math.pow(hours, 0.9);
  }, [supabaseEnabled]);

  // Get sorted posts
  const getSortedPosts = useCallback((): Post[] => {
    const sorted = [...posts];
    const boost = (post: Post) => (boostedWallets.has(post.wallet_address) ? 50 : 0);
    if (feedTab === 'new' || feedTab === 'liked') {
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
      if (supabaseEnabled && supabase) {
        void supabase.from('posts').insert({
          id: newPost.id,
          wallet_address: newPost.wallet_address,
          author: newPost.author,
          content: newPost.content,
          tokens: newPost.tokens,
          type: newPost.type || null,
          vouch_count: newPost.vouch_count,
          vent_count: newPost.vent_count,
          timestamp: newPost.timestamp,
        });
      }
    },
    [portfolio, anonymous, supabaseEnabled]
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
  }, [supabaseEnabled]);

  // Vote on post
  const votePost = useCallback(
    (postId: number, type: 'vouch' | 'vent', voterAddress?: string) => {
      let updated: Post | null = null;
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

          updated = {
            ...post,
            vouch_count: vouchCount,
            vent_count: ventCount,
            userVote: type,
            userVouched: type === 'vouch',
            userVented: type === 'vent',
          };
          return updated;
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
      if (supabaseEnabled && supabase && updated) {
        const updatedPost = updated as Post;
        if (voterAddress) {
          void supabase.from('post_votes').upsert(
            {
              post_id: updatedPost.id,
              voter: voterAddress,
              type,
              timestamp: Date.now(),
            },
            { onConflict: 'post_id,voter' }
          );
        }
        void supabase
          .from('posts')
          .update({
            vouch_count: updatedPost.vouch_count || 0,
            vent_count: updatedPost.vent_count || 0,
          })
          .eq('id', updatedPost.id);
      }
    },
    [posts, supabaseEnabled]
  );

  // Add comment
  const addComment = useCallback(
    (postId: number, text: string, username: string) => {
      const holdings = portfolio?.tokens.slice(0, 3).map((token) => token.symbol) || [];
      const commentId = crypto.randomUUID();
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post;
          return {
            ...post,
            comments: [
              ...(post.comments || []),
              {
                id: commentId,
                author: username,
                text,
                holdings,
                votes: 0,
              },
            ],
          };
        })
      );
      if (supabaseEnabled && supabase) {
        void supabase.from('comments').insert({
          client_id: commentId,
          post_id: postId,
          author: username,
          text,
          holdings,
          votes: 0,
          timestamp: Date.now(),
        });
      }
    },
    [portfolio, supabaseEnabled]
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
    if (supabaseEnabled && supabase) {
      const targetPost = posts.find((post) => post.id === postId);
      const targetComment = targetPost?.comments?.[commentIndex];
      if (targetComment) {
        const nextVotes = (targetComment.votes || 0) + 1;
        if (targetComment.id) {
          void supabase
            .from('comments')
            .update({ votes: nextVotes })
            .eq('client_id', targetComment.id);
        } else {
          void supabase
            .from('comments')
            .update({ votes: nextVotes })
            .eq('post_id', postId)
            .eq('author', targetComment.author)
            .eq('text', targetComment.text);
        }
      }
    }
  }, []);

  const syncLocalStateToSupabase = useCallback(async () => {
    if (!supabaseEnabled || !supabase) return;
    const syncKey = 'sugar-supabase-sync-v1';
    if (localStorage.getItem(syncKey)) {
      try {
        const { count } = await supabase
          .from('profiles')
          .select('wallet_address', { count: 'exact', head: true });
        if (count && count > 0) {
          return;
        }
      } catch {
        // fall through to retry sync
      }
    }
    try {
      const profiles = readProfiles();
      const mergedProfiles = new Map<string, User>();
      KOL_PROFILES.forEach((profile) => mergedProfiles.set(profile.wallet_address, profile));
      CANDIDATE_USERS.forEach((profile) => mergedProfiles.set(profile.wallet_address, profile));
      Object.values(profiles).forEach((profile) => mergedProfiles.set(profile.wallet_address, profile));
      const profileRows = Array.from(mergedProfiles.values()).map((fullProfile) => ({
        wallet_address: fullProfile.wallet_address,
        username: fullProfile.username,
        gender: fullProfile.gender || null,
        photo: fullProfile.photo || null,
        instagram: fullProfile.instagram || null,
        x_handle: fullProfile.xHandle || null,
        verified: fullProfile.verified ?? true,
        tokens: fullProfile.tokens || [],
        nft_count: fullProfile.nft_count || 0,
        total_value: fullProfile.total_value || 0,
        bio: fullProfile.bio || null,
        age: fullProfile.age || null,
        distance: fullProfile.distance || null,
      }));
      if (profileRows.length) {
        await supabase.from('profiles').upsert(profileRows, { onConflict: 'wallet_address' });
      }

      const localPosts = safeParse<Post[]>(
        localStorage.getItem(STORAGE_KEYS.posts),
        []
      );
      if (localPosts.length) {
        const postRows = localPosts.map((post) => ({
          id: post.id,
          wallet_address: post.wallet_address,
          author: post.author,
          content: post.content,
          tokens: post.tokens,
          type: post.type || null,
          vouch_count: post.vouch_count || 0,
          vent_count: post.vent_count || 0,
          timestamp: post.timestamp,
        }));
        await supabase.from('posts').upsert(postRows, { onConflict: 'id' });

        const commentRows = localPosts.flatMap((post) =>
          (post.comments || []).map((comment, idx) => ({
            client_id: comment.id || `local-${post.id}-${idx}-${comment.author}`,
            post_id: post.id,
            author: comment.author,
            text: comment.text,
            holdings: comment.holdings || [],
            votes: comment.votes || 0,
            timestamp: post.timestamp,
          }))
        );
        if (commentRows.length) {
          await supabase.from('comments').upsert(commentRows, { onConflict: 'client_id' });
        }
      }

      const localMessages = safeParse<Message[]>(
        localStorage.getItem(STORAGE_KEYS.messages),
        []
      );
      if (localMessages.length) {
        await supabase.from('messages').upsert(
          localMessages.map((msg) => ({
            id: msg.id,
            sender: msg.sender,
            receiver: msg.receiver,
            content: msg.content,
            image: msg.image || null,
            timestamp: msg.timestamp,
            read: msg.read,
          })),
          { onConflict: 'id' }
        );
      }

      const localNotifications = safeParse<Notification[]>(
        localStorage.getItem(STORAGE_KEYS.notifications),
        []
      );
      const notificationRows = (localNotifications || [])
        .filter((note) => note.recipient)
        .map((note) => ({
          id: note.id,
          recipient: note.recipient,
          actor: note.actor,
          type: note.type,
          content: note.content,
          wallet_address: note.wallet_address || null,
          post_id: note.postId || null,
          timestamp: note.timestamp,
          read: note.read,
        }));
      if (notificationRows.length) {
        await supabase.from('notifications').upsert(notificationRows, { onConflict: 'id' });
      }

      const likesRaw = localStorage.getItem(LIKE_KEY);
      if (likesRaw) {
        const likes: Record<string, string[]> = JSON.parse(likesRaw);
        const heartRows = Object.entries(likes).flatMap(([sender, targets]) =>
          targets.map((target) => ({
            sender,
            target,
            timestamp: Date.now(),
          }))
        );
        if (heartRows.length) {
          await supabase.from('hearts').upsert(heartRows, { onConflict: 'sender,target' });
        }
      }

      const skipsRaw = localStorage.getItem(SKIP_KEY);
      if (skipsRaw) {
        const skips: Record<string, string[]> = JSON.parse(skipsRaw);
        const skipRows = Object.entries(skips).flatMap(([sender, targets]) =>
          targets.map((target) => ({
            sender,
            target,
            timestamp: Date.now(),
          }))
        );
        if (skipRows.length) {
          await supabase.from('skips').upsert(skipRows, { onConflict: 'sender,target' });
        }
      }

      localStorage.setItem(syncKey, '1');
    } catch (error) {
      console.warn('Supabase local sync failed', error);
    }
  }, [supabaseEnabled]);

  useEffect(() => {
    if (!supabaseEnabled) return;
    const run = () => {
      void syncLocalStateToSupabase();
    };
    if (typeof globalThis !== 'undefined' && 'requestIdleCallback' in globalThis) {
      const id = (globalThis as any).requestIdleCallback(run);
      return () => {
        if ('cancelIdleCallback' in globalThis) {
          (globalThis as any).cancelIdleCallback(id);
        }
      };
    }
    const timer = setTimeout(run, 1500);
    return () => clearTimeout(timer);
  }, [supabaseEnabled, syncLocalStateToSupabase]);

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

  const DEFAULT_FEMALE_IMAGES = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=2560&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=2560&auto=format&fit=crop',
  ];
  const buildMatchCandidate = useCallback(
    (candidate: User, userPortfolio: Portfolio | null, verifiedSet?: Set<string>) => {
      const candidatePortfolio = buildCandidatePortfolio(candidate);
      const match = calculateMatch(userPortfolio, candidatePortfolio);
      const verified = candidate.verified ?? verifiedSet?.has(candidate.wallet_address) ?? false;
      const kolAvatar = KOL_AVATARS[candidate.wallet_address];
      let image = kolAvatar
        ? `https://unavatar.io/x/${kolAvatar}`
        : candidate.image || candidate.photo || '';
      if (!image && candidate.gender === 'female') {
        const idx = candidate.wallet_address.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        image = DEFAULT_FEMALE_IMAGES[idx % DEFAULT_FEMALE_IMAGES.length];
      }
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
        image,
        gender: candidate.gender || 'female',
        instagram: candidate.instagram,
        xHandle: candidate.xHandle,
        verified,
      } as MatchCandidate;
    },
    [buildCandidatePortfolio, calculateMatch]
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
        if (!ignoreHistory && profile?.wallet_address === currentUser) {
          Object.keys(hearts.sent || {}).forEach((addr) => excluded.add(addr));
        }
        excluded.add(currentUser);
      }
      const merged = [...KOL_PROFILES, ...CANDIDATE_USERS, ...extraCandidates];
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

      const seedSet = new Set<string>([
        ...KOL_PROFILES.map((candidate) => candidate.wallet_address),
        ...CANDIDATE_USERS.map((candidate) => candidate.wallet_address),
      ]);
      const realUserSet = new Set(
        extraCandidates
          .filter((candidate) => !seedSet.has(candidate.wallet_address))
          .map((candidate) => candidate.wallet_address)
      );
      const verifiedSet = new Set(extraCandidates.map((candidate) => candidate.wallet_address));
      const matches = unique.map((candidate) =>
        buildMatchCandidate(candidate, userPortfolio, verifiedSet)
      );
      const directoryMatches = uniqueAll.map((candidate) =>
        buildMatchCandidate(candidate, userPortfolio, verifiedSet)
      );

      const preferredCandidateGender =
        preferredGender === 'female' ? 'male' : preferredGender === 'male' ? 'female' : null;
      matches.sort((a, b) => {
        const aReal = realUserSet.has(a.wallet_address) ? 0 : 1;
        const bReal = realUserSet.has(b.wallet_address) ? 0 : 1;
        if (aReal !== bReal) return aReal - bReal;
        if (preferredCandidateGender === 'female') {
          const rank = (candidate: MatchCandidate) => {
            if (candidate.gender === 'female' && candidate.verified) return 0;
            if (candidate.gender === 'female') return 1;
            if (candidate.verified) return 2;
            return 3;
          };
          const aRank = rank(a);
          const bRank = rank(b);
          if (aRank !== bRank) return aRank - bRank;
        } else {
          const aVerified = a.verified ? 0 : 1;
          const bVerified = b.verified ? 0 : 1;
          if (aVerified !== bVerified) return aVerified - bVerified;
        }

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
      if (supabaseEnabled && supabase) {
        void supabase.from('hearts').upsert(
          {
            sender: senderAddress,
            target: match.wallet_address,
            timestamp: Date.now(),
          },
          { onConflict: 'sender,target' }
        );
      }

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
    [updateTrends, supabaseEnabled]
  );

  const recordHeartBack = useCallback(
    (senderAddress: string, targetAddress: string) => {
      const raw = localStorage.getItem(LIKE_KEY);
      const likes: Record<string, string[]> = raw ? JSON.parse(raw) : {};
      const senderLikes = new Set(likes[senderAddress] || []);
      const alreadySent = senderLikes.has(targetAddress);
      if (!alreadySent) {
        senderLikes.add(targetAddress);
        likes[senderAddress] = Array.from(senderLikes);
        localStorage.setItem(LIKE_KEY, JSON.stringify(likes));
      }
      setHearts((prev) => ({
        ...prev,
        sent: { ...prev.sent, [targetAddress]: Date.now() },
        total: alreadySent ? prev.total : prev.total + 1,
      }));
      if (supabaseEnabled && supabase) {
        void supabase.from('hearts').upsert(
          {
            sender: senderAddress,
            target: targetAddress,
            timestamp: Date.now(),
          },
          { onConflict: 'sender,target' }
        );
      }
    },
    [supabaseEnabled]
  );

  const checkMutualHeart = useCallback(
    async (userAddress: string, otherAddress: string) => {
      if (!supabaseEnabled || !supabase) {
        return { sent: false, received: false };
      }
      try {
        const { data } = await supabase
          .from('hearts')
          .select('sender,target')
          .or(
            `and(sender.eq.${userAddress},target.eq.${otherAddress}),and(sender.eq.${otherAddress},target.eq.${userAddress})`
          );
        const sent = !!data?.find((row) => row.sender === userAddress && row.target === otherAddress);
        const received = !!data?.find((row) => row.sender === otherAddress && row.target === userAddress);
        return { sent, received };
      } catch (error) {
        console.warn('Supabase check hearts error', error);
        return { sent: false, received: false };
      }
    },
    [supabaseEnabled]
  );

  const recordSkip = useCallback((senderAddress: string, targetAddress: string) => {
    const raw = localStorage.getItem(SKIP_KEY);
    const skips: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const senderSkips = new Set(skips[senderAddress] || []);
    senderSkips.add(targetAddress);
    skips[senderAddress] = Array.from(senderSkips);
    localStorage.setItem(SKIP_KEY, JSON.stringify(skips));
    if (supabaseEnabled && supabase) {
      void supabase.from('skips').upsert(
        {
          sender: senderAddress,
          target: targetAddress,
          timestamp: Date.now(),
        },
        { onConflict: 'sender,target' }
      );
    }
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
      const existingProfiles = readProfiles();
      const existingProfile = existingProfiles[walletAddress];
      const baseProfile =
        profile?.wallet_address === walletAddress ? profile : existingProfile;
      const tokens = portfolio?.tokens ?? baseProfile?.tokens ?? [];
      const nftCount = portfolio?.nfts?.length ?? baseProfile?.nft_count ?? 0;
      const totalValue = portfolio?.total_value ?? baseProfile?.total_value ?? 0;
      const resolvedPhoto =
        userProfile.photo ??
        userProfile.image ??
        baseProfile?.photo ??
        baseProfile?.image ??
        existingProfile?.photo ??
        existingProfile?.image ??
        undefined;
      const username =
        userProfile.username && userProfile.username.trim().length > 0
          ? userProfile.username
          : formatFallbackUsername(walletAddress);
      const fullProfile: User = {
        ...DEFAULT_PROFILE,
        ...baseProfile,
        ...userProfile,
        username,
        wallet_address: walletAddress,
        photo: resolvedPhoto,
        image: resolvedPhoto,
        tokens,
        nft_count: nftCount,
        total_value: totalValue,
      };
      const profiles = existingProfiles;
      profiles[walletAddress] = fullProfile;
      writeProfiles(profiles);
      setProfile(fullProfile);
      if (options?.closeModal ?? true) {
        setIsProfileModalOpen(false);
      }
      if (supabaseEnabled && supabase) {
        void upsertProfileToSupabase(fullProfile);
      }
    },
    [portfolio, supabaseEnabled, upsertProfileToSupabase, profile]
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
      const resolvedPhoto =
        defaults?.photo ??
        defaults?.image ??
        undefined;
      const fullProfile: User = {
        ...DEFAULT_PROFILE,
        ...defaults,
        username,
        wallet_address: walletAddress,
        photo: resolvedPhoto,
        image: resolvedPhoto,
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
      if (supabaseEnabled && supabase) {
        void upsertProfileToSupabase(fullProfile);
      }
      return fullProfile;
    },
    [portfolio, supabaseEnabled, upsertProfileToSupabase]
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

  useEffect(() => {
    if (!supabaseEnabled || !profile?.wallet_address) return;
    const key = `${profile.wallet_address}:${profile.username}:${profile.photo || ''}:${profile.bio || ''}`;
    if (lastProfileSyncRef.current === key) return;
    lastProfileSyncRef.current = key;
    void upsertProfileToSupabase(profile);
  }, [profile, supabaseEnabled, upsertProfileToSupabase]);

  const getAllSavedProfiles = useCallback((): User[] => {
    const profiles = readProfiles();
    return Object.values(profiles);
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (receiver: string, content: string, senderAddress: string, image?: string) => {
      const newMessage: Message = {
        id: crypto.randomUUID(),
        sender: senderAddress,
        receiver,
        content,
        image,
        timestamp: Date.now(),
        read: false,
      };
      setMessages((prev) => {
        const next = [...prev, newMessage];
        try {
          localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(next));
        } catch (e) {
          console.warn('Failed to persist message to localStorage', e);
        }
        return next;
      });
      if (supabaseEnabled && supabase) {
        const { error } = await supabase.from('messages').upsert(
          {
            id: newMessage.id,
            sender: newMessage.sender,
            receiver: newMessage.receiver,
            content: newMessage.content,
            image: newMessage.image ?? null,
            timestamp: newMessage.timestamp,
            read: newMessage.read,
          },
          { onConflict: 'id' }
        );
        if (error) {
          console.error('Supabase save message failed:', error.message, error.details);
        }
      }
    },
    [supabaseEnabled]
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
    if (supabaseEnabled && supabase) {
      void supabase
        .from('messages')
        .update({ read: true })
        .eq('receiver', userAddress)
        .eq('sender', otherAddress);
    }
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
    const nextNote: Notification = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      read: false,
      ...note,
    };
    setNotifications((prev) => [nextNote, ...prev]);
    if (supabaseEnabled && supabase && nextNote.recipient) {
      void supabase.from('notifications').insert({
        id: nextNote.id,
        recipient: nextNote.recipient,
        actor: nextNote.actor,
        type: nextNote.type,
        content: nextNote.content,
        wallet_address: nextNote.wallet_address || null,
        post_id: nextNote.postId || null,
        timestamp: nextNote.timestamp,
        read: nextNote.read,
      });
    }
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((note) => (note.id === id ? { ...note, read: true } : note))
    );
    if (supabaseEnabled && supabase) {
      void supabase.from('notifications').update({ read: true }).eq('id', id);
    }
  }, []);

  const clearUserState = useCallback(() => {
    setProfile(null);
    setPortfolio(null);
    setScanPortfolio(null);
    setIsProfileModalOpen(false);
    setMatches([]);
    setMatchDirectory({});
    setMatchIndex(0);
  }, []);

  const seedMessagesFor = useCallback(
    (receiverAddress: string) => {
      if (supabaseEnabled) return;
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
    [supabaseEnabled]
  );

  const seedFeedActivity = useCallback(() => {
    if (supabaseEnabled) return;
    const seedKey = 'sugar-feed-seeded';
    if (localStorage.getItem(seedKey)) return;
    setPosts((prev) => {
      if (!prev.length) return prev;
      const seeded = prev.map((post, idx) => {
        if (idx > 6) return post;
        const comments = post.comments ? [...post.comments] : [];
        if (comments.length === 0) {
          comments.push(
            { author: 'NovaBelle', text: 'This is the energy I’m here for.', votes: 5 },
            { author: 'AtlasGray', text: 'Strong thesis. Stronger vibe.', votes: 3 }
          );
        }
        return {
          ...post,
          vouch_count: (post.vouch_count || 0) + 25,
          vent_count: (post.vent_count || 0) + 4,
          comments,
        };
      });
      return seeded;
    });
    localStorage.setItem(seedKey, '1');
  }, []);

  const syncHeartsFor = useCallback(async (walletAddress: string) => {
    if (supabaseEnabled && supabase) {
      try {
        const { data, error } = await supabase
          .from('hearts')
          .select('*')
          .or(`sender.eq.${walletAddress},target.eq.${walletAddress}`);
        if (error) {
          console.warn('Supabase load hearts failed', error);
        } else if (data) {
          const likesFromSupabase: Record<string, string[]> = {};
          data.forEach((row) => {
            const sender = row.sender;
            const target = row.target;
            if (!likesFromSupabase[sender]) likesFromSupabase[sender] = [];
            likesFromSupabase[sender].push(target);
          });
          const received: Record<string, number> = {};
          Object.entries(likesFromSupabase).forEach(([sender, targets]) => {
            if (targets.includes(walletAddress)) {
              received[sender] = Date.now();
            }
          });
          const sentFromSupabase: Record<string, number> = {};
          (likesFromSupabase[walletAddress] || []).forEach((target) => {
            sentFromSupabase[target] = Date.now();
          });
          // Merge with current state so a heart just sent locally is never overwritten
          setHearts((prev) => {
            const mergedSent = { ...sentFromSupabase, ...prev.sent };
            const mergedLikes = { ...likesFromSupabase };
            if (!mergedLikes[walletAddress]) mergedLikes[walletAddress] = [];
            Object.keys(mergedSent).forEach((target) => {
              if (!mergedLikes[walletAddress].includes(target)) {
                mergedLikes[walletAddress].push(target);
              }
            });
            localStorage.setItem(LIKE_KEY, JSON.stringify(mergedLikes));
            return {
              ...prev,
              sent: mergedSent,
              received,
              total: Object.keys(mergedSent).length,
            };
          });
          return;
        }
      } catch (error) {
        console.warn('Supabase load hearts error', error);
      }
    }

    const raw = localStorage.getItem(LIKE_KEY);
    const likes: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    const received: Record<string, number> = {};
    Object.entries(likes).forEach(([sender, targets]) => {
      if (targets.includes(walletAddress)) {
        received[sender] = Date.now();
      }
    });
    const sentFromStorage: Record<string, number> = {};
    (likes[walletAddress] || []).forEach((target) => {
      sentFromStorage[target] = Date.now();
    });
    // Merge with current state so a heart just sent is never overwritten
    setHearts((prev) => ({
      ...prev,
      sent: { ...sentFromStorage, ...prev.sent },
      received,
      total: Object.keys({ ...sentFromStorage, ...prev.sent }).length,
    }));
  }, [supabaseEnabled]);

  const ensureProfilePost = useCallback(
    (walletAddress: string, username: string, portfolio: Portfolio | null) => {
      const tokens = portfolio?.tokens?.slice(0, 3).map((token) => token.symbol) || ['ETH'];
      const postId = getProfilePostId(walletAddress);
      setPosts((prev) => {
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
          id: postId,
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
      if (supabaseEnabled && supabase) {
        void supabase.from('posts').upsert(
          {
            id: postId,
            wallet_address: walletAddress,
            author: username || walletAddress.slice(0, 6),
            content: 'New profile just dropped. Let’s connect.',
            tokens,
            type: 'profile',
            vouch_count: 0,
            vent_count: 0,
            timestamp: Date.now(),
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
        void supabase
          .from('posts')
          .update({ author: username || walletAddress.slice(0, 6), tokens })
          .eq('id', postId);
      }
    },
    [portfolio, supabaseEnabled]
  );

  const ensureMatchPost = useCallback((match: MatchCandidate) => {
    const stableId = getProfilePostId(match.wallet_address);
    setPosts((prev) => {
      const exists = prev.some(
        (post) => post.wallet_address === match.wallet_address && post.type === 'profile'
      );
      if (exists) return prev;
      const tokens = match.portfolio.tokens.slice(0, 3).map((t) => t.symbol);
      const newPost: Post = {
        id: stableId,
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
      if (supabaseEnabled && supabase) {
        void supabase.from('posts').upsert(
          {
            id: newPost.id,
            wallet_address: newPost.wallet_address,
            author: newPost.author,
            content: newPost.content,
            tokens: newPost.tokens,
            type: newPost.type || null,
            vouch_count: newPost.vouch_count,
            vent_count: newPost.vent_count,
            timestamp: newPost.timestamp,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
      }
      return [newPost, ...prev];
    });
  }, [supabaseEnabled]);

  const getLikedWalletsFor = useCallback((walletAddress: string): string[] => {
    const liked = new Set<string>();
    const raw = localStorage.getItem(LIKE_KEY);
    if (raw) {
      try {
        const likes: Record<string, string[]> = JSON.parse(raw);
        (likes[walletAddress] || []).forEach((addr) => liked.add(addr));
      } catch (error) {
        console.warn('Failed to parse likes map', error);
      }
    }
    if (profile?.wallet_address === walletAddress) {
      Object.keys(hearts.sent || {}).forEach((addr) => liked.add(addr));
    }
    liked.delete(walletAddress);
    return Array.from(liked);
  }, [hearts.sent, profile?.wallet_address]);

  const ensureLikedPostsFor = useCallback(
    (walletAddress: string) => {
      const liked = getLikedWalletsFor(walletAddress);
      if (!liked.length) return;
      const profiles = readProfiles();
      liked.forEach((target) => {
        const existing = matchDirectory[target];
        if (existing) {
          ensureMatchPost(existing);
          return;
        }
        const profileCandidate = profiles[target];
        if (profileCandidate) {
          const candidate = buildMatchCandidate(profileCandidate, portfolio);
          ensureMatchPost(candidate);
        }
      });
    },
    [getLikedWalletsFor, matchDirectory, ensureMatchPost, buildMatchCandidate, portfolio]
  );

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
    recordHeartBack,
    checkMutualHeart,
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
    seedFeedActivity,
    boostWallet,
    addNotification,
    markNotificationRead,
    clearUserState,
    ensureProfilePost,
    ensureMatchPost,
    ensureLikedPostsFor,
    syncHeartsFor,
    syncSkipsFor,
    loadPostsFromSupabase,
    syncProfilesFromSupabase,
    loadProfileFromSupabase,
    subscribeToProfiles,
    hydrateMessagesForUser,
    loadMessagesForUser,
    subscribeToMessages,
    subscribeToHearts,
    loadNotificationsForUser,
    loadProfileForWallet,
    getAllSavedProfiles,
    getLikedWalletsFor,
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
    author: '@gorillacap',
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
  {
    id: 43,
    author: '@MoonMeme',
    wallet_address: '7x1Q9v3M2b5C8r6N4t2K9w3L7p2S6y4A8v2M5n1D9q',
    content: 'I’ll cook dinner if you explain leverage in one sentence.',
    type: 'story',
    tokens: ['SOL', 'JUP'],
    vouch_count: 222,
    vent_count: 18,
    comments: [
      { author: 'NovaBelle', text: '“Borrowed confidence.”', votes: 21 },
      { author: 'AtlasGray', text: 'That sentence is a red flag and a love note.', votes: 17 },
    ],
    timestamp: Date.now() - 10200000,
  },
  {
    id: 44,
    author: '@GasFeeGoddess',
    wallet_address: '9v2Q6m3M8b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8p',
    content: 'My type? Someone who pays gas and texts back.',
    type: 'crush',
    tokens: ['ETH', 'USDC'],
    vouch_count: 310,
    vent_count: 19,
    comments: [
      { author: 'SolanaBae', text: 'Gas + green flags only.', votes: 19 },
    ],
    timestamp: Date.now() - 10800000,
  },
  {
    id: 45,
    author: '@YieldYume',
    wallet_address: '5m2Q7v4M1b3C6r8T5x2L9k4P6s3W8y5A7v4G2m1Z8o',
    content: 'If we’re both farming, is it still a situationship?',
    type: 'story',
    tokens: ['ETH', 'AAVE'],
    vouch_count: 274,
    vent_count: 16,
    comments: [
      { author: 'PythPearl', text: 'Only if the APY is mutual.', votes: 20 },
    ],
    timestamp: Date.now() - 11200000,
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
    verified: true,
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
    xHandle: 'gorillacap',
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
    verified: true,
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
    verified: true,
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
    verified: true,
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
    verified: true,
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
    verified: true,
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
  {
    wallet_address: '9m2Q7v4M1b3C6r8T5x2L9k4P6s3W8y5A7v4G2m1Z9u',
    username: 'RheaVoss',
    age: 24,
    distance: '3 miles away',
    bio: 'Soft mornings, strong positions.',
    gender: 'female',
    instagram: 'rhea.voss',
    xHandle: 'RheaVoss',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=108',
    tokens: [
      { symbol: 'SOL', amount: 18 },
      { symbol: 'USDC', amount: 2400 },
      { symbol: 'JUP', amount: 1200 },
    ],
    nfts: ['madlad-62'],
  },
  {
    wallet_address: '5q1L8m2V7c3N9x6R4b2T9w4K7p5M3s8Q2v6Y4t1A8w',
    username: 'ZaraLume',
    age: 26,
    distance: '2 miles away',
    bio: 'I like my dates like my charts: clean and upward.',
    gender: 'female',
    instagram: 'zara.lume',
    xHandle: 'ZaraLume',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=109',
    tokens: [
      { symbol: 'ETH', amount: 2.8 },
      { symbol: 'USDC', amount: 1800 },
      { symbol: 'ARB', amount: 900 },
    ],
    nfts: ['doodle-34'],
  },
  {
    wallet_address: '6p3Q9m7V1c4N8x6R4b2T9w2K7p5M3s8Q2v6Y4t1A8x',
    username: 'MilaHart',
    age: 23,
    distance: '1 mile away',
    bio: 'Golden hour fan and long-term holder.',
    gender: 'female',
    instagram: 'mila.hart',
    xHandle: 'MilaHart',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=110',
    tokens: [
      { symbol: 'SOL', amount: 14 },
      { symbol: 'USDC', amount: 1500 },
      { symbol: 'PYTH', amount: 4200 },
    ],
    nfts: ['azuki-58'],
  },
  {
    wallet_address: '8k2Q6v3M9b2C5r7T4x1L9k4P6s2W8y5A7v4G2m1Z8k',
    username: 'SerenBlair',
    age: 27,
    distance: '4 miles away',
    bio: 'Signals, silence, and slow burns.',
    gender: 'female',
    instagram: 'seren.blair',
    xHandle: 'SerenBlair',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=111',
    tokens: [
      { symbol: 'ETH', amount: 3.1 },
      { symbol: 'USDC', amount: 2600 },
      { symbol: 'AAVE', amount: 55 },
    ],
    nfts: ['doodle-41'],
  },
  {
    wallet_address: '7p2M8v3Q2b5C9r6N4t2K9w3L7p2S6y4A8v2M5n1D9v',
    username: 'IvySage',
    age: 25,
    distance: '6 miles away',
    bio: 'Soft edges, sharp mind.',
    gender: 'female',
    instagram: 'ivy.sage',
    xHandle: 'IvySage',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=112',
    tokens: [
      { symbol: 'ETH', amount: 2.4 },
      { symbol: 'USDC', amount: 1400 },
      { symbol: 'SOL', amount: 11 },
    ],
    nfts: ['madlad-73'],
  },
  {
    wallet_address: '4k1Q8v3M9b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z9y',
    username: 'LinaBloom',
    age: 24,
    distance: '2 miles away',
    bio: 'If you bring the vibe, I’ll bring the alpha.',
    gender: 'female',
    instagram: 'lina.bloom',
    xHandle: 'LinaBloom',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=113',
    tokens: [
      { symbol: 'SOL', amount: 16 },
      { symbol: 'USDC', amount: 1900 },
      { symbol: 'WIF', amount: 3800 },
    ],
    nfts: ['azuki-62'],
  },
  {
    wallet_address: '6m2Q8v3M9b2C5r7T4x1L9k4P6s2W8y5A7v4G2m1Z9w',
    username: 'AvaNoir',
    age: 26,
    distance: '3 miles away',
    bio: 'Soft glam, sharp entries.',
    gender: 'female',
    instagram: 'ava.noir',
    xHandle: 'AvaNoir',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=114',
    tokens: [
      { symbol: 'ETH', amount: 2.6 },
      { symbol: 'USDC', amount: 2100 },
      { symbol: 'SOL', amount: 12 },
    ],
    nfts: ['madlad-84'],
  },
  {
    wallet_address: '8p2Q7v4M1b3C6r8T5x2L9k4P6s3W8y5A7v4G2m1Z9x',
    username: 'KaiaLune',
    age: 25,
    distance: '4 miles away',
    bio: 'Charts by day, moonlight walks by night.',
    gender: 'female',
    instagram: 'kaia.lune',
    xHandle: 'KaiaLune',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=115',
    tokens: [
      { symbol: 'SOL', amount: 13 },
      { symbol: 'JUP', amount: 1500 },
      { symbol: 'USDC', amount: 1700 },
    ],
    nfts: ['azuki-74'],
  },
  {
    wallet_address: '9k2Q6v3M8b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z9y',
    username: 'ElaraVane',
    age: 27,
    distance: '6 miles away',
    bio: 'High signal, low noise. Always.',
    gender: 'female',
    instagram: 'elara.vane',
    xHandle: 'ElaraVane',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=116',
    tokens: [
      { symbol: 'ETH', amount: 3.3 },
      { symbol: 'USDC', amount: 2600 },
      { symbol: 'AAVE', amount: 60 },
    ],
    nfts: ['doodle-68'],
  },
  {
    wallet_address: '7m2Q9v3M1b3C6r8T5x2L9k4P6s3W8y5A7v4G2m1Z9z',
    username: 'SageRowan',
    age: 24,
    distance: '2 miles away',
    bio: 'Soft heart, strong thesis.',
    gender: 'female',
    instagram: 'sage.rowan',
    xHandle: 'SageRowan',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=117',
    tokens: [
      { symbol: 'SOL', amount: 15 },
      { symbol: 'USDC', amount: 1600 },
      { symbol: 'PYTH', amount: 3000 },
    ],
    nfts: ['madlad-95'],
  },
  {
    wallet_address: '5n2Q8v3M9b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z8t',
    username: 'NoraVale',
    age: 25,
    distance: '5 miles away',
    bio: 'Calm energy, bold moves.',
    gender: 'female',
    instagram: 'nora.vale',
    xHandle: 'NoraVale',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=118',
    tokens: [
      { symbol: 'ETH', amount: 2.1 },
      { symbol: 'USDC', amount: 1400 },
      { symbol: 'ARB', amount: 700 },
    ],
    nfts: ['azuki-83'],
  },
  {
    wallet_address: '6v3Q8m1L9b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z9a',
    username: 'LyraQuinn',
    age: 24,
    distance: '3 miles away',
    bio: 'Soft smile, strong strategy.',
    gender: 'female',
    instagram: 'lyra.quinn',
    xHandle: 'LyraQuinn',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=119',
    tokens: [
      { symbol: 'ETH', amount: 2.3 },
      { symbol: 'USDC', amount: 1500 },
      { symbol: 'SOL', amount: 9 },
    ],
    nfts: ['azuki-91'],
  },
  {
    wallet_address: '4x2Q7m9V1b3C6r8T5x2L9k4P6s3W8y5A7v4G2m1Z9b',
    username: 'SerenVale',
    age: 26,
    distance: '4 miles away',
    bio: 'Low drama, high upside.',
    gender: 'female',
    instagram: 'seren.vale',
    xHandle: 'SerenVale',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=120',
    tokens: [
      { symbol: 'ETH', amount: 3.0 },
      { symbol: 'USDC', amount: 1900 },
      { symbol: 'AAVE', amount: 55 },
    ],
    nfts: ['doodle-91'],
  },
  {
    wallet_address: '7p2Q9m6V1c3N8x6R4b2T9w1K7p5M3s8Q2v6Y4t1A9c',
    username: 'OpalHaze',
    age: 23,
    distance: '2 miles away',
    bio: 'A little mystery, a lot of conviction.',
    gender: 'female',
    instagram: 'opal.haze',
    xHandle: 'OpalHaze',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=121',
    tokens: [
      { symbol: 'SOL', amount: 14 },
      { symbol: 'USDC', amount: 1200 },
      { symbol: 'JUP', amount: 800 },
    ],
    nfts: ['madlad-101'],
  },
  {
    wallet_address: '9q2Q6m3M8b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z9d',
    username: 'IrisLune',
    age: 27,
    distance: '6 miles away',
    bio: 'Looking for calm minds and warm hearts.',
    gender: 'female',
    instagram: 'iris.lune',
    xHandle: 'IrisLune',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=122',
    tokens: [
      { symbol: 'ETH', amount: 3.5 },
      { symbol: 'USDC', amount: 2400 },
      { symbol: 'ARB', amount: 680 },
    ],
    nfts: ['azuki-95'],
  },
  {
    wallet_address: '2r8Q5v9M1b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z9e',
    username: 'MiraSol',
    age: 25,
    distance: '4 miles away',
    bio: 'Sunset walks and smart bets.',
    gender: 'female',
    instagram: 'mira.sol',
    xHandle: 'MiraSol',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=123',
    tokens: [
      { symbol: 'ETH', amount: 2.5 },
      { symbol: 'USDC', amount: 1700 },
      { symbol: 'SOL', amount: 10 },
    ],
    nfts: ['doodle-94'],
  },
  {
    wallet_address: '5x2Q9v7M1b3C6r8T4x2L9k3P6s2W8y5A7v4G2m1Z9f',
    username: 'ValeaRose',
    age: 24,
    distance: '3 miles away',
    bio: 'Soft edges, sharp thesis.',
    gender: 'female',
    instagram: 'valea.rose',
    xHandle: 'ValeaRose',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=124',
    tokens: [
      { symbol: 'ETH', amount: 2.0 },
      { symbol: 'USDC', amount: 1300 },
      { symbol: 'AAVE', amount: 40 },
    ],
    nfts: ['azuki-97'],
  },
  {
    wallet_address: '6t2Q9v7M1b3C6r8T4x2L9k3P6s2W8y5A7v4G2m1Z9g',
    username: 'ArdenSky',
    age: 26,
    distance: '5 miles away',
    bio: 'If you love green candles, we’ll get along.',
    gender: 'female',
    instagram: 'arden.sky',
    xHandle: 'ArdenSky',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=125',
    tokens: [
      { symbol: 'SOL', amount: 12 },
      { symbol: 'USDC', amount: 1600 },
      { symbol: 'PYTH', amount: 2600 },
    ],
    nfts: ['madlad-108'],
  },
  {
    wallet_address: '8m2Q6v3M9b2C5r7T4x2L9k3P6s2W8y5A7v4G2m1Z9h',
    username: 'CleoVera',
    age: 22,
    distance: '2 miles away',
    bio: 'Sparkle in my eyes, alpha in my notes.',
    gender: 'female',
    instagram: 'cleo.vera',
    xHandle: 'CleoVera',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=126',
    tokens: [
      { symbol: 'ETH', amount: 1.7 },
      { symbol: 'USDC', amount: 900 },
      { symbol: 'SOL', amount: 7 },
    ],
    nfts: ['azuki-101'],
  },
  {
    wallet_address: '3v2Q8m1L9b2C5r7T4x1L9k3P6s2W8y5A7v4G2m1Z9i',
    username: 'NyxMarin',
    age: 27,
    distance: '6 miles away',
    bio: 'Market calm, romantic chaos.',
    gender: 'female',
    instagram: 'nyx.marin',
    xHandle: 'NyxMarin',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=127',
    tokens: [
      { symbol: 'ETH', amount: 3.6 },
      { symbol: 'USDC', amount: 2300 },
      { symbol: 'ARB', amount: 720 },
    ],
    nfts: ['doodle-103'],
  },
  {
    wallet_address: '9t2Q7v4M1b3C6r8T5x2L9k4P6s3W8y5A7v4G2m1Z9j',
    username: 'EdenLuxe',
    age: 25,
    distance: '4 miles away',
    bio: 'Warm aura, sharp reads.',
    gender: 'female',
    instagram: 'eden.luxe',
    xHandle: 'EdenLuxe',
    image: 'https://source.unsplash.com/featured/900x1200?portrait,woman&sig=128',
    tokens: [
      { symbol: 'ETH', amount: 2.8 },
      { symbol: 'USDC', amount: 1800 },
      { symbol: 'AAVE', amount: 50 },
    ],
    nfts: ['azuki-104'],
  },
];

const CANDIDATE_USERS: User[] = CANDIDATES.map((candidate) => normalizeCandidateUser(candidate));

const DEFAULT_INBOX_MESSAGES = [
  { sender: 'GkN2d7uYz3gT7Q3h6S2k1N8d9kX1m9e3tD2cY7g1s4mP', content: "Your vibe stands out. Want to chat?" },
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
