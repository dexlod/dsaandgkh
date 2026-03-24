export type AppealStatus = 'NEW';

export interface AppealRecord {
  id: string;
  status: AppealStatus;
  userId: number;
  userName: string;
  text: string;
  createdAt: Date;
}