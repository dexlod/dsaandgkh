import { db } from '../../db/sqlite.js';
import type { PostRecord } from './publisher.types.js';
import { buildDiscussionPayload } from './publisher.payload.js';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getLocalDatePart(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function extractSequence(publicId: string): number {
  const match = publicId.match(/-(\d{5})$/);
  if (!match) return 0;
  return Number(match[1]);
}

const selectLatestPublicIdForDay = db.prepare(`
  SELECT public_id
  FROM posts
  WHERE public_id LIKE ?
  ORDER BY public_id DESC
  LIMIT 1
`);

const insertPostStatement = db.prepare(`
  INSERT INTO posts (
    public_id,
    title,
    body,
    discussion_payload,
    comment_count,
    created_by_user_id,
    created_by_user_name,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectPostByPublicId = db.prepare(`
  SELECT
    public_id,
    title,
    body,
    discussion_payload,
    comment_count,
    channel_message_id,
    channel_post_url,
    created_by_user_id,
    created_by_user_name,
    created_at,
    published_at
  FROM posts
  WHERE public_id = ?
  LIMIT 1
`);

const updatePublishedStatement = db.prepare(`
  UPDATE posts
  SET
    channel_message_id = ?,
    channel_post_url = ?,
    published_at = ?
  WHERE public_id = ?
`);

type PostRow = {
  public_id: string;
  title: string;
  body: string;
  discussion_payload: string;
  comment_count: number;
  channel_message_id: string | null;
  channel_post_url: string | null;
  created_by_user_id: number;
  created_by_user_name: string;
  created_at: string;
  published_at: string | null;
};

export class PublisherStore {
  create(input: {
    title: string;
    body: string;
    createdByUserId: number;
    createdByUserName: string;
  }): PostRecord {
    const now = new Date();
    const createdAtIso = now.toISOString();
    const datePart = getLocalDatePart(now);
    const likePattern = `PST-${datePart}-%`;

    db.exec('BEGIN IMMEDIATE');

    try {
      const latestRow = selectLatestPublicIdForDay.get(likePattern) as
        | { public_id: string }
        | undefined;

      const nextSequence = latestRow ? extractSequence(latestRow.public_id) + 1 : 1;
      const publicId = `PST-${datePart}-${String(nextSequence).padStart(5, '0')}`;
      const discussionPayload = buildDiscussionPayload(publicId);

      insertPostStatement.run(
        publicId,
        input.title,
        input.body,
        discussionPayload,
        0,
        input.createdByUserId,
        input.createdByUserName,
        createdAtIso,
      );

      db.exec('COMMIT');

      return {
        id: publicId,
        title: input.title,
        body: input.body,
        discussionPayload,
        commentCount: 0,
        createdByUserId: input.createdByUserId,
        createdByUserName: input.createdByUserName,
        createdAt: new Date(createdAtIso),
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  getById(id: string): PostRecord | undefined {
    const row = selectPostByPublicId.get(id) as PostRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.public_id,
      title: row.title,
      body: row.body,
      discussionPayload: row.discussion_payload,
      commentCount: row.comment_count ?? 0,
      channelMessageId: row.channel_message_id ?? undefined,
      channelPostUrl: row.channel_post_url ?? undefined,
      createdByUserId: row.created_by_user_id,
      createdByUserName: row.created_by_user_name,
      createdAt: new Date(row.created_at),
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
    };
  }

  markPublished(input: {
    postId: string;
    channelMessageId?: string;
    channelPostUrl?: string;
    publishedAt?: Date;
  }): void {
    const publishedAtIso = (input.publishedAt ?? new Date()).toISOString();

    updatePublishedStatement.run(
      input.channelMessageId ?? null,
      input.channelPostUrl ?? null,
      publishedAtIso,
      input.postId,
    );
  }
}

export const publisherStore = new PublisherStore();