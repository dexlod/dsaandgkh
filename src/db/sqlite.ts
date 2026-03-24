import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { env } from '../config/env.js';

export const dbFilePath = path.resolve(env.DATABASE_PATH);

mkdirSync(path.dirname(dbFilePath), { recursive: true });

export const db = new DatabaseSync(dbFilePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_appeals_public_id
    ON appeals(public_id);

  CREATE INDEX IF NOT EXISTS idx_appeals_created_at
    ON appeals(created_at);

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    discussion_payload TEXT NOT NULL UNIQUE,
    comment_count INTEGER NOT NULL DEFAULT 0,
    channel_message_id TEXT,
    channel_post_url TEXT,
    created_by_user_id INTEGER NOT NULL,
    created_by_user_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    published_at TEXT
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_posts_public_id
    ON posts(public_id);

  CREATE INDEX IF NOT EXISTS idx_posts_discussion_payload
    ON posts(discussion_payload);

  CREATE INDEX IF NOT EXISTS idx_posts_created_at
    ON posts(created_at);

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    post_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    text TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by_user_id INTEGER
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_comments_public_id
    ON comments(public_id);

  CREATE INDEX IF NOT EXISTS idx_comments_post_id
    ON comments(post_id);

  CREATE INDEX IF NOT EXISTS idx_comments_created_at
    ON comments(created_at);
`);

// Для уже существующей базы: если колонка comment_count ещё не была создана,
// эта команда тихо добавит её. Если уже есть — просто будет ошибка, которую игнорируем.
try {
  db.exec(`
    ALTER TABLE posts
    ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0
  `);
} catch {
  // Колонка уже существует — это нормально.
}