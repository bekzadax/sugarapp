-- =============================================================================
-- Copy everything below this line (from "create index" to the last ";") into
-- Supabase SQL Editor and click Run. Do NOT type the word "paste" in the editor.
-- =============================================================================

-- MESSAGES: faster load by sender/receiver and by time
create index if not exists idx_messages_sender_receiver
  on public.messages (sender, receiver);
create index if not exists idx_messages_timestamp
  on public.messages (timestamp);
create index if not exists idx_messages_sender
  on public.messages (sender);
create index if not exists idx_messages_receiver
  on public.messages (receiver);

-- NOTIFICATIONS: faster load by recipient and time
create index if not exists idx_notifications_recipient
  on public.notifications (recipient);
create index if not exists idx_notifications_timestamp
  on public.notifications (timestamp);

-- HEARTS: faster sync for sent/received
create index if not exists idx_hearts_sender
  on public.hearts (sender);
create index if not exists idx_hearts_target
  on public.hearts (target);

-- SKIPS: faster sync
create index if not exists idx_skips_sender
  on public.skips (sender);
create index if not exists idx_skips_target
  on public.skips (target);

-- POSTS: faster feed and profile-post lookups
create index if not exists idx_posts_wallet_address
  on public.posts (wallet_address);
create index if not exists idx_posts_timestamp
  on public.posts (timestamp);

-- POST_VOTES: used when loading engagement
create index if not exists idx_post_votes_post_id
  on public.post_votes (post_id);

-- COMMENTS: used when loading posts with comments
create index if not exists idx_comments_post_id
  on public.comments (post_id);

-- =============================================================================
-- Optional: ensure messages table allows upsert by id (your schema already has
-- id uuid primary key, so no change needed). If you ever need a default for id:
--   id uuid primary key default gen_random_uuid()
-- The app sends id from the client (crypto.randomUUID()), so default is optional.
-- =============================================================================
