import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ArrowLeft, Heart, Check, CheckCheck, X } from 'lucide-react';
import type { Message, MatchCandidate } from '@/types';
import { MatchCard } from '@/components/MatchCard';

interface MessagesProps {
  messages: Message[];
  session: { address: string };
  matches: Record<string, MatchCandidate>;
  onSendMessage: (receiver: string, content: string) => void;
  openUser?: string | null;
  onOpenConversation?: (otherAddress: string) => void;
}

export function Messages({
  messages,
  session,
  matches,
  onSendMessage,
  openUser,
  onOpenConversation,
}: MessagesProps) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (openUser) {
      setSelectedUser(openUser);
    }
  }, [openUser]);

  useEffect(() => {
    if (selectedUser) {
      onOpenConversation?.(selectedUser);
    }
    setShowProfile(false);
  }, [selectedUser, onOpenConversation]);

  const conversationMap = useMemo(() => {
    const convs = new Map<string, Message[]>();
    messages.forEach((msg) => {
      if (msg.sender !== session.address && msg.receiver !== session.address) return;
      const other = msg.sender === session.address ? msg.receiver : msg.sender;
      if (!convs.has(other)) {
        convs.set(other, []);
      }
      convs.get(other)!.push(msg);
    });
    return convs;
  }, [messages, session.address]);

  const conversationEntries = useMemo(() => {
    const entries = Array.from(conversationMap.entries());
    return entries.sort((a, b) => {
      const aLast = a[1][a[1].length - 1]?.timestamp || 0;
      const bLast = b[1][b[1].length - 1]?.timestamp || 0;
      return bLast - aLast;
    });
  }, [conversationMap]);

  const selectedMatch = selectedUser ? matches[selectedUser] : undefined;
  const selectedMessages = conversationMap.get(selectedUser || '') || [];

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const shortAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const cleanHandle = (handle?: string, domain?: string) => {
    if (!handle) return '';
    let cleaned = handle.replace(/^@/, '').trim();
    if (domain) {
      cleaned = cleaned.replace(new RegExp(`^https?:\\/\\/(www\\.)?${domain}\\/`, 'i'), '');
    }
    return cleaned.replace(/\/$/, '');
  };

  const getInitials = (name?: string) => {
    if (!name) return 'SG';
    return name.replace('@', '').slice(0, 2).toUpperCase();
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      {!selectedUser ? (
        // Conversations List
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h2 className="font-serif text-xl text-slate-800">Messages</h2>
            <p className="text-xs text-slate-400 mt-1">
              Chat with your matches
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {conversationEntries.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-pink-100 flex items-center justify-center">
                  <Heart className="w-8 h-8 text-pink-400" />
                </div>
                <h3 className="text-slate-700 font-semibold mb-1">No messages yet</h3>
                <p className="text-sm text-slate-400">
                  Your inbox will show your conversations.
                </p>
              </div>
            ) : (
              conversationEntries.map(([sender, convMessages]) => {
                const match = matches[sender];
                const lastMessage = convMessages[convMessages.length - 1];
                const unreadCount = convMessages.filter(
                  (m) => m.receiver === session.address && !m.read
                ).length;

                return (
                  <motion.button
                    key={sender}
                    onClick={() => setSelectedUser(sender)}
                    whileHover={{ scale: 1.01 }}
                    className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors flex items-center gap-3 text-left"
                  >
                    <div className="relative">
                      {match?.image ? (
                        <img
                          src={match.image}
                          alt={match.username}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-semibold">
                          {getInitials(match?.username || sender)}
                        </div>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{match?.username || sender}</span>
                        {lastMessage && (
                          <span className="text-xs text-slate-400">
                            {formatTime(lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        {lastMessage?.content || 'Start a conversation...'}
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-pink-500 text-white text-xs font-bold flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        // Chat View
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <button
              onClick={() => setSelectedUser(null)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </button>
            {selectedMatch && (
              <>
                {selectedMatch.image ? (
                  <img
                    src={selectedMatch.image}
                    alt={selectedMatch.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-semibold">
                    {getInitials(selectedMatch.username)}
                  </div>
                )}
                <div>
                  <div className="font-semibold text-slate-800">{selectedMatch.username}</div>
                  <div className="text-xs text-slate-400">{shortAddress(selectedMatch.wallet_address)}</div>
                </div>
                <button
                  onClick={() => setShowProfile(true)}
                  className="ml-auto text-xs font-semibold text-pink-500 hover:text-pink-600"
                >
                  View Profile
                </button>
              </>
            )}
          </div>

          {selectedMatch && (
            <div className="px-4 pt-3">
              <div className="bg-slate-50 rounded-2xl p-4 flex gap-3">
                {selectedMatch.image ? (
                  <img
                    src={selectedMatch.image}
                    alt={selectedMatch.username}
                    className="w-16 h-16 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 text-white flex items-center justify-center text-sm font-semibold">
                    {getInitials(selectedMatch.username)}
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">
                    {selectedMatch.username} • {selectedMatch.age}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {selectedMatch.bio}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedMatch.gender === 'male' && (
                      <span className="px-2 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 font-semibold">
                        Net Worth ${selectedMatch.total_value.toFixed(2)}
                      </span>
                    )}
                    {selectedMatch.match.sharedTokens.length > 0 && (
                      <span className="px-2 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 font-semibold">
                        Shared {selectedMatch.match.sharedTokens.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {selectedMatch.instagram && (
                      <a
                        href={`https://instagram.com/${cleanHandle(selectedMatch.instagram, 'instagram.com')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-pink-500 font-semibold hover:underline"
                      >
                        Instagram
                      </a>
                    )}
                    {selectedMatch.xHandle && (
                      <a
                        href={`https://x.com/${cleanHandle(selectedMatch.xHandle, 'x.com')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-500 font-semibold hover:underline"
                      >
                        X
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence>
              {selectedMessages.map((msg, idx) => {
                const isMe = msg.sender === session.address;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                        isMe
                          ? 'bg-pink-500 text-white rounded-br-md'
                          : 'bg-slate-100 text-slate-700 rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <div
                        className={`flex items-center gap-1 mt-1 text-[10px] ${
                          isMe ? 'text-pink-200' : 'text-slate-400'
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                        {isMe && (
                          msg.read ? (
                            <CheckCheck className="w-3 h-3" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-100">
            <div className="flex gap-2">
              <input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedUser && messageInput.trim()) {
                    onSendMessage(selectedUser, messageInput);
                    setMessageInput('');
                  }
                }}
                className="flex-1 bg-slate-50 border border-slate-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                placeholder="Type a message..."
              />
              <button
                onClick={() => {
                  if (selectedUser && messageInput.trim()) {
                    onSendMessage(selectedUser, messageInput);
                    setMessageInput('');
                  }
                }}
                disabled={!messageInput.trim() || !selectedUser}
                className="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center disabled:opacity-50 hover:bg-pink-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showProfile && selectedMatch && (
          <motion.div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-lg h-[70vh]"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              <button
                onClick={() => setShowProfile(false)}
                className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center z-20"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
              <MatchCard match={selectedMatch} showActions={false} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
