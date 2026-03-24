import { createBot } from './bot/createBot.js';
import { logger } from './core/logger.js';
import { env } from './config/env.js';
import { dbFilePath } from './db/sqlite.js';

async function bootstrap() {
  const bot = createBot();

  logger.info(
    {
      appEnv: env.APP_ENV,
      operatorsChatId: env.OPERATORS_CHAT_ID,
      dbFilePath,
    },
    'Starting MAX appeals bot',
  );

  await bot.start();
}

bootstrap().catch((error) => {
  logger.error({ error }, 'MAX bot process stopped with error');
  process.exit(1);
});