import { bot } from "../server/bot.js";

// Секрет, який Telegram підписує в заголовку X-Telegram-Bot-Api-Secret-Token
// (передається в setWebhook при реєстрації, див. README-кроки деплою).
// Захищає ендпоінт від сторонніх POST-запитів з підробленими "оновленнями".
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("OK");
    return;
  }

  if (WEBHOOK_SECRET) {
    const incoming = req.headers["x-telegram-bot-api-secret-token"];
    if (incoming !== WEBHOOK_SECRET) {
      res.status(401).send("Unauthorized");
      return;
    }
  }

  try {
    await bot.handleUpdate(req.body);
  } catch (e) {
    console.error("webhook error", e);
  }
  res.status(200).json({ ok: true });
}
