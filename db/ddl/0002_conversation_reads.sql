CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- 取得系の補助
CREATE INDEX IF NOT EXISTS conversation_reads_by_user_idx
  ON conversation_reads (user_id);
