-- migrate:up
CREATE TABLE friendships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id != friend_id)
);

CREATE INDEX friendships_user_id_idx ON friendships(user_id);
CREATE INDEX friendships_friend_id_idx ON friendships(friend_id);

CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL,
  accepted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX invites_inviter_id_idx ON invites(inviter_id);
CREATE INDEX invites_token_idx ON invites(token);

-- migrate:down
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS friendships;

