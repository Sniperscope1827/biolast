ALTER TABLE users ALTER COLUMN stashSlots SET DEFAULT 100;
UPDATE users SET stashSlots = 100;
