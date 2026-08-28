(() => {
  const STORAGE = "pixel-chat-v1";
  const COLORS = [
    { shirt: "#4a90d9", pants: "#2c3e50", hair: "#3d2914", skin: "#f0c8a0", cape: "transparent" },
    { shirt: "#e74c3c", pants: "#1a1a2e", hair: "#1a0a00", skin: "#e8b898", cape: "#c0392b" },
    { shirt: "#2ecc71", pants: "#1e3a2f", hair: "#5c4033", skin: "#f5d0a9", cape: "transparent" },
    { shirt: "#9b59b6", pants: "#2c1a3a", hair: "#f5c542", skin: "#f0c8a0", cape: "#8e44ad" },
    { shirt: "#f39c12", pants: "#3d2914", hair: "#fff3d0", skin: "#ddb892", cape: "transparent" },
    { shirt: "#1abc9c", pants: "#0e3d38", hair: "#2c1810", skin: "#c4a574", cape: "#16a085" },
    { shirt: "#3498db", pants: "#1a2740", hair: "#8b4513", skin: "#f5cba7", cape: "transparent" },
    { shirt: "#e91e63", pants: "#2a1020", hair: "#4a2080", skin: "#f0c8a0", cape: "#ff6b9d" },
  ];

  const state = {
    room: "lobby",
    nick: "",
    colorIdx: 0,
    joined: false,
    actors: new Map(), // key -> { key, label, colorIdx, x, facing, el, bubbleTimer, targetX }
    lastSeq: null,
    messages: [],
  };

  let pollTimer = null;
  let walkTimer = null;

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function actorKey(from) {
    return String(from || "anon").slice(0, 64);
  }

  function labelOf(from) {
    const s = String(from || "");
    if (s.startsWith("did:key:")) {
      const k = s.replace(/^did:key:/, "");
      return k.length > 10 ? k.slice(0, 4) + "…" + k.slice(-3) : k;
    }
    return s.slice(0, 12) || "anon";
  }

  function colorFor(key, preferredIdx) {
    if (typeof preferredIdx === "number" && preferredIdx >= 0) {
      return preferredIdx % COLORS.length;
    }
    return hashStr(key) % COLORS.length;
  }

  function ensureActor(key, label, preferredColor) {
    if (state.actors.has(key)) {
      const a = state.actors.get(key);
      if (label && a.label !== label) {
        a.label = label;
        const lab = a.el.querySelector(".char-label");
        if (lab) lab.textContent = label;
      }
      return a;
    }

    const stage = document.getElementById("stage");
    const idx = colorFor(key, preferredColor);
    const palette = COLORS[idx];
    const x = 8 + (hashStr(key + "x") % 80);

    const el = document.createElement("div");
    el.className = "char";
    el.style.left = x + "%";
    el.innerHTML = `
      <div class="bubble" aria-hidden="true"><span class="bubble-text"></span></div>
      <div class="char-body">
        <div class="sprite" style="--shirt:${palette.shirt};--pants:${palette.pants};--hair:${palette.hair};--skin:${palette.skin};--accent-cape:${palette.cape}">
          <div class="hair"></div>
          <div class="head"></div>
          <div class="cape"></div>
          <div class="torso"></div>
          <div class="legs"></div>
        </div>
      </div>
      <div class="char-label">${escapeHtml(label || labelOf(key))}</div>
    `;
    stage.appendChild(el);

    const actor = {
      key,
      label: label || labelOf(key),
      colorIdx: idx,
      x,
      facing: 1,
      el,
      bubbleTimer: null,
      targetX: x,
    };
    state.actors.set(key, actor);
    return actor;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showBubble(actor, text) {
    const bubble = actor.el.querySelector(".bubble");
    const span = bubble.querySelector(".bubble-text");
    span.textContent = String(text).slice(0, 80);
    bubble.classList.add("show");
    actor.el.classList.add("speaking");
    clearTimeout(actor.bubbleTimer);
    actor.bubbleTimer = setTimeout(() => {
      bubble.classList.remove("show");
      actor.el.classList.remove("speaking");
    }, 4500);
  }

  function wander() {
    for (const actor of state.actors.values()) {
      // gentle random walk
      if (Math.random() > 0.55) continue;
      const delta = (Math.random() * 18 - 9);
      let next = actor.x + delta;
      next = Math.max(2, Math.min(92, next));
      actor.facing = next >= actor.x ? 1 : -1;
      actor.el.classList.toggle("facing-left", actor.facing < 0);
      actor.x = next;
      actor.el.style.left = next + "%";
    }
  }

  function setStatus(text, ok) {
    const el = document.getElementById("status");
    el.textContent = text;
    el.style.color = ok ? "var(--accent)" : "var(--muted)";
  }

  function normalizeMsg(raw) {
    if (!raw || typeof raw !== "object") return null;
    const from = raw.from || raw.did || raw.author || raw.nick || "";
    const text = raw.text ?? raw.body ?? raw.message ?? "";
    if (!from && !text) return null;
    return {
      seq: raw.seq ?? raw.id ?? (Date.parse(raw.ts || "") || Date.now()),
      ts: raw.ts || raw.time || new Date().toISOString(),
      from: String(from),
      text: String(text),
    };
  }

  async function fetchLobby() {
    const params = new URLSearchParams({
      room: state.room,
      limit: "80",
    });
    const res = await fetch(`/api/lobby?${params}`);
    if (!res.ok) throw new Error(await res.text());
    const data = JSON.parse(await res.text());
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data?.messages) list = data.messages;
    else if (data?.rows) list = data.rows;

    const msgs = list.map(normalizeMsg).filter(Boolean);
    msgs.sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

    const seen = new Set(state.messages.map((m) => `${m.seq}:${m.from}:${m.text}`));
    const fresh = [];
    for (const m of msgs) {
      const k = `${m.seq}:${m.from}:${m.text}`;
      if (!seen.has(k)) {
        seen.add(k);
        fresh.push(m);
      }
    }

    // full replace on first load for actors, only bubble fresh
    if (!state.messages.length && msgs.length) {
      state.messages = msgs.slice(-40);
      for (const m of state.messages) {
        const key = actorKey(m.from);
        const actor = ensureActor(key, labelOf(m.from));
        // show only last message per actor on first paint
      }
      const lastByActor = new Map();
      for (const m of state.messages) lastByActor.set(actorKey(m.from), m);
      for (const m of lastByActor.values()) {
        const actor = ensureActor(actorKey(m.from), labelOf(m.from));
        showBubble(actor, m.text);
      }
    } else {
      for (const m of fresh) {
        state.messages.push(m);
        const actor = ensureActor(actorKey(m.from), labelOf(m.from));
        showBubble(actor, m.text);
        // hop toward center a bit when speaking
        const hop = actor.x + (Math.random() * 6 - 3);
        actor.x = Math.max(2, Math.min(92, hop));
        actor.el.style.left = actor.x + "%";
      }
      if (state.messages.length > 100) state.messages = state.messages.slice(-80);
    }
    setStatus(`live · #${state.room}`, true);
  }

  async function poll() {
    try {
      await fetchLobby();
    } catch (e) {
      setStatus("reconnect…", false);
    }
  }

  async function sendMessage(text) {
    const nick = state.nick
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 20);
    if (!nick) throw new Error("Bad nickname");
    const params = new URLSearchParams({
      room: state.room,
      nick,
      text: text.slice(0, 200),
    });
    const res = await fetch(`/api/guest-say?${params}`);
    if (!res.ok) {
      const body = await res.text();
      if (/room limit/i.test(body)) {
        throw new Error("Room limit — try an existing room like lobby");
      }
      throw new Error(body || `HTTP ${res.status}`);
    }
    // optimistic
    const key = actorKey(nick);
    const actor = ensureActor(key, nick, state.colorIdx);
    showBubble(actor, text);
  }

  /* UI */
  function buildPalette() {
    const root = document.getElementById("palette");
    root.innerHTML = COLORS.map(
      (c, i) =>
        `<button type="button" class="swatch ${i === state.colorIdx ? "active" : ""}" data-i="${i}" style="background:${c.shirt}" title="Look ${i + 1}"></button>`,
    ).join("");
  }

  document.getElementById("palette").addEventListener("click", (e) => {
    const s = e.target.closest("[data-i]");
    if (!s) return;
    state.colorIdx = Number(s.dataset.i);
    buildPalette();
  });

  document.getElementById("btn-join").addEventListener("click", () => {
    const raw = document.getElementById("nick").value.trim();
    const nick = raw.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20);
    if (!nick) {
      toast("Enter a nickname");
      return;
    }
    state.nick = nick;
    state.joined = true;
    localStorage.setItem(
      STORAGE,
      JSON.stringify({ nick, colorIdx: state.colorIdx, room: state.room }),
    );
    document.getElementById("join-overlay").classList.add("hidden");
    document.getElementById("msg").disabled = false;
    document.getElementById("btn-send").disabled = false;
    document.getElementById("who").textContent = `@${nick}`;
    ensureActor(actorKey(nick), nick, state.colorIdx);
    toast("You walked in");
  });

  document.getElementById("btn-join-room").addEventListener("click", () => {
    const room = document
      .getElementById("room")
      .value.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 48);
    if (!room) return;
    state.room = room;
    state.messages = [];
    // clear actors except self
    const stage = document.getElementById("stage");
    for (const [k, a] of [...state.actors]) {
      if (state.joined && k === actorKey(state.nick)) continue;
      a.el.remove();
      state.actors.delete(k);
    }
    if (state.joined) ensureActor(actorKey(state.nick), state.nick, state.colorIdx);
    poll();
  });

  document.getElementById("compose").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("msg");
    const text = input.value.trim();
    if (!text || !state.joined) return;
    input.value = "";
    try {
      await sendMessage(text);
    } catch (err) {
      toast(err.message || "Send failed");
    }
  });

  // boot
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (saved?.nick) {
      document.getElementById("nick").value = saved.nick;
      state.colorIdx = saved.colorIdx || 0;
      if (saved.room) {
        state.room = saved.room;
        document.getElementById("room").value = saved.room;
      }
    }
  } catch {
    /* ignore */
  }
  buildPalette();
  poll();
  pollTimer = setInterval(poll, 2800);
  walkTimer = setInterval(wander, 2200);
})();
