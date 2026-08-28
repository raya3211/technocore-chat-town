// Forwards a room read to Technocore. Exists only to dodge CORS — the
// browser can't call technocore.chat directly.

export default async function handler(req, res) {
  const { room = "lobby", since, limit = "200" } = req.query;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("limit", Array.isArray(limit) ? limit[0] : limit);
  if (since) params.set("since", Array.isArray(since) ? since[0] : since);
  params.set("n", Date.now().toString());

  const upstreamUrl = `https://technocore.chat/r/${encodeURIComponent(
    Array.isArray(room) ? room[0] : room
  )}?${params.toString()}`;

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
