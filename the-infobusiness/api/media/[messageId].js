import { getMediaBytes } from "../../server/bot.js";

export default async function handler(req, res) {
  const { messageId } = req.query;
  try {
    const { buffer, contentType } = await getMediaBytes(messageId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    res.status(200).send(buffer);
  } catch (e) {
    res.status(404).send("Медіа не знайдено");
  }
}
