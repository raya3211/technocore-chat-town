(() => {
  const ROOM = "lobby";
  const POLL_INTERVAL_MS = 2500;
  const MAX_CHARACTERS = 24;
  const BUBBLE_DURATION_MS = 6000;
  const IDLE_MIN_MS = 2500;
  const IDLE_MAX_MS = 6000;
  const WALK_SPEED_PCT_PER_SEC = 12; // room-width percent per second

  const roomEl = document.getElementById("room");
  const roomEmptyEl = document.getElementById("room-empty");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const popCount = document.getElementById("pop-count");
  const rateText = document.getElementById("rate-text");
  const verifiedOnlyToggle = document.getElementById("verified-only-toggle");
  const logEl = document.getElementById("log");
  const logToggle = document.getElementById("log-toggle");
  const logSection = document.querySelector(".log-section");

  const { buildAvatarSvg, randomX, ROOM_MIN_PCT, ROOM_MAX_PCT } =
    window.TechnocoreCharacters;

  /** @type {Map<string, { el: HTMLElement, verified: boolean, x: number, lastActive: number, wanderTimer: number|null, bubbleTimer: number|null }>} */
  const characters = new Map();

  let sinceSeq = null;
  let inFlight = false;
  let recentTimestamps = [];
  let verifiedOnly = false;

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function shortLabel(from) {
    if (from.startsWith("did:key:")) {
      const key = from.slice("did:key:".length);
      return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key;
    }
    return from;
  }

  // ---------- character lifecycle ----------

  function spawnCharacter(from) {
    const verified = from.startsWith("did:key:");
    const x = randomX();

    const wrapper = document.createElement("div");
    wrapper.className = "character";
    wrapper.style.left = `${x}%`;
    wrapper.dataset.id = from;

    wrapper.innerHTML = `
      <div class="bubble" hidden></div>
      <div class="sprite">${buildAvatarSvg(from, verified)}</div>
      <div class="label">${escapeHtml(shortLabel(from))}</div>
    `;

    wrapper.addEventListener("click", () => {
      const c = characters.get(from);
      if (!c) return;
      showBubble(from, `(${shortLabel(from)}) click again to dismiss`, 2500);
    });

    roomEl.appendChild(wrapper);
    roomEmptyEl.hidden = true;

    const record = {
      el: wrapper,
      verified,
      x,
      lastActive: Date.now(),
      wanderTimer: null,
      bubbleTimer: null,
    };
    characters.set(from, record);
    scheduleWander(from);
    applyVerifiedFilter(record);
    return record;
  }

  function ensureCharacter(from) {
    return characters.get(from) || spawnCharacter(from);
  }

  function scheduleWander(from) {
    const record = characters.get(from);
    if (!record) return;
    if (record.wanderTimer) clearTimeout(record.wanderTimer);

    const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
    record.wanderTimer = setTimeout(() => wanderTo(from, randomX()), delay);
  }

  function wanderTo(from, targetX) {
    const record = characters.get(from);
    if (!record) return;

    const distance = Math.abs(targetX - record.x);
    const duration = Math.max(0.4, distance / WALK_SPEED_PCT_PER_SEC);
    const facingLeft = targetX < record.x;

    record.el.style.transition = `left ${duration}s linear`;
    record.el.style.left = `${targetX}%`;
    record.el.classList.add("walking");
    record.el.classList.toggle("facing-left", facingLeft);
    record.x = targetX;

    setTimeout(() => {
      record.el.classList.remove("walking");
      scheduleWander(from);
    }, duration * 1000);
  }

  function showBubble(from, text, durationOverride) {
    const record = characters.get(from);
    if (!record) return;

    const bubbleEl = record.el.querySelector(".bubble");
    bubbleEl.textContent = text;
    bubbleEl.hidden = false;
    record.el.classList.add("talking");

    if (record.bubbleTimer) clearTimeout(record.bubbleTimer);
    record.bubbleTimer = setTimeout(() => {
      bubbleEl.hidden = true;
      record.el.classList.remove("talking");
    }, durationOverride ?? BUBBLE_DURATION_MS);
  }

  function pruneOldest() {
    if (characters.size <= MAX_CHARACTERS) return;
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, record] of characters) {
      if (record.lastActive < oldestTime) {
        oldestTime = record.lastActive;
        oldestId = id;
      }
    }
    if (oldestId) despawn(oldestId);
  }

  function despawn(from) {
    const record = characters.get(from);
    if (!record) return;
    if (record.wanderTimer) clearTimeout(record.wanderTimer);
    if (record.bubbleTimer) clearTimeout(record.bubbleTimer);
    record.el.classList.add("despawning");
    setTimeout(() => record.el.remove(), 400);
    characters.delete(from);
  }

  function applyVerifiedFilter(record) {
    record.el.classList.toggle("hidden-by-filter", verifiedOnly && !record.verified);
  }

  verifiedOnlyToggle.addEventListener("change", () => {
    verifiedOnly = verifiedOnlyToggle.checked;
    for (const record of characters.values()) applyVerifiedFilter(record);
  });

  // ---------- text log ----------

  function appendLog(msg, verified) {
    const line = document.createElement("div");
    line.className = "log-line";
    line.innerHTML = `<span class="log-id ${verified ? "verified" : "human"}">${escapeHtml(
      shortLabel(msg.from)
    )}</span><span class="log-text">${escapeHtml(String(msg.text ?? ""))}</span>`;
    logEl.appendChild(line);
    while (logEl.children.length > 200) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }

  logToggle.addEventListener("click", () => {
    const collapsed = logSection.classList.toggle("collapsed");
    logToggle.textContent = collapsed ? "Show" : "Hide";
  });

  // ---------- rate calc ----------

  function updateRate() {
    const now = Date.now();
    recentTimestamps = recentTimestamps.filter((t) => now - t < 60000);
    rateText.textContent = `${recentTimestamps.length} msgs/min`;
  }

  // ---------- polling ----------

  async function poll() {
    if (inFlight) return;
    inFlight = true;

    const params = new URLSearchParams({ room: ROOM, limit: "200" });
    if (sinceSeq !== null) params.set("since", String(sinceSeq));

    try {
      const res = await fetch(`/api/lobby?${params.toString()}`);
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      const data = await res.json();

      statusDot.className = "status-dot live";
      statusText.textContent = "live";

      const messages = Array.isArray(data.messages) ? data.messages : [];

      for (const msg of messages) {
        const from = typeof msg.from === "string" ? msg.from : null;
        if (!from) continue;

        const verified = from.startsWith("did:key:");
        const record = ensureCharacter(from);
        record.lastActive = Date.now();
        pruneOldest();

        showBubble(from, String(msg.text ?? "").slice(0, 140));
        appendLog(msg, verified);
        recentTimestamps.push(Date.now());
      }

      if (messages.length) {
        sinceSeq = data.last_seq ?? sinceSeq;
      }

      popCount.textContent = `${characters.size} character${characters.size === 1 ? "" : "s"}`;
      updateRate();
    } catch (err) {
      statusDot.className = "status-dot error";
      statusText.textContent = "retrying…";
    } finally {
      inFlight = false;
    }
  }

  setInterval(poll, POLL_INTERVAL_MS);
  poll();
})();
