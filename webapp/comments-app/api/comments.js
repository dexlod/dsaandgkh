import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

function buildCommentId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CMT-${Date.now()}-${rand}`;
}

function mapRow(row) {
  return {
    id: row.public_id,
    postId: row.post_id,
    userId: row.user_id ?? null,
    userName: row.user_name,
    text: row.text,
    isDeleted: Number(row.is_deleted) === 1,
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const postId = String(req.query.postId || '').trim();

      if (!postId) {
        return sendJson(res, 400, { error: 'postId is required' });
      }

      const result = await db.execute({
        sql: `
          SELECT
            public_id,
            post_id,
            user_id,
            user_name,
            text,
            is_deleted,
            created_at
          FROM comments
          WHERE post_id = ?
          ORDER BY created_at ASC
        `,
        args: [postId],
      });

      const comments = result.rows.map(mapRow);
      const visibleCount = comments.filter((item) => !item.isDeleted).length;

      return sendJson(res, 200, {
        postId,
        count: visibleCount,
        comments,
      });
    }

    if (req.method === 'POST') {
      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return sendJson(res, 400, { error: 'Invalid JSON body' });
        }
      }

      const postId = String(body?.postId || '').trim();
      const text = String(body?.text || '').trim();

      if (!postId) {
        return sendJson(res, 400, { error: 'postId is required' });
      }

      if (!text) {
        return sendJson(res, 400, { error: 'text is required' });
      }

      if (text.length > 1000) {
        return sendJson(res, 400, { error: 'text is too long' });
      }

      const publicId = buildCommentId();
      const userName = 'Пользователь';

      await db.execute({
        sql: `
          INSERT INTO comments (
            public_id,
            post_id,
            user_id,
            user_name,
            text,
            is_deleted
          )
          VALUES (?, ?, ?, ?, ?, 0)
        `,
        args: [publicId, postId, null, userName, text],
      });

      const inserted = await db.execute({
        sql: `
          SELECT
            public_id,
            post_id,
            user_id,
            user_name,
            text,
            is_deleted,
            created_at
          FROM comments
          WHERE public_id = ?
          LIMIT 1
        `,
        args: [publicId],
      });

      const comment = inserted.rows[0] ? mapRow(inserted.rows[0]) : null;

      return sendJson(res, 201, {
        ok: true,
        comment,
      });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}