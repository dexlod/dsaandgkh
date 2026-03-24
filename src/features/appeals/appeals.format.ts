import type { AppealRecord } from './appeals.types.js';
import { escapeMarkdown } from '../../shared/text.js';

export function formatAppealForOperators(appeal: AppealRecord): string {
  return [
    '**Новое обращение**',
    '',
    `**Номер:** ${escapeMarkdown(appeal.id)}`,
    `**Статус:** ${escapeMarkdown(appeal.status)}`,
    `**Пользователь:** ${escapeMarkdown(appeal.userName)}`,
    `**User ID:** ${appeal.userId}`,
    `**Создано:** ${escapeMarkdown(appeal.createdAt.toISOString())}`,
    '',
    '**Текст обращения:**',
    escapeMarkdown(appeal.text),
  ].join('\n');
}