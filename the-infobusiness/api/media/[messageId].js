import { getMediaBytes } from "../../server/bot.js";

export default async function handler(req, res) {
  const { messageId } = req.query;
  try {
    const { buffer, contentType } = await getMediaBytes(messageId);
    res.setHeader("Content-Type", contentType);
    // Фото прив'язане до конкретного message_id і ніколи не змінюється,
    // тому кешуємо надовго (рік) — інакше на кожен повторний показ того ж
    // фото проксі щодня заново ходить у Telegram трьома запитами поспіль
    // (forwardMessage -> getFile -> завантаження байтів), що і дає ті
    // кілька секунд затримки в клубі.
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.status(200).send(buffer);
  } catch (e) {
    res.status(404).send("Медіа не знайдено");
  }
}
