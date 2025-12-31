-- migrate:up
ALTER TABLE conversations
ADD COLUMN title TEXT NULL;

-- migrate:down
ALTER TABLE conversations
DROP COLUMN title;
