// Turns any sender id (a did:key:... or a plain nick) into a consistent,
// original little pixel-style character. No external art assets — every
// shape here is drawn with plain SVG rects/polygons so there's nothing to
// license and every character is procedurally unique but stable across
// reloads (same DID always renders the same character).
//
// Flavor: unsigned nicks render as a plain grey "Novice" robe (no job gear
// yet); verified did:key: senders get "job-classed" into one of a few
// classic archetypes, each with its own gear color, plus a robe color
// unique to their id.

function hashString(str) {
  // FNV-1a, good enough for a stable, well-distributed hash of short strings
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const JOB_CLASSES = ["mage", "knight", "archer"];

const JOB_GEAR = {
  mage: { fill: "#3a5f96", trim: "#274370" },
  knight: { fill: "#8b909c", trim: "#4c505c" },
  archer: { fill: "#3f7d4a", trim: "#295233" },
};

function paletteFor(id, verified) {
  const h = hashString(id);
  if (!verified) {
    // unsigned nicks: plain grey Novice robe — no job gear yet
    return { skin: "#c9a876", body: "#8a8478", body2: "#6f6a60" };
  }
  const hue = h % 360;
  return {
    skin: "#e0b483",
    body: `hsl(${hue}, 46%, 40%)`,
    body2: `hsl(${hue}, 42%, 28%)`,
  };
}

function variantFor(id, verified) {
  if (!verified) return "novice";
  return JOB_CLASSES[hashString(id + "v") % JOB_CLASSES.length];
}

/**
 * Builds a small (32x40) SVG character. `facingLeft` flips it horizontally.
 * Body parts are separated into head/torso/legL/legR groups so CSS can
 * animate the legs for a simple two-frame walk cycle.
 */
function buildAvatarSvg(id, verified) {
  const { skin, body, body2 } = paletteFor(id, verified);
  const variant = variantFor(id, verified);

  let headExtra = "";
  if (variant === "mage") {
    const g = JOB_GEAR.mage;
    headExtra = `<polygon points="4,10 28,10 16,-8" fill="${g.fill}" stroke="${g.trim}" stroke-width="1" /><rect x="2" y="9" width="28" height="3" fill="${g.trim}" />`;
  } else if (variant === "knight") {
    const g = JOB_GEAR.knight;
    headExtra = `<rect x="5" y="4" width="22" height="11" rx="1" fill="${g.fill}" stroke="${g.trim}" stroke-width="1" /><rect x="10" y="9" width="12" height="4" fill="#1c1c1c" /><rect x="14" y="-3" width="4" height="7" fill="${g.trim}" />`;
  } else if (variant === "archer") {
    const g = JOB_GEAR.archer;
    headExtra = `<rect x="3" y="5" width="26" height="6" rx="2" fill="${g.fill}" stroke="${g.trim}" stroke-width="1" /><polygon points="20,5 27,1 27,5" fill="${g.fill}" />`;
  } else {
    // novice: plain hood collar, no job gear
    headExtra = `<path d="M4 12 Q16 20 28 12 L28 16 Q16 24 4 16 Z" fill="${body2}" />`;
  }

  return `
    <svg viewBox="-8 -10 48 50" width="32" height="40" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
      <g class="char-legs">
        <rect class="leg leg-l" x="9"  y="28" width="6" height="12" fill="${body2}" stroke="#2a1d10" stroke-width="0.75" />
        <rect class="leg leg-r" x="17" y="28" width="6" height="12" fill="${body2}" stroke="#2a1d10" stroke-width="0.75" />
      </g>
      <rect class="char-torso" x="6" y="14" width="20" height="16" rx="1" fill="${body}" stroke="#2a1d10" stroke-width="0.75" />
      <circle class="char-head" cx="16" cy="8" r="9" fill="${skin}" stroke="#2a1d10" stroke-width="0.75" />
      ${headExtra}
    </svg>
  `;
}

const ROOM_MIN_X_PCT = 6;
const ROOM_MAX_X_PCT = 92;
const ROOM_MIN_Y_PCT = 62; // keep characters on the tiled plaza floor, below the rampart
const ROOM_MAX_Y_PCT = 92;

function randomX() {
  return ROOM_MIN_X_PCT + Math.random() * (ROOM_MAX_X_PCT - ROOM_MIN_X_PCT);
}

function randomY() {
  return ROOM_MIN_Y_PCT + Math.random() * (ROOM_MAX_Y_PCT - ROOM_MIN_Y_PCT);
}

window.TechnocoreCharacters = {
  buildAvatarSvg,
  randomX,
  randomY,
  ROOM_MIN_X_PCT,
  ROOM_MAX_X_PCT,
  ROOM_MIN_Y_PCT,
  ROOM_MAX_Y_PCT,
};
