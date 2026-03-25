import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const appeals = await db.execute(`
    SELECT
      user_id,
      user_name,
      MAX(created_at) AS last_seen,
      COUNT(*) AS messages_count
    FROM appeals
    GROUP BY user_id, user_name
    ORDER BY last_seen DESC
  `);

  console.log('Users from appeals:');
  for (const row of appeals.rows) {
    console.log(
      `user_id=${row.user_id} | name=${row.user_name} | last_seen=${row.last_seen} | messages=${row.messages_count}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});