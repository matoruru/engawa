-- migrate:up
ALTER TABLE users ADD COLUMN avatar_url TEXT NULL;

-- migrate:down
ALTER TABLE users DROP COLUMN avatar_url;

