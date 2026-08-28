// Turns any sender id (a did:key:... or a plain nick) into a consistent,
// original little pixel-style character. No external art assets — every
// shape here is drawn with plain SVG rects/polygons so there's nothing to
// license and every character is procedurally unique but stable across
// reloads (same DID always renders the same character).

function hashString(str) {
  // FNV-1a, good enough for a stable, well-distributed hash of short strings
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const VARIANTS = ["round", "wizard", "knight", "cap"];

function paletteFor(id, verified) {
  const h = hashString(id);
  if (!verified) {
    // unsigned nicks: muted, desaturated — "unverified" reads visually
    return {
      skin: "hsl(30, 20%, 55%)",
      body: "hsl(0, 0%, 45%)",
      accent: "hsl(0, 0%, 60%)",
    };
  }
  const hue = h % 360;
  return {
    skin: "hsl(30, 45%, 60%)",
    body: `hsl(${hue}, 55%, 45%)`,
    accent: `hsl(${(hue + 40) % 360}, 70%, 60%)`,
  };
}

function variantFor(id) {
  return VARIANTS[hashString(id + "v") % VARIANTS.length];
}

/**
 * Builds a small (32x40) SVG character. `facingLeft` flips it horizontally.
 * Body parts are separated into head/torso/legL/legR groups so CSS can
 * animate the legs for a simple two-frame walk cycle.
 */
function buildAvatarSvg(id, verified) {
  const { skin, body, accent } = paletteFor(id, verified);
  const variant = variantFor(id);

  let headExtra = "";
  if (variant === "wizard") {
    headExtra = `<polygon points="6,10 26,10 16,-6" fill="${accent}" />`;
  } else if (variant === "knight") {
    headExtra = `<rect x="6" y="6" width="20" height="10" fill="${accent}" /><rect x="12" y="10" width="8" height="4" fill="#111" />`;
  } else if (variant === "cap") {
    headExtra = `<rect x="4" y="6" width="24" height="5" rx="2" fill="${accent}" />`;
  }

  return `
    <svg viewBox="-8 -10 48 50" width="32" height="40" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
      <g class="char-legs">
        <rect class="leg leg-l" x="9"  y="28" width="6" height="12" fill="${body}" />
        <rect class="leg leg-r" x="17" y="28" width="6" height="12" fill="${body}" />
      </g>
      <rect class="char-torso" x="6" y="14" width="20" height="16" rx="3" fill="${body}" />
      <circle class="char-head" cx="16" cy="8" r="9" fill="${skin}" />
      ${headExtra}
    </svg>
  `;
}

const ROOM_MIN_PCT = 6;
const ROOM_MAX_PCT = 92;

function randomX() {
  return ROOM_MIN_PCT + Math.random() * (ROOM_MAX_PCT - ROOM_MIN_PCT);
}

window.TechnocoreCharacters = {
  buildAvatarSvg,
  randomX,
  ROOM_MIN_PCT,
  ROOM_MAX_PCT,
};
