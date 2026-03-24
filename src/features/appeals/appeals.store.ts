import { db } from '../../db/sqlite.js';
import type { AppealRecord } from './appeals.types.js';

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
  FROM appeals
  WHERE public_id LIKE ?
  ORDER BY public_id DESC
  LIMIT 1
`);

const insertAppealStatement = db.prepare(`
  INSERT INTO appeals (
    public_id,
    status,
    user_id,
    user_name,
    text,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const selectAppealByPublicId = db.prepare(`
  SELECT
    public_id,
    status,
    user_id,
    user_name,
    text,
    created_at
  FROM appeals
  WHERE public_id = ?
  LIMIT 1
`);

type AppealRow = {
  public_id: string;
  status: string;
  user_id: number;
  user_name: string;
  text: string;
  created_at: string;
};

export class AppealsStore {
  create(input: Omit<AppealRecord, 'id' | 'status' | 'createdAt'>): AppealRecord {
    const now = new Date();
    const createdAtIso = now.toISOString();
    const datePart = getLocalDatePart(now);
    const likePattern = `APR-${datePart}-%`;

    db.exec('BEGIN IMMEDIATE');

    try {
      const latestRow = selectLatestPublicIdForDay.get(likePattern) as
        | { public_id: string }
        | undefined;

      const nextSequence = latestRow ? extractSequence(latestRow.public_id) + 1 : 1;
      const publicId = `APR-${datePart}-${String(nextSequence).padStart(5, '0')}`;

      insertAppealStatement.run(
        publicId,
        'NEW',
        input.userId,
        input.userName,
        input.text,
        createdAtIso,
      );

      db.exec('COMMIT');

      return {
        id: publicId,
        status: 'NEW',
        userId: input.userId,
        userName: input.userName,
        text: input.text,
        createdAt: new Date(createdAtIso),
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  getById(id: string): AppealRecord | undefined {
    const row = selectAppealByPublicId.get(id) as AppealRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.public_id,
      status: row.status as AppealRecord['status'],
      userId: row.user_id,
      userName: row.user_name,
      text: row.text,
      createdAt: new Date(row.created_at),
    };
  }
}

export const appealsStore = new AppealsStore();