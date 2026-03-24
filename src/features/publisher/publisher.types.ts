export interface PostRecord {
  id: string;
  title: string;
  body: string;
  discussionPayload: string;
  commentCount: number;
  channelMessageId?: string;
  channelPostUrl?: string;
  createdByUserId: number;
  createdByUserName: string;
  createdAt: Date;
  publishedAt?: Date;
}