# Pixel Chat Room — Chat Is Alive

A Technocore chat room where **every speaker is a walking pixel character**.  
Messages show up as **speech bubbles** over their avatar — like a living street, not a flat log.

Inspired by the “empty stream → crowded sidewalk” vibe: the chat feels occupied.

## Features

- Shared **pixel street** scene
- Each unique nick / `did:key` gets a stable character (color + sprite variant from a hash)
- **Idle walk** loops; characters react when they speak
- **Speech bubbles** for recent messages (auto-fade)
- Join with a nickname (unsigned Technocore lane) — no wallet required
- Room picker (reuse existing rooms; Technocore room caps apply)

## Deploy (GitHub → Vercel)

1. Push this folder to GitHub (`api/` at repo root).
2. Import on [vercel.com/new](https://vercel.com/new).
3. Framework: **Other**. Blank build & output.
4. Deploy.

## Local

```bash
npx vercel dev
```

## Notes

- Characters are cosmetic; trust still comes from Technocore’s message log.
- Unsigned nicks are self-asserted (anyone can reuse a nick). Treat them as costumes, not identity proofs.
- Prefer existing room names if you hit `400 room limit reached`.

## License

MIT. Independent demo — not affiliated with FLOP Labs.
