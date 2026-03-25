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

function buildDraftId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DRF-${Date.now()}-${rand}`;
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

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
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

function formatDraftCard(draft) {
  const hasText = draft.text ? 'да' : 'нет';
  const attachments = Array.isArray(draft.attachments) ? draft.attachments.length : 0;
  const quote = draft.quoteText ? 'да' : 'нет';

  return [
    `**Черновик зарегистрирован**`,
    ``,
    `**Номер:** ${draft.publicId}`,
    `**Автор:** ${draft.createdByUserName}`,
    `**Текст:** ${hasText}`,
    `**Вложений:** ${attachments}`,
    `**Цитата:** ${quote}`,
    ``,
    `Далее добавим кнопки действий: опубликовать, редактировать, удалить.`,
  ].join('\n');
}

function formatAppealForOperators(appeal) {
  return [
    `**Новое обращение**`,
    ``,
    `**Номер:** ${appeal.publicId}`,
    `**Пользователь:** ${appeal.userName}`,
    ``,
    appeal.text,
  ].join('\n');
}

function buildAppealId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `APR-${Date.now()}-${rand}`;
}

async function saveDraft(update) {
  const message = update.message || {};
  const sender = message.sender || {};
  const recipient = message.recipient || {};
  const body = message.body || {};

  const publicId = buildDraftId();
  const text = normalizeText(body.text || '');
  const attachments = body.attachments || [];
  const quoteText = '';
  const quoteAuthor = '';

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
      quoteText || null,
      quoteAuthor || null,
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
    quoteText,
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
    args: [
      publicId,
      sender.user_id,
      extractDisplayName(sender),
      text,
    ],
  });

  return {
    publicId,
    userId: sender.user_id,
    userName: extractDisplayName(sender),
    text,
  };
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

    // MAX ждёт быстрый 200, но на Vercel мы пока делаем логику в одном запросе.
    if (!update || update.update_type !== 'message_created') {
      return sendJson(res, 200, { ok: true, ignored: true });
    }

    const message = update.message || {};
    const recipient = message.recipient || {};
    const sender = message.sender || {};
    const body = message.body || {};
    const text = normalizeText(body.text || '');

    // Берём в работу только личные диалоги с ботом
    if (recipient.chat_type !== 'dialog') {
      return sendJson(res, 200, { ok: true, ignored: 'non-dialog' });
    }

    if (!sender || sender.is_bot) {
      return sendJson(res, 200, { ok: true, ignored: 'bot-or-missing-sender' });
    }

    // Команды пока не превращаем в черновики
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

    // Любые другие slash-команды пока молча игнорируем
    if (text.startsWith('/')) {
      return sendJson(res, 200, { ok: true, ignored: 'slash-command' });
    }

    // Админ -> черновик
    if (isAdminUser(sender.user_id)) {
      const draft = await saveDraft(update);

      await sendMessageToUser(sender.user_id, {
        text: formatDraftCard(draft),
        format: 'markdown',
      });

      return sendJson(res, 200, { ok: true, mode: 'draft', draftId: draft.publicId });
    }

    // Не-админ -> обращение
    const appeal = await saveAppeal(update);

    await sendMessageToChat(process.env.OPERATORS_CHAT_ID, {
      text: formatAppealForOperators(appeal),
      format: 'markdown',
    });

    await sendMessageToUser(sender.user_id, {
      text: [
        'Ваше обращение принято.',
        `Номер обращения: ${appeal.publicId}`,
        'Сохраните этот номер.',
      ].join('\n'),
    });

    return sendJson(res, 200, { ok: true, mode: 'appeal', appealId: appeal.publicId });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}