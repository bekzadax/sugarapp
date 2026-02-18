import { motion } from 'framer-motion';
import { Bell, MessageSquare, Heart, ThumbsUp } from 'lucide-react';
import type { Notification } from '@/types';

interface NotificationsProps {
  notifications: Notification[];
  onNotificationClick?: (note: Notification) => void;
}

const iconFor = (type: Notification['type']) => {
  if (type === 'message') return MessageSquare;
  if (type === 'match') return Heart;
  if (type === 'comment') return MessageSquare;
  return ThumbsUp;
};

export function Notifications({ notifications, onNotificationClick }: NotificationsProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-center gap-2">
        <Bell className="w-5 h-5 text-slate-500" />
        <h2 className="font-serif text-xl text-slate-800">Notifications</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notifications.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-12">No notifications yet.</div>
        ) : (
          notifications.map((note, index) => {
            const Icon = iconFor(note.type);
            return (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => onNotificationClick?.(note)}
                className={`p-4 rounded-2xl border ${
                  note.read ? 'bg-slate-50 border-slate-100' : 'bg-white border-pink-100'
                } ${onNotificationClick ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-pink-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {note.actor}
                      </div>
                      <div className="text-xs text-slate-500">{note.content}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">{formatTime(note.timestamp)}</div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
