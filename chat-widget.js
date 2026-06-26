(function() {
  // ── STYLES ─────────────────────────────────────────────────────────
  const css = `
    #jt-chat-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9000;
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(135deg, #0e7a87, #0d9e8c);
      border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(14,122,135,0.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #jt-chat-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(14,122,135,0.55); }
    #jt-chat-btn svg { width: 22px; height: 22px; }

    #jt-chat-panel {
      position: fixed; bottom: 88px; right: 24px; z-index: 9000;
      width: 360px; max-height: 520px;
      background: #fff; border-radius: 18px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      display: none; flex-direction: column; overflow: hidden;
      font-family: 'Montserrat', sans-serif;
    }
    #jt-chat-panel.open { display: flex; }

    #jt-chat-header {
      background: linear-gradient(135deg, #0e7a87, #0d9e8c);
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
    }
    #jt-chat-header-title { color: #fff; font-size: 14px; font-weight: 700; flex: 1; }
    #jt-chat-header-sub { color: rgba(255,255,255,0.65); font-size: 11px; font-weight: 500; }
    #jt-chat-close {
      background: rgba(255,255,255,0.2); border: none; border-radius: 8px;
      color: #fff; width: 28px; height: 28px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    #jt-chat-close:hover { background: rgba(255,255,255,0.3); }

    #jt-chat-messages {
      flex: 1; overflow-y: auto; padding: 14px; display: flex;
      flex-direction: column; gap: 10px; min-height: 200px;
    }

    .jt-msg {
      max-width: 85%; padding: 9px 13px; border-radius: 14px;
      font-size: 13px; line-height: 1.5; word-wrap: break-word;
    }
    .jt-msg.user {
      background: #0e7a87; color: #fff; align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .jt-msg.assistant {
      background: #f2f2f7; color: #333; align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .jt-msg.typing { color: #999; font-style: italic; }

    #jt-chat-input-area {
      border-top: 1px solid #e8e8e8; padding: 10px 12px;
      display: flex; gap: 8px; align-items: flex-end;
    }
    #jt-chat-input {
      flex: 1; border: 1.5px solid #e0e0e0; border-radius: 10px;
      padding: 8px 12px; font-family: 'Montserrat', sans-serif;
      font-size: 13px; resize: none; outline: none; max-height: 100px;
      line-height: 1.4; color: #333;
    }
    #jt-chat-input:focus { border-color: #0e7a87; }
    #jt-chat-send {
      background: #0e7a87; border: none; border-radius: 10px;
      width: 36px; height: 36px; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    #jt-chat-send:hover { background: #0a6570; }
    #jt-chat-send:disabled { background: #ccc; cursor: default; }
    #jt-chat-send svg { width: 16px; height: 16px; }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── HTML ────────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'jt-chat-btn';
  btn.title = 'Chat with Claude';
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  const panel = document.createElement('div');
  panel.id = 'jt-chat-panel';
  panel.innerHTML = `
    <div id="jt-chat-header">
      <div>
        <div id="jt-chat-header-title">Trip Planner Assistant</div>
        <div id="jt-chat-header-sub">Powered by Claude</div>
      </div>
      <button id="jt-chat-close">✕</button>
    </div>
    <div id="jt-chat-messages">
      <div class="jt-msg assistant">Hi Joel! I can answer questions about your trips or make changes — like updating a status, adding a trip, or editing details. What would you like to do?</div>
    </div>
    <div id="jt-chat-input-area">
      <textarea id="jt-chat-input" rows="1" placeholder="Ask me anything about your trips…"></textarea>
      <button id="jt-chat-send">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>`;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // ── LOGIC ───────────────────────────────────────────────────────────
  const messagesEl = document.getElementById('jt-chat-messages');
  const inputEl    = document.getElementById('jt-chat-input');
  const sendBtn    = document.getElementById('jt-chat-send');
  const history    = []; // { role, content }

  btn.addEventListener('click', () => panel.classList.toggle('open'));
  document.getElementById('jt-chat-close').addEventListener('click', () => panel.classList.remove('open'));

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', send);

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'jt-msg ' + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function getContext() {
    try {
      const reg = await window.dbLoadRegistry();
      const trips = (reg || []).filter(t => !t.deleted);
      return {
        trips: trips.map(t => ({ dest: t.dest, dep: t.dep, ret: t.ret, status: t.status, slug: t.slug, url: t.url })),
        currentPage: window.location.pathname,
        currentDest: (typeof dest !== 'undefined') ? dest : null,
      };
    } catch { return {}; }
  }

  async function applyActions(text) {
    // Parse any JSON action blocks from the response
    const actionRegex = /\{[^{}]*"action"\s*:[^{}]*\}/g;
    const matches = text.match(actionRegex) || [];
    for (const match of matches) {
      try {
        const action = JSON.parse(match);
        if (action.action === 'update_status') {
          const trips = await window.dbLoadRegistry();
          const trip = trips.find(t => t.slug === action.slug);
          if (trip) { trip.status = action.status; await window.dbSaveRegistry(trips); }
        } else if (action.action === 'update_trip') {
          const trips = await window.dbLoadRegistry();
          const trip = trips.find(t => t.slug === action.slug);
          if (trip) { Object.assign(trip, action.fields); await window.dbSaveRegistry(trips); }
        } else if (action.action === 'remove_trip') {
          const trips = await window.dbLoadRegistry();
          const updated = trips.filter(t => t.slug !== action.slug);
          updated.push({ deleted: action.slug });
          await window.dbSaveRegistry(updated);
        }
      } catch { /* silent */ }
    }
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;

    addMsg('user', text);
    history.push({ role: 'user', content: text });

    const typing = addMsg('typing assistant', 'Claude is thinking…');

    try {
      const context = await getContext();
      const token = (() => { try { return JSON.parse(localStorage.getItem('jh_auth')||'null')?.token||''; } catch { return ''; } })();

      const res = await fetch('/api.php?action=chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ messages: history, context }),
      });
      const data = await res.json();
      typing.remove();

      if (data.ok) {
        const reply = data.data.reply;
        // Strip action JSON blocks from display
        const displayText = reply.replace(/\{[^{}]*"action"\s*:[^{}]*\}/g, '').trim();
        addMsg('assistant', displayText);
        history.push({ role: 'assistant', content: reply });
        await applyActions(reply);
      } else {
        addMsg('assistant', 'Sorry, something went wrong. Please try again.');
      }
    } catch(e) {
      typing.remove();
      addMsg('assistant', 'Connection error. Please try again.');
    }

    sendBtn.disabled = false;
  }
})();
