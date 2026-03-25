import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('TURSO_DATABASE_URL is not set');
  process.exit(1);
}

if (!authToken) {
  console.error('TURSO_AUTH_TOKEN is not set');
  process.exit(1);
}

const db = createClient({
  url,
  authToken,
});

async function main() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      post_id TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      text TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by_user_id INTEGER
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_comments_post_id_created_at
    ON comments(post_id, created_at)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      discussion_payload TEXT NOT NULL UNIQUE,
      comment_count INTEGER NOT NULL DEFAULT 0,
      channel_message_id TEXT,
      channel_post_url TEXT,
      published_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_posts_public_id
    ON posts(public_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by_user_id INTEGER NOT NULL,
      created_by_user_name TEXT NOT NULL,
      text TEXT,
      quote_text TEXT,
      quote_author TEXT,
      source_message_id TEXT,
      source_chat_type TEXT,
      source_chat_id TEXT,
      raw_update_json TEXT NOT NULL,
      raw_message_json TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_post_id TEXT,
      deleted_at TEXT,
      scheduled_for TEXT,
      last_error TEXT
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_drafts_public_id
    ON drafts(public_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_drafts_status_created_at
    ON drafts(status, created_at)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS draft_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_user_name TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_draft_events_draft_id_created_at
    ON draft_events(draft_id, created_at)
  `);

  const result = await db.execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `);

  console.log('Tables in database:');
  for (const row of result.rows) {
    console.log('-', row.name);
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('Failed to initialize Turso DB');
  console.error(error);
  process.exit(1);
});