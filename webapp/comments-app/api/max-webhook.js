import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

function isValidWebhookSecret(req) {
  const incoming = req.headers['x-max-bot-api-secret'];
  return incoming && incoming === process.env.MAX_WEBHOOK_SECRET;
}

function getAdminIds() {
  return String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function isAdminUser(userId) {
  return getAdminIds().includes(Number(userId));
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function extractDisplayName(sender) {
  if (!sender) return 'Unknown';

  const fullName = [sender.first_name, sender.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName) return fullName;
  if (sender.name) return sender.name;
  if (sender.username) return sender.username;

  return `user_${sender.user_id}`;
}

function buildDraftId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DRF-${Date.now()}-${rand}`;
}

function buildPostId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PST-${Date.now()}-${rand}`;
}

function buildAppealId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `APR-${Date.now()}-${rand}`;
}

function buildDiscussionPayload(postId) {
  return `post-${postId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
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

async function sendMessageToUser(userId, body) {
  const response = await fetch(
    `https://platform-api.max.ru/messages?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: process.env.BOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`sendMessageToUser failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function sendMessageToChat(chatId, body) {
  const response = await fetch(
    `https://platform-api.max.ru/messages?chat_id=${encodeURIComponent(chatId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: process.env.BOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`sendMessageToChat failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function answerCallback(callbackId, payload) {
  const response = await fetch(
    `https://platform-api.max.ru/answers?callback_id=${encodeURIComponent(callbackId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: process.env.BOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`answerCallback failed: ${response.status} ${text}`);
  }

  return response.json();
}

function buildDraftKeyboard(draftId) {
  return [
    {
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            {
              type: 'callback',
              text: 'Опубликовать',
              payload: `draft:publish:${draftId}`,
            },
          ],
          [
            {
              type: 'callback',
              text: 'Редактировать',
              payload: `draft:edit:${draftId}`,
            },
            {
              type: 'callback',
              text: 'Удалить',
              payload: `draft:delete:${draftId}`,
            },
          ],
        ],
      },
    },
  ];
}

function formatDraftPreview(draft) {
  const text = draft.text
    ? draft.text
    : '_Текст отсутствует. Возможно, в сообщении только вложения._';

  const attachmentsCount = Array.isArray(draft.attachments) ? draft.attachments.length : 0;
  const attachmentsLine = attachmentsCount > 0 ? `\n\n_Вложения: ${attachmentsCount}_` : '';

  return [
    '**Черновик зарегистрирован**',
    `**Номер:** ${draft.publicId}`,
    '',
    '**Предпросмотр поста:**',
    '',
    `${text}${attachmentsLine}`,
  ].join('\n');
}

function formatPublishedDraftCard(draft, publishedPost) {
  return [
    '**Пост опубликован**',
    `**Черновик:** ${draft.publicId}`,
    `**Пост:** ${publishedPost.publicId}`,
    publishedPost.channelPostUrl ? `**Ссылка:** ${publishedPost.channelPostUrl}` : '',
    '',
    '**Текст:**',
    draft.text || '_Без текста_',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatDeletedDraftCard(draft) {
  return [
    '**Черновик удалён**',
    `**Номер:** ${draft.publicId}`,
    '',
    draft.text || '_Без текста_',
  ].join('\n');
}

function formatAppealForOperators(appeal) {
  return [
    '**Новое обращение**',
    '',
    `**Номер:** ${appeal.publicId}`,
    `**Пользователь:** ${appeal.userName}`,
    '',
    appeal.text,
  ].join('\n');
}

async function saveDraft(update) {
  const message = update.message || {};
  const sender = message.sender || {};
  const recipient = message.recipient || {};
  const body = message.body || {};

  const publicId = buildDraftId();
  const text = normalizeText(body.text || '');
  const attachments = body.attachments || [];

  await db.execute({
    sql: `
      INSERT INTO drafts (
        public_id,
        status,
        created_by_user_id,
        created_by_user_name,
        text,
        quote_text,
        quote_author,
        source_message_id,
        source_chat_type,
        source_chat_id,
        raw_update_json,
        raw_message_json,
        attachments_json
      )
      VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      publicId,
      sender.user_id,
      extractDisplayName(sender),
      text || null,
      null,
      null,
      body.mid || null,
      recipient.chat_type || null,
      recipient.chat_id != null ? String(recipient.chat_id) : null,
      JSON.stringify(update),
      JSON.stringify(message),
      JSON.stringify(attachments),
    ],
  });

  await db.execute({
    sql: `
      INSERT INTO draft_events (
        draft_id,
        event_type,
        actor_user_id,
        actor_user_name,
        payload_json
      )
      VALUES (?, 'created', ?, ?, ?)
    `,
    args: [
      publicId,
      sender.user_id,
      extractDisplayName(sender),
      JSON.stringify({
        sourceMessageId: body.mid || null,
      }),
    ],
  });

  return {
    publicId,
    createdByUserId: sender.user_id,
    createdByUserName: extractDisplayName(sender),
    text,
    attachments,
  };
}

