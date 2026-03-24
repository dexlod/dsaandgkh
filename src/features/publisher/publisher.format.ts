import { env } from '../../config/env.js';
import { escapeMarkdown } from '../../shared/text.js';
import { buildDiscussionLink } from './publisher.payload.js';
import type { PostRecord } from './publisher.types.js';

export function formatPublisherPreview(post: PostRecord): string {
  const discussionLink = buildDiscussionLink(env.BOT_USERNAME, post.discussionPayload);

  return [
    '**Пост зарегистрирован**',
    '',
    `**Номер поста:** ${escapeMarkdown(post.id)}`,
    `**Заголовок:** ${escapeMarkdown(post.title)}`,
    `**Payload обсуждения:** ${escapeMarkdown(post.discussionPayload)}`,
    `**Ссылка обсуждения:** ${escapeMarkdown(discussionLink)}`,
    `**Комментариев:** ${post.commentCount}`,
    '',
    '**Текст:**',
    escapeMarkdown(post.body),
  ].join('\n');
}

export function formatChannelPost(post: PostRecord): string {
  return [
    `**${escapeMarkdown(post.title)}**`,
    '',
    escapeMarkdown(post.body),
    '',
    '_Для официального обращения используйте кнопку «Обращение»._',
  ].join('\n');
}

export function formatPostPublished(post: PostRecord): string {
  return [
    '**Пост опубликован**',
    '',
    `**Номер поста:** ${escapeMarkdown(post.id)}`,
    `**Комментариев:** ${post.commentCount}`,
    post.channelPostUrl
      ? `**Ссылка:** ${escapeMarkdown(post.channelPostUrl)}`
      : '**Ссылка:** не вернулась от API',
  ].join('\n');
}