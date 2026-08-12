import { Telegraf, Markup } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL;
// ID клубного чату (те саме значення, що CHAT_ID в index.html), звідки
// медіа-проксі копіює повідомлення, щоб дістати фото/відео.
const CHAT_ID = process.env.CHAT_ID;
// Приватний чат (особистий діалог адміна з ботом — адмін має написати
// боту /start хоча б раз), куди тимчасово копіюються повідомлення клубу,
// щоб дістати з них file_id фото/відео.
const STORAGE_CHAT_ID = process.env.STORAGE_CHAT_ID;

if (!BOT_TOKEN) {
  throw new Error("Немає BOT_TOKEN у змінних середовища");
}

export const bot = new Telegraf(BOT_TOKEN);

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
    return ctx.reply("Календар ще не підключено. Додайте MINIAPP_URL у налаштування середовища");
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
// GET /api/media/:messageId, а ця функція сама ходить у Telegram
// з токеном і віддає байти картинки.
//
// Кеш нижче живе тільки в пам'яті "теплого" екземпляра serverless-функції
// — між холодними стартами Vercel він втрачається, і файл дістається
// заново. Це нормально: file_id постійний, а сам запит до Telegram дешевий.
// ---------------------------------------------------------------------

const mediaFileIdCache = new Map(); // messageId -> file_id
const mediaBytesCache = new Map(); // messageId -> { buffer, contentType }

async function resolveFileId(messageId) {
  if (mediaFileIdCache.has(messageId)) return mediaFileIdCache.get(messageId);
  if (!CHAT_ID || !STORAGE_CHAT_ID) {
    throw new Error("CHAT_ID або STORAGE_CHAT_ID не налаштовано в середовищі");
  }
  // forwardMessage (на відміну від copyMessage) повертає повний об'єкт
  // повідомлення з масивом photo/video — саме звідти дістаємо file_id.
  const forwarded = await bot.telegram.forwardMessage(STORAGE_CHAT_ID, CHAT_ID, Number(messageId));
  const fileId =
    forwarded.photo?.[forwarded.photo.length - 1]?.file_id ||
    forwarded.video?.file_id ||
    forwarded.document?.file_id;
  bot.telegram.deleteMessage(STORAGE_CHAT_ID, forwarded.message_id).catch(() => {});
  if (!fileId) throw new Error("У повідомленні немає фото/відео");
  mediaFileIdCache.set(messageId, fileId);
  return fileId;
}

export async function getMediaBytes(messageId) {
  const cached = mediaBytesCache.get(messageId);
  if (cached) return cached;
  const fileId = await resolveFileId(messageId);
  const file = await bot.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new Error(`Telegram file download failed: ${resp.status}`);
  const contentType = resp.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await resp.arrayBuffer());
  const result = { buffer, contentType };
  mediaBytesCache.set(messageId, result);
  return result;
}
