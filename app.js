(() => {
  const POLL_INTERVAL_MS = 2500;
  const MAX_CHARACTERS = 200;
  const BUBBLE_DURATION_MS = 6000;
  const BUBBLE_TRUNCATE_LENGTH = 50;
  const IDLE_MIN_MS = 2500;
  const IDLE_MAX_MS = 6000;
  const WALK_SPEED_PCT_PER_SEC = 14; // room-diagonal percent per second
  const IDLE_DESPAWN_MS = 2000; // leave town after 2s without chatting
  const EXIT_WALK_MS = 900; // time to run off-map

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
  const roomInput = document.getElementById("room-input");
  const roomGoBtn = document.getElementById("room-go");

  const { buildAvatarSvg, randomX, randomY } = window.TechnocoreCharacters;

  /** @type {Map<string, { el: HTMLElement, verified: boolean, x: number, y: number, lastActive: number, wanderTimer: number|null, bubbleTimer: number|null }>} */
  const characters = new Map();

  let currentRoom = roomInput.value.trim() || "lobby";
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
    const y = randomY();

    const wrapper = document.createElement("div");
    wrapper.className = "character";
    wrapper.style.left = `${x}%`;
    wrapper.style.top = `${y}%`;
    wrapper.style.zIndex = String(Math.round(y * 10));
    wrapper.dataset.id = from;

    wrapper.innerHTML = `
      <div class="bubble" hidden></div>
      <div class="sprite">${buildAvatarSvg(from, verified)}</div>
      <div class="label">${escapeHtml(shortLabel(from))}</div>
    `;

    roomEl.appendChild(wrapper);
    roomEmptyEl.hidden = true;

    const record = {
      el: wrapper,
      verified,
      x,
      y,
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
    record.wanderTimer = setTimeout(() => wanderTo(from, randomX(), randomY()), delay);
  }

  function wanderTo(from, targetX, targetY) {
    const record = characters.get(from);
    if (!record) return;

    const dx = targetX - record.x;
    const dy = targetY - record.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.max(0.4, distance / WALK_SPEED_PCT_PER_SEC);
    const facingLeft = dx < 0;

    record.el.style.transition = `left ${duration}s linear, top ${duration}s linear`;
    record.el.style.left = `${targetX}%`;
    record.el.style.top = `${targetY}%`;
    record.el.style.zIndex = String(Math.round(targetY * 10));
    record.el.classList.add("walking");
    record.el.classList.toggle("facing-left", facingLeft);
    record.x = targetX;
    record.y = targetY;

    setTimeout(() => {
      record.el.classList.remove("walking");
      scheduleWander(from);
    }, duration * 1000);
  }

  function truncatedText(fullText) {
    return fullText.length > BUBBLE_TRUNCATE_LENGTH
      ? fullText.slice(0, BUBBLE_TRUNCATE_LENGTH).trimEnd() + "…"
      : fullText;
  }

  function showBubble(from, text, durationOverride) {
    const record = characters.get(from);
    if (!record) return;

    const bubbleEl = record.el.querySelector(".bubble");
    bubbleEl.dataset.fullText = text;
    bubbleEl.dataset.expanded = "false";
    bubbleEl.textContent = truncatedText(text);
    bubbleEl.classList.toggle("truncatable", text.length > BUBBLE_TRUNCATE_LENGTH);
    bubbleEl.classList.remove("expanded");
    bubbleEl.hidden = false;
    record.el.classList.add("talking");

    if (record.bubbleTimer) clearTimeout(record.bubbleTimer);
    record.bubbleTimer = setTimeout(() => {
      bubbleEl.hidden = true;
      record.el.classList.remove("talking");
    }, durationOverride ?? BUBBLE_DURATION_MS);
  }

  // clicking a (truncated) bubble expands it to the full message, and
  // pauses the auto-hide timer while it's open; clicking again collapses
  // it and resumes the countdown
  roomEl.addEventListener("click", (e) => {
    const bubbleEl = e.target.closest(".bubble");
    if (!bubbleEl || bubbleEl.hidden) return;
    e.stopPropagation();

    const wrapper = bubbleEl.closest(".character");
    const from = wrapper?.dataset.id;
    const record = from ? characters.get(from) : null;
    const fullText = bubbleEl.dataset.fullText || "";
    const isExpanded = bubbleEl.dataset.expanded === "true";

    if (isExpanded) {
      bubbleEl.dataset.expanded = "false";
      bubbleEl.textContent = truncatedText(fullText);
      bubbleEl.classList.remove("expanded");
      if (record) {
        record.bubbleTimer = setTimeout(() => {
          bubbleEl.hidden = true;
          record.el.classList.remove("talking");
        }, BUBBLE_DURATION_MS);
      }
    } else {
      bubbleEl.dataset.expanded = "true";
      bubbleEl.textContent = fullText;
      bubbleEl.classList.add("expanded");
      if (record?.bubbleTimer) {
        clearTimeout(record.bubbleTimer);
        record.bubbleTimer = null; // stay open until clicked again
      }
    }
  });

  function pruneOldest() {
    if (characters.size <= MAX_CHARACTERS) return;
    const now = Date.now();
    // Prefer someone already idle; otherwise the least-recently active
    let pick = null;
    let pickTime = Infinity;
    for (const [id, record] of characters) {
      if (record.leaving) continue;
      const idle = now - record.lastActive;
      // weight idle people first
      const score = record.lastActive - (idle >= IDLE_DESPAWN_MS * 0.6 ? 1e12 : 0);
      if (score < pickTime) {
        pickTime = score;
        pick = id;
      }
    }
    if (pick) despawn(pick);
  }

  function exitPoint(record) {
    // run toward nearest horizontal edge (or random side)
    const goLeft = record.x < 50 ? true : record.x > 50 ? false : Math.random() < 0.5;
    return {
      x: goLeft ? -8 : 108,
      y: Math.max(12, Math.min(88, record.y + (Math.random() * 16 - 8))),
      left: goLeft,
    };
  }

  function despawn(from, { instant = false } = {}) {
    const record = characters.get(from);
    if (!record || record.leaving) return;
    record.leaving = true;
    if (record.wanderTimer) clearTimeout(record.wanderTimer);
    if (record.bubbleTimer) clearTimeout(record.bubbleTimer);

    // hide bubble while exiting
    const bubbleEl = record.el.querySelector(".bubble");
    if (bubbleEl) bubbleEl.hidden = true;
    record.el.classList.remove("talking");

    if (instant) {
      record.el.remove();
      characters.delete(from);
      return;
    }

    const exit = exitPoint(record);
    const dx = exit.x - record.x;
    const dy = exit.y - record.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.max(0.55, Math.min(1.2, distance / (WALK_SPEED_PCT_PER_SEC * 1.35)));

    record.el.classList.add("walking", "leaving");
    record.el.classList.toggle("facing-left", exit.left);
    // solid walk off-map — no fade
    record.el.style.transition = `left ${duration}s linear, top ${duration}s linear`;
    record.el.style.left = `${exit.x}%`;
    record.el.style.top = `${exit.y}%`;

    // remove from map tracking immediately so prune/idle won't double-fire
    characters.delete(from);
    setTimeout(() => {
      record.el.remove();
    }, duration * 1000 + 50);
  }

  function tickIdleDespawn() {
    const now = Date.now();
    for (const [id, record] of [...characters]) {
      if (record.leaving) continue;
      if (now - record.lastActive >= IDLE_DESPAWN_MS) {
        despawn(id);
      }
    }
    roomEmptyEl.hidden = characters.size > 0;
    popCount.textContent = `${characters.size} character${characters.size === 1 ? "" : "s"}`;
  }


  function clearAllCharacters() {
    for (const from of [...characters.keys()]) despawn(from, { instant: true });
  }

  function applyVerifiedFilter(record) {
    record.el.classList.toggle("hidden-by-filter", verifiedOnly && !record.verified);
  }

  verifiedOnlyToggle.addEventListener("change", () => {
    verifiedOnly = verifiedOnlyToggle.checked;
    for (const record of characters.values()) applyVerifiedFilter(record);
  });

  // ---------- room switching ----------

  function switchRoom(next) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentRoom) return;
    currentRoom = trimmed;
    roomInput.value = trimmed;
    clearAllCharacters();
    logEl.innerHTML = "";
    sinceSeq = null;
    recentTimestamps = [];
    roomEmptyEl.hidden = false;
    roomEmptyEl.textContent = `Waiting for #${trimmed} to wake up…`;
    statusText.textContent = "connecting…";
    poll();
  }

  roomGoBtn.addEventListener("click", () => switchRoom(roomInput.value));
  roomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") switchRoom(roomInput.value);
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

    const params = new URLSearchParams({ room: currentRoom, limit: "200" });
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

        showBubble(from, String(msg.text ?? "").slice(0, 500));
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
  setInterval(tickIdleDespawn, 500);
  poll();
})();
