const botToken = process.env.BOT_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL;
const secret = process.env.MAX_WEBHOOK_SECRET;

if (!botToken || !webhookUrl || !secret) {
  console.error('BOT_TOKEN, WEBHOOK_URL, MAX_WEBHOOK_SECRET are required');
  process.exit(1);
}

const response = await fetch('https://platform-api.max.ru/subscriptions', {
  method: 'POST',
  headers: {
    Authorization: botToken,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: webhookUrl,
    update_types: ['message_created'],
    secret,
  }),
});

const text = await response.text();
console.log(response.status, text);