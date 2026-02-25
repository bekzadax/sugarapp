import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageSquare, Share2, ThumbsUp, ThumbsDown, ChevronUp } from 'lucide-react';
import type { Post, Portfolio, User } from '@/types';

interface FeedProps {
  posts: Post[];
  session: { address: string } | null;
  profile: User | null;
  portfolio: Portfolio | null;
  focusPostId?: number | null;
  onFocusHandled?: () => void;
  anonymous: boolean;
  feedTab: 'vouch' | 'hot' | 'new';
  heartsTotal: number;
  hasLikes: boolean;
  onCreatePost: (content: string) => void;
  onVote: (postId: number, type: 'vouch' | 'vent') => void;
  onAddComment: (postId: number, text: string) => void;
  onVoteComment: (postId: number, commentIndex: number) => void;
  onShare: (postId: number) => void;
  onToggleAnonymous: () => void;
  onSetFeedTab: (tab: 'vouch' | 'hot' | 'new') => void;
  calculateOverlapScore: (tokens: string[], portfolio: Portfolio | null) => number;
}

export function Feed({
  posts,
  session,
  profile,
  portfolio,
  focusPostId,
  onFocusHandled,
  anonymous,
  feedTab,
  heartsTotal,
  hasLikes,
  onCreatePost,
  onVote,
  onAddComment,
  onVoteComment,
  onShare,
  onToggleAnonymous,
  onSetFeedTab,
  calculateOverlapScore,
}: FeedProps) {
  const [postContent, setPostContent] = useState('');
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [highlightedPostId, setHighlightedPostId] = useState<number | null>(null);

  const handlePost = () => {
    if (!postContent.trim() || !session) return;
    onCreatePost(postContent);
    setPostContent('');
  };

  const toggleComments = (postId: number) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const handleAddComment = (postId: number) => {
    const text = commentInputs[postId];
    if (!text?.trim()) return;
    onAddComment(postId, text);
    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
  };

  useEffect(() => {
    if (!focusPostId) return;
    setExpandedComments((prev) => {
      const next = new Set(prev);
      next.add(focusPostId);
      return next;
    });
    setHighlightedPostId(focusPostId);
    const scrollTimer = window.setTimeout(() => {
      const el = document.querySelector(`[data-post-id="${focusPostId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onFocusHandled?.();
    }, 50);
    const clearTimer = window.setTimeout(() => setHighlightedPostId(null), 2000);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusPostId, onFocusHandled]);


  const formatTime = (timestamp: number) => {
    const hours = Math.floor((Date.now() - timestamp) / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="font-serif text-xl text-slate-800">FEED</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400" />
              </span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Viral Pulse: {heartsTotal} hearts
              </span>
            </div>

            {/* Tabs */}
            <div className="mt-3 flex flex-wrap gap-2">
              {(['vouch', 'hot', 'new'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onSetFeedTab(tab)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    feedTab === tab
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'hover:bg-white/60 text-slate-500'
                  }`}
                >
                  {tab === 'vouch'
                    ? 'Vouch & Vent'
                    : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

          </div>

          <button
            onClick={onToggleAnonymous}
            className="p-2 hover:bg-slate-50 rounded-full transition-colors"
          >
            <span
              className={`px-2 py-1 rounded-full text-xs font-semibold ${
                anonymous ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              Anonymous: {anonymous ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Post Creator */}
        {session && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              POST TO THE FEED
            </div>
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              rows={3}
              className="mt-3 w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
              placeholder="Write your post here..."
            />

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Posting as: {anonymous ? 'Anonymous' : profile?.username || 'Guest'}
              </div>
              <button
                onClick={handlePost}
                disabled={!postContent.trim()}
                className="px-4 py-2 rounded-full bg-pink-500 text-white text-sm font-semibold shadow-lg shadow-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-600 transition-colors"
              >
                Post
              </button>
            </div>
          </div>
        )}

        {/* Posts */}
        {posts.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400">
            {!session
              ? 'Connect your wallet to see the feed.'
              : !hasLikes
              ? 'Like someone to unlock their feed.'
              : 'No posts yet.'}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {posts.map((post) => {
              const matchPercent = calculateOverlapScore(post.tokens, portfolio);
              const isCommentsOpen = expandedComments.has(post.id);

              return (
                <motion.div
                  key={post.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  data-post-id={post.id}
                  className={`bg-white p-4 rounded-2xl shadow-sm border border-slate-100 ${
                    highlightedPostId === post.id ? 'ring-2 ring-pink-200 shadow-lg' : ''
                  }`}
                >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xs text-white font-bold">
                      {post.author.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{post.author}</div>
                      <div className="text-xs text-slate-400">{formatTime(post.timestamp)}</div>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-pink-500">{matchPercent}% Match</div>
                </div>

                {/* Content */}
                <p className="text-sm text-slate-600 mt-3">{post.content}</p>

                {/* Tokens */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {post.tokens.map((token) => (
                    <span
                      key={token}
                      className="px-2 py-1 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500"
                    >
                      {token}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <button
                    onClick={() => onVote(post.id, 'vouch')}
                    className={`flex items-center gap-1 font-semibold transition-colors ${
                      post.userVouched ? 'text-pink-500' : 'hover:text-pink-500'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Vouch {post.vouch_count || 0}
                  </button>
                  <button
                    onClick={() => onVote(post.id, 'vent')}
                    className={`flex items-center gap-1 font-semibold transition-colors ${
                      post.userVented ? 'text-rose-500' : 'hover:text-rose-500'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Vent {post.vent_count || 0}
                  </button>
                  <button
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-1 font-semibold hover:text-slate-700 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Comment {post.comments?.length || 0}
                  </button>
                  <button
                    onClick={() => onShare(post.id)}
                    className="flex items-center gap-1 font-semibold hover:text-slate-700 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                </div>

                {/* Comments */}
                <AnimatePresence>
                  {isCommentsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-3 pt-3 border-t border-slate-100 overflow-hidden"
                    >
                      {post.comments?.map((comment, idx) => (
                        <div key={idx} className="mt-2 p-3 rounded-xl bg-slate-50">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-slate-700">
                              {comment.author}
                            </span>
                            <button
                              onClick={() => onVoteComment(post.id, idx)}
                              className="text-[10px] font-semibold text-pink-500 flex items-center gap-1"
                            >
                              <ChevronUp className="w-3 h-3" />
                              {comment.votes || 0}
                            </button>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{comment.text}</p>
                          {comment.holdings && comment.holdings.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {comment.holdings.map((h) => (
                                <span
                                  key={h}
                                  className="px-2 py-0.5 rounded-full bg-white text-[9px] font-semibold text-slate-400 border border-slate-100"
                                >
                                  {h}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add Comment */}
                      {session && (
                        <div className="mt-3 flex gap-2">
                          <input
                            value={commentInputs[post.id] || ''}
                            onChange={(e) =>
                              setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-2 text-xs focus:outline-none focus:ring-2 focus:ring-pink-200"
                            placeholder="Write a comment..."
                          />
                          <button
                            onClick={() => handleAddComment(post.id)}
                            className="px-3 py-2 rounded-xl bg-pink-500 text-white text-xs font-semibold"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