async function saveAppeal(update) {
  const message = update.message || {};
  const sender = message.sender || {};
  const body = message.body || {};

  const publicId = buildAppealId();
  const text = normalizeText(body.text || '');

  await db.execute({
    sql: `
      INSERT INTO appeals (
        public_id,
        status,
        user_id,
        user_name,
        text,
        created_at
      )
      VALUES (?, 'NEW', ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    args: [publicId, sender.user_id, extractDisplayName(sender), text],
  });

  return {
    publicId,
    userId: sender.user_id,
    userName: extractDisplayName(sender),
    text,
  };
}

async function getDraftById(draftId) {
  const result = await db.execute({
    sql: `
      SELECT
        public_id,
        status,
        created_by_user_id,
        created_by_user_name,
        text,
        quote_text,
        quote_author,
        attachments_json,
        created_at,
        updated_at,
        published_post_id,
        deleted_at
      FROM drafts
      WHERE public_id = ?
      LIMIT 1
    `,
    args: [draftId],
  });

  const row = result.rows[0];
  if (!row) return null;

  let attachments = [];
  try {
    attachments = JSON.parse(row.attachments_json || '[]');
  } catch {
    attachments = [];
  }

  return {
    publicId: row.public_id,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdByUserName: row.created_by_user_name,
    text: row.text || '',
    quoteText: row.quote_text || '',
    quoteAuthor: row.quote_author || '',
    attachments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedPostId: row.published_post_id || null,
    deletedAt: row.deleted_at || null,
  };
}

async function setAdminEditState(userId, userName, draftId) {
  await db.execute({
    sql: `
      INSERT INTO admin_states (
        user_id,
        user_name,
        mode,
        draft_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'edit_draft', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        user_name = excluded.user_name,
        mode = excluded.mode,
        draft_id = excluded.draft_id,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [userId, userName, draftId],
  });
}

async function clearAdminState(userId) {
  await db.execute({
    sql: `DELETE FROM admin_states WHERE user_id = ?`,
    args: [userId],
  });
}

async function getAdminState(userId) {
  const result = await db.execute({
    sql: `
      SELECT user_id, user_name, mode, draft_id, created_at, updated_at
      FROM admin_states
      WHERE user_id = ?
      LIMIT 1
    `,
    args: [userId],
  });

  return result.rows[0] || null;
}

async function updateDraftText(draftId, actor, newText, update) {
  const message = update.message || {};
  const body = message.body || {};

  await db.execute({
    sql: `
      UPDATE drafts
      SET
        text = ?,
        raw_update_json = ?,
        raw_message_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE public_id = ?
        AND status = 'draft'
    `,
    args: [
      newText,
      JSON.stringify(update),
      JSON.stringify(message),
      draftId,
    ],
  });

  await db.execute({
    sql: `
      INSERT INTO draft_events (
        draft_id,
        event_type,
        actor_user_id,
        actor_user_name,
        payload_json
      )
      VALUES (?, 'edited', ?, ?, ?)
    `,
    args: [
      draftId,
      actor.user_id,
      extractDisplayName(actor),
      JSON.stringify({
        sourceMessageId: body.mid || null,
      }),
    ],
  });
}

async function markDraftDeleted(draftId, actor) {
  await db.execute({
    sql: `
      UPDATE drafts
      SET
        status = 'deleted',
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE public_id = ?
        AND status = 'draft'
    `,
    args: [draftId],
  });

  await db.execute({
    sql: `
      INSERT INTO draft_events (
        draft_id,
        event_type,
        actor_user_id,
        actor_user_name,
        payload_json
      )
      VALUES (?, 'deleted', ?, ?, '{}')
    `,
    args: [
      draftId,
      actor.user_id,
      extractDisplayName(actor),
    ],
  });
}

async function publishDraft(draft, actor) {
  const postId = buildPostId();
  const discussionPayload = buildDiscussionPayload(postId);

  const channelResponse = await sendMessageToChat(process.env.CHANNEL_CHAT_ID, {
    text: draft.text || '',
    format: 'markdown',
    attachments: [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [
              {
                type: 'link',
                text: formatCommentsButtonText(0),
                url: `https://max.ru/${process.env.BOT_USERNAME}?startapp=${discussionPayload}`,
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
  });

  const channelMessageId = channelResponse?.message?.body?.mid || null;
  const channelPostUrl = channelResponse?.message?.url || null;
  const publishedAt = new Date().toISOString();

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
    `,
    args: [postId, discussionPayload, channelMessageId, channelPostUrl, publishedAt],
  });

  await db.execute({
    sql: `
      UPDATE drafts
      SET
        status = 'published',
        published_post_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE public_id = ?
        AND status = 'draft'
    `,
    args: [postId, draft.publicId],
  });

  await db.execute({
    sql: `
      INSERT INTO draft_events (
        draft_id,
        event_type,
        actor_user_id,
        actor_user_name,
        payload_json
      )
      VALUES (?, 'published', ?, ?, ?)
    `,
    args: [
      draft.publicId,
      actor.user_id,
      extractDisplayName(actor),
      JSON.stringify({
        postId,
        channelMessageId,
        channelPostUrl,
      }),
    ],
  });

  return {
    publicId: postId,
    discussionPayload,
    channelMessageId,
    channelPostUrl,
    publishedAt,
  };
}

async function handleMessageCreated(update, res) {
  const message = update.message || {};
  const recipient = message.recipient || {};
  const sender = message.sender || {};
  const body = message.body || {};
  const text = normalizeText(body.text || '');

  if (recipient.chat_type !== 'dialog') {
    return sendJson(res, 200, { ok: true, ignored: 'non-dialog' });
  }

  if (!sender || sender.is_bot) {
    return sendJson(res, 200, { ok: true, ignored: 'bot-or-missing-sender' });
  }

  if (text.startsWith('/start')) {
    await sendMessageToUser(sender.user_id, {
      text: [
        'Здравствуйте.',
        'Это бот для обращений и редакционной работы.',
        '',
        'Админ: любое обычное сообщение создаёт черновик.',
        'Пользователь: обычное сообщение создаёт обращение.',
      ].join('\n'),
    });

    return sendJson(res, 200, { ok: true });
  }

  if (text.startsWith('/help')) {
    await sendMessageToUser(sender.user_id, {
      text: [
        'Памятка:',
        '— админ: отправляет обычное сообщение и получает черновик',
        '— пользователь: отправляет обычное сообщение и получает номер обращения',
      ].join('\n'),
    });

    return sendJson(res, 200, { ok: true });
  }

  if (text.startsWith('/')) {
    return sendJson(res, 200, { ok: true, ignored: 'slash-command' });
  }

  if (isAdminUser(sender.user_id)) {
    const adminState = await getAdminState(sender.user_id);

    if (adminState && adminState.mode === 'edit_draft' && adminState.draft_id) {
      await updateDraftText(adminState.draft_id, sender, text, update);
      await clearAdminState(sender.user_id);

      const updatedDraft = await getDraftById(adminState.draft_id);

      await sendMessageToUser(sender.user_id, {
        text: [
          '**Черновик обновлён**',
          '',
          formatDraftPreview(updatedDraft),
        ].join('\n'),
        format: 'markdown',
        attachments: buildDraftKeyboard(adminState.draft_id),
      });

      return sendJson(res, 200, {
        ok: true,
        mode: 'draft-edited',
        draftId: adminState.draft_id,
      });
    }

    const draft = await saveDraft(update);

    await sendMessageToUser(sender.user_id, {
      text: formatDraftPreview(draft),
      format: 'markdown',
      attachments: buildDraftKeyboard(draft.publicId),
    });

    return sendJson(res, 200, { ok: true, mode: 'draft', draftId: draft.publicId });
  }

  const appeal = await saveAppeal(update);

  try {
    await sendMessageToChat(process.env.OPERATORS_CHAT_ID, {
      text: formatAppealForOperators(appeal),
      format: 'markdown',
    });
  } catch (error) {
    console.error('Failed to forward appeal to operators chat', error);
  }

  await sendMessageToUser(sender.user_id, {
    text: [
      'Ваше обращение принято.',
      `Номер обращения: ${appeal.publicId}`,
      'Сохраните этот номер.',
    ].join('\n'),
  });

  return sendJson(res, 200, { ok: true, mode: 'appeal', appealId: appeal.publicId });
}

async function handleMessageCallback(update, res) {
  const callback = update.callback || {};
  const callbackId = callback.callback_id;
  const sender = callback.user || callback.sender || {};
  const payload = String(callback.payload || '').trim();

  if (!callbackId || !payload) {
    return sendJson(res, 200, { ok: true, ignored: 'empty-callback' });
  }

  if (!isAdminUser(sender.user_id)) {
    await answerCallback(callbackId, {
      notification: 'Действие недоступно.',
    });

    return sendJson(res, 200, { ok: true, ignored: 'not-admin' });
  }

  const parts = payload.split(':');
  const entity = parts[0];
  const action = parts[1];
  const draftId = parts[2];

  if (entity !== 'draft' || !action || !draftId) {
    await answerCallback(callbackId, {
      notification: 'Неизвестное действие.',
    });

    return sendJson(res, 200, { ok: true, ignored: 'unknown-payload' });
  }

  const draft = await getDraftById(draftId);

  if (!draft) {
    await answerCallback(callbackId, {
      notification: 'Черновик не найден.',
    });

    return sendJson(res, 200, { ok: true, ignored: 'draft-not-found' });
  }

  if (action === 'edit') {
    if (draft.status !== 'draft') {
      await answerCallback(callbackId, {
        notification: 'Редактировать можно только черновик.',
      });

      return sendJson(res, 200, { ok: true });
    }

    await setAdminEditState(sender.user_id, extractDisplayName(sender), draftId);

    await answerCallback(callbackId, {
      notification: 'Пришлите следующим сообщением новый текст черновика.',
      message: {
        text: [
          formatDraftPreview(draft),
          '',
          '_Режим редактирования включён. Следующее обычное сообщение заменит текст черновика._',
        ].join('\n'),
        format: 'markdown',
        attachments: buildDraftKeyboard(draftId),
      },
    });

    return sendJson(res, 200, { ok: true, action: 'edit' });
  }

  if (action === 'delete') {
    if (draft.status !== 'draft') {
      await answerCallback(callbackId, {
        notification: 'Удалить можно только черновик.',
      });

      return sendJson(res, 200, { ok: true });
    }

    await markDraftDeleted(draftId, sender);
    await clearAdminState(sender.user_id);

    const deletedDraft = await getDraftById(draftId);

    await answerCallback(callbackId, {
      notification: 'Черновик удалён.',
      message: {
        text: formatDeletedDraftCard(deletedDraft),
        format: 'markdown',
      },
    });

    return sendJson(res, 200, { ok: true, action: 'delete' });
  }

  if (action === 'publish') {
    if (draft.status !== 'draft') {
      await answerCallback(callbackId, {
        notification: 'Опубликовать можно только черновик.',
      });

      return sendJson(res, 200, { ok: true });
    }

    const publishedPost = await publishDraft(draft, sender);
    await clearAdminState(sender.user_id);

    const publishedDraft = await getDraftById(draftId);

    await answerCallback(callbackId, {
      notification: 'Пост опубликован.',
      message: {
        text: formatPublishedDraftCard(publishedDraft, publishedPost),
        format: 'markdown',
      },
    });

    return sendJson(res, 200, { ok: true, action: 'publish' });
  }

  await answerCallback(callbackId, {
    notification: 'Действие не поддерживается.',
  });

  return sendJson(res, 200, { ok: true, ignored: 'unsupported-action' });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    if (!isValidWebhookSecret(req)) {
      return sendJson(res, 401, { error: 'Invalid webhook secret' });
    }

    const update = req.body;

    if (!update) {
      return sendJson(res, 200, { ok: true, ignored: 'empty-body' });
    }

    if (update.update_type === 'message_created') {
      return await handleMessageCreated(update, res);
    }

    if (update.update_type === 'message_callback') {
      return await handleMessageCallback(update, res);
    }

    return sendJson(res, 200, { ok: true, ignored: update.update_type || 'unknown-update' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}