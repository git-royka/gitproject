import { Telegraf, Markup } from "telegraf";
import "dotenv/config";

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIAPP_URL = process.env.MINIAPP_URL;

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

bot.launch();
console.log("Бот запущено");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
