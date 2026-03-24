import { env } from '../config/env.js';

export function isAdminUser(userId: number): boolean {
  return env.ADMIN_USER_IDS.includes(userId);
}