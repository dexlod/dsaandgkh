import { Bot } from '@maxhub/max-bot-api';
import type { User } from '@maxhub/max-bot-api/types';

import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

import { appealsStore } from '../features/appeals/appeals.store.js';
import { formatAppealForOperators } from '../features/appeals/appeals.format.js';

import { publisherStore } from '../features/publisher/publisher.store.js';
import {
  formatChannelPost,
  formatPostPublished,
  formatPublisherPreview,
} from '../features/publisher/publisher.format.js';

import { buildDisplayName, normalizeText } from '../shared/text.js';
import { isAdminUser } from '../shared/security.js';

import { formatCommentsButtonText } from '../features/comments/comments.counter.js';

export function createBot() {
  const bot = new Bot(env.BOT_TOKEN);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      [
        'Здравствуйте.',
        'Это бот для приёма обращений и публикации новостей.',
        '',
        'Для обращения: отправьте сообщение одним текстом.',
        'В ответ вы получите номер обращения.',
      ].join('\n'),
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        'Как пользоваться ботом:',
        '1. Чтобы отправить обращение — просто напишите сообщение.',
        '2. Бот зарегистрирует его и присвоит номер.',
        '',
        'Команды администратора:',
        '/publish Заголовок',
        '',
        'Текст новости',
        '',
        '/post_send PST-YYYYMMDD-00001',
      ].join('\n'),
    );
  });

  bot.on('message_created', async (ctx) => {
    try {
      const recipient = ctx.message.recipient;
      const sender = ctx.message.sender;
      const text = ctx.message.body?.text;

      // Обрабатываем только личные диалоги с ботом
      //if (!recipient || recipient.chat_type !== 'dialog') {
      //  return;
      //}


      if (!recipient || recipient.chat_type !== 'dialog') {
        logger.info(
          {
            chatType: recipient?.chat_type,
            chatId: recipient?.chat_id,
            message: ctx.message,
          },
          'Incoming non-dialog message',
        );
        return;
      }





      if (!sender) {
        logger.warn({ message: ctx.message }, 'Ignoring dialog message without sender');
        return;
      }

      const user = sender as User;

      if (user.is_bot) {
        return;
      }

      if (!text || !text.trim()) {
        await ctx.reply(
          'Пока я принимаю только текстовые сообщения. Отправьте текст одним сообщением.',
        );
        return;
      }

      const normalizedText = normalizeText(text);

      // -----------------------------
      // СОЗДАНИЕ ЧЕРНОВИКА ПОСТА
      // -----------------------------
      if (normalizedText.startsWith('/publish')) {
        if (!isAdminUser(user.user_id)) {
          await ctx.reply('Команда недоступна.');
          return;
        }

        const content = normalizedText.slice('/publish'.length).trim();

        if (!content) {
          await ctx.reply(
            [
              'Формат команды:',
              '/publish Заголовок',
              '',
              'Текст новости',
            ].join('\n'),
          );
          return;
        }

        const parts = content.split('\n');
        const title = parts[0]?.trim() ?? '';
        const body = parts.slice(1).join('\n').trim();

        if (!title || !body) {
          await ctx.reply(
            [
              'Нужно передать и заголовок, и текст новости.',
              '',
              'Пример:',
              '/publish Проверка публикации',
              '',
              'Это тестовый текст новости.',
            ].join('\n'),
          );
          return;
        }

        const post = publisherStore.create({
          title,
          body,
          createdByUserId: user.user_id,
          createdByUserName: buildDisplayName(user),
        });

        logger.info(
          {
            postId: post.id,
            createdByUserId: post.createdByUserId,
          },
          'New post draft created',
        );

        await ctx.reply(formatPublisherPreview(post), {
          format: 'markdown',
        });

        return;
      }

      // -----------------------------
      // ПУБЛИКАЦИЯ ЧЕРНОВИКА В КАНАЛ
      // -----------------------------
      if (normalizedText.startsWith('/post_send')) {
        if (!isAdminUser(user.user_id)) {
          await ctx.reply('Команда недоступна.');
          return;
        }

        const postId = normalizedText.slice('/post_send'.length).trim();

        if (!postId) {
          await ctx.reply('Укажите ID поста. Пример: /post_send PST-20260324-00001');
          return;
        }

        const post = publisherStore.getById(postId);

        if (!post) {
          await ctx.reply(`Пост ${postId} не найден.`);
          return;
        }

        if (post.publishedAt) {
          await ctx.reply(
            [
              'Этот пост уже опубликован.',
              `Номер поста: ${post.id}`,
              post.channelPostUrl ? `Ссылка: ${post.channelPostUrl}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          );
          return;
        }

        // Публикуем через raw API, потому что MAX рекомендует raw,
        // если конкретная возможность ещё не покрыта SDK полностью.
        const response = (await ctx.api.raw.post('messages', {
          query: {
            chat_id: env.CHANNEL_CHAT_ID,
          },
          body: {
            text: formatChannelPost(post),
            format: 'markdown',
            attachments: [
              {
                type: 'inline_keyboard',
                payload: {
                  buttons: [
                    [
                      {
                        type: 'link',
                        text: formatCommentsButtonText(post.commentCount),
                        url: `https://max.ru/${env.BOT_USERNAME}?startapp=${post.discussionPayload}`,
                      },
                    ],
                    [
                      {
                        type: 'link',
                        text: '✅ Обращение',
                        url: `https://max.ru/${env.BOT_USERNAME}`,
                      },
                    ],
                  ],
                },
              },
            ],
          },
        })) as {
          message?: {
            body?: { mid?: string };
            url?: string;
          };
        };

        publisherStore.markPublished({
          postId: post.id,
          channelMessageId: response.message?.body?.mid,
          channelPostUrl: response.message?.url,
          publishedAt: new Date(),
        });


        



        const publishedPost = publisherStore.getById(post.id);

        if (!publishedPost) {
          await ctx.reply('Пост был отправлен, но не удалось повторно прочитать его из базы.');
          return;
        }

        logger.info(
          {
            postId: publishedPost.id,
            channelMessageId: publishedPost.channelMessageId,
            channelPostUrl: publishedPost.channelPostUrl,
          },
          'Post published to channel',
        );



        try {
          await fetch(`${env.COMMENTS_APP_URL}/api/posts-register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-api-key': env.INTERNAL_API_KEY,
            },
            body: JSON.stringify({
              publicId: publishedPost.id,
              discussionPayload: publishedPost.discussionPayload,
              channelMessageId: publishedPost.channelMessageId,
              channelPostUrl: publishedPost.channelPostUrl,
              publishedAt: publishedPost.publishedAt?.toISOString(),
            }),
          });
        } catch (error) {
          logger.error(
            {
              error,
              postId: publishedPost.id,
            },
            'Failed to register published post in comments backend',
          );
        }



        await ctx.reply(formatPostPublished(publishedPost), {
          format: 'markdown',
        });

        return;
      }

      // Любые другие slash-команды не считаем обращениями
      if (normalizedText.startsWith('/')) {
        return;
      }

      // -----------------------------
      // ОБРАЩЕНИЕ
      // -----------------------------
      const userName = buildDisplayName(user);

      const appeal = appealsStore.create({
        userId: user.user_id,
        userName,
        text: normalizedText,
      });

      logger.info(
        {
          appealId: appeal.id,
          userId: appeal.userId,
        },
        'New appeal created',
      );

      try {
        await bot.api.sendMessageToChat(
          env.OPERATORS_CHAT_ID,
          formatAppealForOperators(appeal),
          { format: 'markdown' },
        );
      } catch (error) {
        logger.error(
          {
            error,
            appealId: appeal.id,
            operatorsChatId: env.OPERATORS_CHAT_ID,
          },
          'Failed to forward appeal to operators chat',
        );

        await ctx.reply(
          [
            'Обращение получено, но временно не удалось передать его оператору.',
            `Номер обращения: ${appeal.id}`,
            'Пожалуйста, сохраните этот номер.',
          ].join('\n'),
        );
        return;
      }

      await ctx.reply(
        [
          'Ваше обращение принято.',
          `Номер обращения: ${appeal.id}`,
          'Сохраните этот номер.',
        ].join('\n'),
      );
    } catch (error) {
      logger.error({ error }, 'Unhandled error in message_created handler');

      try {
        await ctx.reply(
          'Произошла внутренняя ошибка при обработке сообщения. Попробуйте ещё раз.',
        );
      } catch {
        // Ничего не делаем, если даже ответить пользователю не удалось
      }
    }
  });

  return bot;
}