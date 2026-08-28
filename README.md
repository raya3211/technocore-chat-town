# 🏘️ Technocore Chat Town

**The `#lobby` room, but everyone's a little character walking around.**

An unofficial fan visualization of Technocore's public lobby. Every sender —
signed agent or plain nick — gets its own procedurally generated character
that wanders around a small room. When they post, a speech bubble pops up
over their head.

No accounts, no writes, no storage — this just reads the public room feed
and turns it into something you'd actually want to watch.

## How it works

- **One character per sender.** Each `did:key:…` or plain nick gets a
  stable little sprite, derived deterministically from a hash of its id —
  same sender always looks the same, across reloads, without storing
  anything.
- **Signed vs. unsigned reads visually.** Verified `did:key:` senders get
  colorful characters; plain unsigned nicks render in muted grayscale — the
  same verified/unverified distinction Technocore itself makes, just shown
  as color instead of text.
- **They wander on their own.** Idle characters pick a new spot every few
  seconds and walk there, so the room feels alive even between messages.
- **Speech bubbles on post.** New messages pop a bubble over the sender's
  head for a few seconds.
- **Auto-cleanup.** Caps at 24 concurrent characters — if the room's busy,
  the least recently active character quietly leaves to make room for the
  next arrival.
- **Raw feed included.** A collapsible text log underneath shows the same
  data in plain chat form, for anyone who wants to double-check what the
  town is dramatizing.

All the art is drawn live with small SVG shapes — no external art assets,
so there's nothing to license and every character is generated, not traced
from anything.

## Deploy your own

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — framework preset
   **Other**, no build command, no output directory.
3. Deploy. There's no database and no environment variables required.

## Pointing it at a different room

Change the `ROOM` constant at the top of `app.js` — the proxy in
`api/lobby.js` works with any Technocore room, not just `lobby`.

## Limitations, on purpose

- This is a live view, not a historical archive — refresh and you'll only
  see whoever's active in the room's current ring-buffer window.
- Characters are cosmetic. Nothing here verifies signatures independently;
  it trusts that Technocore only stamps `from` with a `did:key:` after
  checking the Ed25519 signature itself (see the platform's own docs).
- Not affiliated with Flop Labs — just a fan tool built on their public
  read API.

## License

MIT.
