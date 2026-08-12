import { Telegraf, Markup } from "telegraf";
import express from "express";
import "dotenv/config";

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL;
// ID клубного чату (те саме значення, що CHAT_ID в index.html), звідки
// проксі-ендпоінт нижче копіює повідомлення, щоб дістати фото/відео.
const CHAT_ID = process.env.CHAT_ID;
// Приватний чат (зазвичай особистий діалог адміна з ботом, ADMIN тут має
// написати боту /start хоча б раз), куди тимчасово копіюються повідомлення
// клубу, щоб дістати з них file_id фото/відео для проксі-ендпоінта нижче.
const STORAGE_CHAT_ID = process.env.STORAGE_CHAT_ID;

if (!BOT_TOKEN) {
  console.error("Немає BOT_TOKEN у .env файлі");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Текст вітання. Відредагуйте посилання на гілки під ваш чат.
const WELCOME_TEXT = `Привіт! Раді бачити тебе в клубі 👋

Ось короткий путівник, щоб не загубитись:

📌 Оголошення — тут усі важливі новини
💬 Флудилка — вільне спілкування
🎤 Записи подій — відео та матеріали з минулих зустрічей
❓ Питання-відповіді — якщо щось незрозуміло

Натисни кнопку нижче, щоб відкрити календар подій клубу.`;

function calendarKeyboard() {
  if (!MINIAPP_URL) return undefined;
  return Markup.inlineKeyboard([
    Markup.button.webApp("Календар подій", MINIAPP_URL),
  ]);
}

// Вітання нового учасника групи
bot.on("new_chat_members", async (ctx) => {
  for (const member of ctx.message.new_chat_members) {
    if (member.is_bot) continue;
    try {
      await ctx.telegram.sendMessage(member.id, WELCOME_TEXT, calendarKeyboard());
    } catch (e) {
      // Користувач не писав боту в приват — надсилаємо в групу з тегом
      await ctx.reply(`Вітаємо, ${member.first_name}! ${WELCOME_TEXT}`, calendarKeyboard());
    }
  }
});

// Команда /calendar в будь-якому місці чату
bot.command("calendar", async (ctx) => {
  if (!MINIAPP_URL) {
    return ctx.reply("Календар ще не підключено. Додайте MINIAPP_URL у .env");
  }
  await ctx.reply("Відкрити календар подій:", calendarKeyboard());
});

// Команда /start в приваті з ботом
bot.start(async (ctx) => {
  await ctx.reply(WELCOME_TEXT, calendarKeyboard());
});

// ---------------------------------------------------------------------
// Медіа-проксі для календаря: index.html не може дістати фото/відео з
// повідомлення напряму (Bot API вимагає токен, а публікувати токен у
// статичному фронтенді небезпечно). Тому фронтенд запитує
// GET /media/:messageId у цього сервера, а сервер сам ходить у Telegram
// з токеном і віддає байти картинки.
// ---------------------------------------------------------------------

const mediaFileIdCache = new Map(); // messageId -> file_id
const mediaBytesCache = new Map(); // messageId -> { buffer, contentType }

async function resolveFileId(messageId) {
  if (mediaFileIdCache.has(messageId)) return mediaFileIdCache.get(messageId);
  if (!CHAT_ID || !STORAGE_CHAT_ID) {
    throw new Error("CHAT_ID або STORAGE_CHAT_ID не налаштовано в .env");
  }
  const copied = await bot.telegram.copyMessage(STORAGE_CHAT_ID, CHAT_ID, Number(messageId));
  const fileId =
    copied.photo?.[copied.photo.length - 1]?.file_id ||
    copied.video?.file_id ||
    copied.document?.file_id;
  bot.telegram.deleteMessage(STORAGE_CHAT_ID, copied.message_id).catch(() => {});
  if (!fileId) throw new Error("У повідомленні немає фото/відео");
  mediaFileIdCache.set(messageId, fileId);
  return fileId;
}

const app = express();

app.get("/media/:messageId", async (req, res) => {
  const { messageId } = req.params;
  try {
    const cached = mediaBytesCache.get(messageId);
    if (cached) {
      res.set("Content-Type", cached.contentType);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(cached.buffer);
    }
    const fileId = await resolveFileId(messageId);
    const file = await bot.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const resp = await fetch(fileUrl);
    if (!resp.ok) throw new Error(`Telegram file download failed: ${resp.status}`);
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await resp.arrayBuffer());
    mediaBytesCache.set(messageId, { buffer, contentType });
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (e) {
    res.status(404).send("Медіа не знайдено");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Медіа-проксі запущено на порту ${PORT}`));

bot.launch();
console.log("Бот запущено");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
