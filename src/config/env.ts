import 'dotenv/config';
import { z } from 'zod';

const nonZeroInt = z.coerce
  .number()
  .int()
  .refine((value) => value !== 0, 'Value must not be 0');

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  BOT_TOKEN: z.string().min(10, 'BOT_TOKEN is required'),
  BOT_USERNAME: z.string().min(3, 'BOT_USERNAME is required'),

  OPERATORS_CHAT_ID: nonZeroInt,
  CHANNEL_CHAT_ID: nonZeroInt,

  DATABASE_PATH: z.string().min(1).default('./data/bot.sqlite'),
  COMMENTS_APP_URL: z.string().url('COMMENTS_APP_URL must be a valid URL'),
  INTERNAL_API_KEY: z.string().min(8, 'INTERNAL_API_KEY is required'),

  ADMIN_USER_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;