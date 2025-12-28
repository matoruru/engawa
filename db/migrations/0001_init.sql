-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- users
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username text UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- conversation_members
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- messages
CREATE TABLE IF NOT EXISTS messages (
  message_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_message_id uuid NOT NULL,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL
);

-- 再送重複排除
CREATE UNIQUE INDEX IF NOT EXISTS messages_dedupe_uq
  ON messages (conversation_id, sender_id, client_message_id);

-- sync 用（conversation + message_id で範囲スキャン）
CREATE INDEX IF NOT EXISTS messages_by_conversation_message_id_idx
  ON messages (conversation_id, message_id);
