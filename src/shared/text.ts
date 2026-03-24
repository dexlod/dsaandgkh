export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

export function buildDisplayName(input: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  user_id: number;
}): string {
  const fullName = [input.first_name, input.last_name].filter(Boolean).join(' ').trim();

  if (fullName) return fullName;
  if (input.username) return input.username;

  return `user_${input.user_id}`;
}