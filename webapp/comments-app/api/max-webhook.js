import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

function safeStringify(value, fallback = '{}') {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
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

function escapeMarkdown(value) {
  return String(value || '').replace(/([\\_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
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

function parseAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function summarizeAttachments(attachments) {
  const counts = new Map();

  for (const item of attachments) {
    const type = item?.type || 'unknown';
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  if (counts.size === 0) {
    return {
      total: 0,
      line: 'нет',
    };
  }

  const parts = Array.from(counts.entries()).map(([type, count]) => `${type} ×${count}`);

  return {
    total: attachments.length,
    line: parts.join(', '),
  };
}

function normalizeOutgoingAttachments(rawAttachments) {
  const result = [];

  for (const item of rawAttachments) {
    if (!item || typeof item !== 'object') continue;

    const type = item.type;
    const payload = item.payload;

    if (!type || !payload) continue;

    // MAX официально поддерживает эти типы для отправки
    if (type === 'image' || type === 'video' || type === 'audio' || type === 'file') {
      result.push({
        type,
        payload,
      });
    }
  }

  return result;
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

async function deleteMessage(messageId) {
  const response = await fetch(
    `https://platform-api.max.ru/messages?message_id=${encodeURIComponent(messageId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: process.env.BOT_TOKEN,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`deleteMessage failed: ${response.status} ${text}`);
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

function buildPublishedKeyboard(channelPostUrl) {
  if (!channelPostUrl) {
    return [];
  }

  return [
    {
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            {
              type: 'link',
              text: 'Ссылка',
              url: channelPostUrl,
            },
          ],
        ],
      },
    },
  ];
}

function formatDraftPreview(draft) {
  const text = draft.text
    ? escapeMarkdown(draft.text)
    : '_Текст отсутствует\\. Возможно, в сообщении только вложения\\._';

  const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];
  const summary = summarizeAttachments(attachments);

  return [
    '**Черновик зарегистрирован**',
    `**Номер:** ${escapeMarkdown(draft.publicId)}`,
    '',
    '**Предпросмотр поста:**',
    '',
    text,
    '',
    `**Вложения:** ${summary.total}`,
    `**Типы:** ${escapeMarkdown(summary.line)}`,
  ].join('\n');
}

function formatPublishedDraftCard(draft, publishedPost) {
  const lines = [
    '**Пост опубликован**',
    `**Черновик:** ${escapeMarkdown(draft.publicId)}`,
    publishedPost?.publicId ? `**Пост:** ${escapeMarkdown(publishedPost.publicId)}` : '',
    '',
    draft.text ? escapeMarkdown(draft.text) : '_Без текста_',
  ].filter(Boolean);

  if (!publishedPost?.channelPostUrl) {
    lines.push('', '_Ссылка на пост не вернулась от API\\._');
  }

  return lines.join('\n');
}

function formatDeletedDraftCard(draft) {
  return [
    '**Черновик удалён**',
    `**Номер:** ${escapeMarkdown(draft.publicId)}`,
  ].join('\n');
}

function formatAppealForOperators(appeal) {
  return [
    '**Новое обращение**',
    '',
    `**Номер:** ${escapeMarkdown(appeal.publicId)}`,
    `**Пользователь:** ${escapeMarkdown(appeal.userName)}`,
    '',
    escapeMarkdown(appeal.text),
  ].join('\n');
}


function buildUserStartKeyboard() {
  const channelUrl = process.env.CHANNEL_PUBLIC_URL;
  const vkUrl = process.env.VK_GROUP_URL;

  const firstRow = [
    {
      type: 'message',
      text: 'Оставить обращение',
    },
  ];

  const secondRow = [];

  if (channelUrl) {
    secondRow.push({
      type: 'link',
      text: 'Канал MAX',
      url: channelUrl,
    });
  }

  if (vkUrl) {
    secondRow.push({
      type: 'link',
      text: 'Группа VK',
      url: vkUrl,
    });
  }

  return [
    {
      type: 'inline_keyboard',
      payload: {
        buttons: [firstRow, secondRow].filter((row) => row.length > 0),
      },
    },
  ];
}

function buildUserStartText() {
  return [
    'Здравствуйте.',
    '',
    'Это официальный бот для обращений и связи с подписчиками.',
    '',
    'Здесь вы можете:',
    '- оставить обращение',
    '- перейти в официальный канал MAX',
    '- перейти в группу ВКонтакте',
    '',
    'Обсуждение новостей доступно под публикациями в канале.',
  ].join('\n');
}



function buildAppealPromptText() {
  return [
    'Напишите текст обращения одним сообщением.',
    '',
    'Постарайтесь кратко и по существу описать вопрос.',
  ].join('\n');
}




async function setDraftCardMessageId(draftId, messageId) {
  await db.execute({
    sql: `
      UPDATE drafts
      SET
        draft_card_message_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE public_id = ?
    `,
    args: [messageId, draftId],
  });
}

async function setDraftLastError(draftId, errorText) {
  await db.execute({
    sql: `
      UPDATE drafts
      SET
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE public_id = ?
    `,
    args: [String(errorText || ''), draftId],
  });
}

async function clearDraftLastError(draftId) {
  await db.execute({
    sql: `
      UPDATE drafts
      SET
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE public_id = ?
    `,
    args: [draftId],
  });
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
      safeStringify(update, '{}'),
      safeStringify(message, '{}'),
      safeStringify(attachments, '[]'),
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
      safeStringify({
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
        deleted_at,
        draft_card_message_id,
        last_error
      FROM drafts
      WHERE public_id = ?
      LIMIT 1
    `,
    args: [draftId],
  });

  const row = result.rows[0];
  if (!row) return null;

  return {
    publicId: row.public_id,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdByUserName: row.created_by_user_name,
    text: row.text || '',
    quoteText: row.quote_text || '',
    quoteAuthor: row.quote_author || '',
    attachments: parseAttachments(row.attachments_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedPostId: row.published_post_id || null,
    deletedAt: row.deleted_at || null,
    draftCardMessageId: row.draft_card_message_id || null,
    lastError: row.last_error || null,
  };
}

async function markDraftDeleted(draftId, actor) {
  await db.execute({
    sql: `
      UPDATE drafts
      SET
        status = 'deleted',
        deleted_at = CURRENT_TIMESTAMP,
        last_error = NULL,
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

  const mediaAttachments = normalizeOutgoingAttachments(draft.attachments);

  if (!draft.text && mediaAttachments.length === 0) {
    throw new Error('Draft has no text and no publishable attachments');
  }

  const outgoingAttachments = [
    ...mediaAttachments,
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
  ];

  let channelResponse;

  try {
    channelResponse = await sendMessageToChat(process.env.CHANNEL_CHAT_ID, {
      text: draft.text || '',
      attachments: outgoingAttachments,
    });
  } catch (error) {
    await setDraftLastError(draft.publicId, error?.message || String(error));
    throw error;
  }

  const channelMessageId = channelResponse?.message?.body?.mid || null;
  const channelPostUrl = channelResponse?.message?.url || null;
  const publishedAt = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO posts (
        public_id,
        discussion_payload,
        comment_count,
        media_attachments_json,
        channel_message_id,
        channel_post_url,
        published_at
      )
      VALUES (?, ?, 0, ?, ?, ?, ?)
    `,
    args: [
      postId,
      discussionPayload,
      safeStringify(mediaAttachments, '[]'),
      channelMessageId,
      channelPostUrl,
      publishedAt,
    ],
  });

  await db.execute({
    sql: `
      UPDATE drafts
      SET
        status = 'published',
        published_post_id = ?,
        last_error = NULL,
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
      safeStringify({
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


async function handleBotStarted(update, res) {
  const user = update.user || {};
  const userId = user.user_id;

  if (!userId) {
    return sendJson(res, 200, { ok: true, ignored: 'bot-started-without-user' });
  }

  if (isAdminUser(userId)) {
    await sendMessageToUser(userId, {
      text: [
        'Здравствуйте.',
        'Вы авторизованы как администратор.',
        '',
        'Обычное сообщение в личке боту создаёт черновик поста.',
      ].join('\n'),
    });

    return sendJson(res, 200, { ok: true, mode: 'admin-bot-started' });
  }

  await sendMessageToUser(userId, {
    text: buildUserStartText(),
    attachments: buildUserStartKeyboard(),
  });

  return sendJson(res, 200, { ok: true, mode: 'user-bot-started' });
}



async function handleMessageCreated(update, res) {
  const message = update.message || {};
  const recipient = message.recipient || {};
  const sender = message.sender || {};
  const body = message.body || {};
  const text = normalizeText(body.text || '');
  const attachments = body.attachments || [];

  // Только личные диалоги
  if (recipient.chat_type !== 'dialog') {
    return sendJson(res, 200, { ok: true, ignored: 'non-dialog' });
  }

  if (!sender || sender.is_bot) {
    return sendJson(res, 200, { ok: true, ignored: 'bot-or-missing-sender' });
  }

  if (text.startsWith('/start')) {
    if (isAdminUser(sender.user_id)) {
      await sendMessageToUser(sender.user_id, {
        text: [
          'Здравствуйте.',
          'Вы авторизованы как администратор.',
          '',
          'Обычное сообщение в личке боту создаёт черновик поста.',
        ].join('\n'),
      });

      return sendJson(res, 200, { ok: true, mode: 'admin-start' });
    }

  await sendMessageToUser(sender.user_id, {
    text: buildUserStartText(),
    attachments: buildUserStartKeyboard(),
  });

  return sendJson(res, 200, { ok: true, mode: 'user-start' });
}

  if (text.startsWith('/help')) {
    if (isAdminUser(sender.user_id)) {
      await sendMessageToUser(sender.user_id, {
        text: [
          'Памятка для администратора:',
          '- обычное сообщение создаёт черновик',
          '- далее можно опубликовать или удалить черновик',
        ].join('\n'),
      });

      return sendJson(res, 200, { ok: true, mode: 'admin-help' });
    }

    await sendMessageToUser(sender.user_id, {
      text: buildUserStartText(),
      attachments: buildUserStartKeyboard(),
    });

    return sendJson(res, 200, { ok: true, mode: 'user-help' });
  }

  if (!isAdminUser(sender.user_id) && text === 'Оставить обращение') {
    await sendMessageToUser(sender.user_id, {
      text: buildAppealPromptText(),
      attachments: buildUserStartKeyboard(),
    });

    return sendJson(res, 200, { ok: true, mode: 'appeal-prompt' });
  }


  // Другие slash-команды не превращаем ни в черновик, ни в обращение
  if (text.startsWith('/')) {
    return sendJson(res, 200, { ok: true, ignored: 'slash-command' });
  }

  // Админ -> черновик
  if (isAdminUser(sender.user_id)) {
    const draft = await saveDraft(update);

    const sent = await sendMessageToUser(sender.user_id, {
      text: formatDraftPreview(draft),
      format: 'markdown',
      attachments: buildDraftKeyboard(draft.publicId),
    });

    const draftCardMessageId = sent?.message?.body?.mid || null;
    if (draftCardMessageId) {
      await setDraftCardMessageId(draft.publicId, draftCardMessageId);
    }

    return sendJson(res, 200, { ok: true, mode: 'draft', draftId: draft.publicId });
  }

  // Не-админ -> обращение
  if (!text) {
    if (attachments.length > 0) {
      await sendMessageToUser(sender.user_id, {
        text: 'Пока обращения принимаются текстом. Добавьте текст к сообщению и отправьте снова.',
      });
      return sendJson(res, 200, { ok: true, ignored: 'empty-appeal-with-attachments' });
    }

    await sendMessageToUser(sender.user_id, {
      text: 'Пожалуйста, напишите текст обращения.',
    });

    return sendJson(res, 200, { ok: true, ignored: 'empty-appeal' });
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
  const payload = String(callback.payload ?? callback.data ?? '').trim();

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

  if (action === 'delete') {
    if (draft.status !== 'draft') {
      await answerCallback(callbackId, {
        notification: 'Черновик уже неактивен.',
      });

      return sendJson(res, 200, { ok: true });
    }

    await markDraftDeleted(draftId, sender);

    if (draft.draftCardMessageId) {
      try {
        await deleteMessage(draft.draftCardMessageId);

        await answerCallback(callbackId, {
          notification: 'Черновик удалён.',
        });

        return sendJson(res, 200, { ok: true, action: 'delete' });
      } catch (error) {
        console.error('Failed to delete draft card message', error);
      }
    }

    await answerCallback(callbackId, {
      notification: 'Черновик удалён.',
      message: {
        text: formatDeletedDraftCard(draft),
        format: 'markdown',
      },
    });

    return sendJson(res, 200, { ok: true, action: 'delete' });
  }

  if (action === 'publish') {
    if (draft.status !== 'draft') {
      await answerCallback(callbackId, {
        notification: 'Этот черновик уже опубликован или удалён.',
      });

      return sendJson(res, 200, { ok: true });
    }

    try {
      const publishedPost = await publishDraft(draft, sender);

      await answerCallback(callbackId, {
        notification: 'Пост опубликован.',
        message: {
          text: formatPublishedDraftCard(draft, publishedPost),
          format: 'markdown',
          attachments: buildPublishedKeyboard(publishedPost.channelPostUrl),
        },
      });

      return sendJson(res, 200, { ok: true, action: 'publish' });
    } catch (error) {
      console.error('Failed to publish draft', error);

      await setDraftLastError(draft.publicId, error?.message || String(error));

      await answerCallback(callbackId, {
        notification: 'Не удалось опубликовать пост.',
      });

      return sendJson(res, 200, {
        ok: true,
        action: 'publish-failed',
        error: String(error?.message || error),
      });
    }
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

    if (update.update_type === 'bot_started') {
      return await handleBotStarted(update, res);
    }

    return sendJson(res, 200, { ok: true, ignored: update.update_type || 'unknown-update' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}