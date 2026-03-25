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

function formatCommentsButtonText(count) {
  const normalized = Math.abs(count) % 100;
  const lastDigit = normalized % 10;

  let word = 'комментариев';

  if (normalized < 11 || normalized > 14) {
    if (lastDigit === 1) {
      word = 'комментарий';
    } else if (lastDigit >= 2 && lastDigit <= 4) {
      word = 'комментария';
    }
  }

  return `💬 ${count} ${word} →`;
}

function buildDiscussionLink() {
  return `https://max.ru/${process.env.BOT_USERNAME}?startapp=`;
}

function isEditableWithin24h(publishedAt) {
  const published = new Date(publishedAt).getTime();
  const now = Date.now();
  const diffMs = now - published;
  return diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
}

async function updateChannelCommentButton(post) {
  if (!post?.channel_message_id) {
    return { ok: false, reason: 'no_channel_message_id' };
  }

  if (!post?.published_at || !isEditableWithin24h(post.published_at)) {
    return { ok: false, reason: 'older_than_24h' };
  }

  const response = await fetch(
    `https://platform-api.max.ru/messages?message_id=${encodeURIComponent(post.channel_message_id)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: process.env.BOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  {
                    type: 'link',
                    text: formatCommentsButtonText(post.comment_count),
                    url: `${buildDiscussionLink()}${post.discussion_payload}`,
                  },
                ],
                [
                  {
                    type: 'link',
                    text: '✅ Обращение',
                    url: `https://max.ru/${process.env.BOT_USERNAME}`,
                  },
                ],
              ],
            },
          },
        ],
        notify: false,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error('Failed to update channel message:', text);
    return { ok: false, reason: `http_${response.status}` };
  }

  return { ok: true };
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

      const countResult = await db.execute({
        sql: `
          SELECT COUNT(*) AS total
          FROM comments
          WHERE post_id = ?
            AND is_deleted = 0
        `,
        args: [postId],
      });

      const commentCount = Number(countResult.rows[0]?.total ?? 0);

      await db.execute({
        sql: `
          UPDATE posts
          SET comment_count = ?
          WHERE public_id = ?
        `,
        args: [commentCount, postId],
      });

      const postResult = await db.execute({
        sql: `
          SELECT
            public_id,
            discussion_payload,
            comment_count,
            channel_message_id,
            channel_post_url,
            published_at
          FROM posts
          WHERE public_id = ?
          LIMIT 1
        `,
        args: [postId],
      });

      const post = postResult.rows[0] || null;

      let syncResult = null;
      if (post) {
        syncResult = await updateChannelCommentButton(post);
      }

      return sendJson(res, 201, {
        ok: true,
        comment,
        count: commentCount,
        sync: syncResult,
      });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}