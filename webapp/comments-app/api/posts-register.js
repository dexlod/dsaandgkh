import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

function isAuthorized(req) {
  const incoming = req.headers['x-internal-api-key'];
  return incoming && incoming === process.env.INTERNAL_API_KEY;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    if (!isAuthorized(req)) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }

    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON body' });
      }
    }

    const publicId = String(body?.publicId || '').trim();
    const discussionPayload = String(body?.discussionPayload || '').trim();
    const channelMessageId = String(body?.channelMessageId || '').trim();
    const channelPostUrl = String(body?.channelPostUrl || '').trim();
    const publishedAt = String(body?.publishedAt || '').trim();

    if (!publicId || !discussionPayload || !channelMessageId || !publishedAt) {
      return sendJson(res, 400, {
        error: 'publicId, discussionPayload, channelMessageId, publishedAt are required',
      });
    }

    await db.execute({
      sql: `
        INSERT INTO posts (
          public_id,
          discussion_payload,
          comment_count,
          channel_message_id,
          channel_post_url,
          published_at
        )
        VALUES (?, ?, 0, ?, ?, ?)
        ON CONFLICT(public_id) DO UPDATE SET
          discussion_payload = excluded.discussion_payload,
          channel_message_id = excluded.channel_message_id,
          channel_post_url = excluded.channel_post_url,
          published_at = excluded.published_at
      `,
      args: [publicId, discussionPayload, channelMessageId, channelPostUrl || null, publishedAt],
    });

    return sendJson(res, 200, {
      ok: true,
      publicId,
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}