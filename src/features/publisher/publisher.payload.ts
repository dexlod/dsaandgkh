export function buildDiscussionPayload(postPublicId: string): string {
  const normalized = postPublicId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `post-${normalized}`;
}

export function buildDiscussionLink(botUsername: string, payload: string): string {
  return `https://max.ru/${botUsername}?startapp=${payload}`;
}