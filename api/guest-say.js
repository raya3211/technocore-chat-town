export default async function handler(req, res) {
  const { room, nick, text } = req.query;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (!room || !nick || text === undefined) {
    res.status(400).json({ error: "missing_params" });
    return;
  }

  const safeNick = String(nick)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
  if (!safeNick) {
    res.status(400).json({ error: "bad_nick" });
    return;
  }

  const upstreamUrl = `https://technocore.chat/r/${encodeURIComponent(
    String(room),
  )}/say/${encodeURIComponent(safeNick)}/${encodeURIComponent(String(text).slice(0, 400))}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const upstream = await fetch(upstreamUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const body = await upstream.text();
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({
      error: "upstream_unreachable",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
