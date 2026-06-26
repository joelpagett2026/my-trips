(function() {
  const css = `
    #jt-chat-btn {
      position:fixed;bottom:24px;right:24px;z-index:9000;
      width:52px;height:52px;border-radius:50%;
      background:linear-gradient(135deg,#0e7a87,#0d9e8c);
      border:none;cursor:pointer;box-shadow:0 4px 16px rgba(14,122,135,0.45);
      display:flex;align-items:center;justify-content:center;
      transition:transform 0.2s,box-shadow 0.2s;
    }
    #jt-chat-btn:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(14,122,135,0.55);}
    #jt-chat-panel {
      position:fixed;bottom:88px;right:24px;z-index:9000;
      width:380px;max-height:560px;background:#fff;border-radius:18px;
      box-shadow:0 8px 40px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.08);
      display:none;flex-direction:column;overflow:hidden;
      font-family:'Montserrat',sans-serif;
    }
    #jt-chat-panel.open{display:flex;}
    #jt-chat-header {
      background:linear-gradient(135deg,#0e7a87,#0d9e8c);
      padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;
    }
    #jt-chat-header-title{color:#fff;font-size:14px;font-weight:700;flex:1;}
    #jt-chat-header-sub{color:rgba(255,255,255,0.65);font-size:11px;font-weight:500;}
    #jt-chat-close {
      background:rgba(255,255,255,0.2);border:none;border-radius:8px;
      color:#fff;width:28px;height:28px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;font-size:16px;
    }
    #jt-chat-close:hover{background:rgba(255,255,255,0.3);}
    #jt-chat-messages {
      flex:1;overflow-y:auto;padding:14px;display:flex;
      flex-direction:column;gap:10px;min-height:200px;
    }
    .jt-msg{max-width:88%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.5;word-wrap:break-word;}
    .jt-msg.user{background:#0e7a87;color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}
    .jt-msg.assistant{background:#f2f2f7;color:#333;align-self:flex-start;border-bottom-left-radius:4px;}
    .jt-msg.typing{color:#999;font-style:italic;background:#f2f2f7;align-self:flex-start;border-bottom-left-radius:4px;}
    .jt-msg img{max-width:100%;border-radius:8px;margin-top:6px;display:block;}
    .jt-img-preview {
      display:flex;align-items:center;gap:8px;background:#e8f5f6;
      border-radius:8px;padding:6px 10px;margin:0 12px 6px;font-size:12px;color:#0e7a87;font-weight:600;
    }
    .jt-img-preview button{background:none;border:none;cursor:pointer;color:#999;font-size:16px;line-height:1;}
    #jt-chat-input-area {
      border-top:1px solid #e8e8e8;padding:10px 12px;
      display:flex;gap:8px;align-items:flex-end;flex-shrink:0;
    }
    #jt-chat-input {
      flex:1;border:1.5px solid #e0e0e0;border-radius:10px;
      padding:8px 12px;font-family:'Montserrat',sans-serif;
      font-size:13px;resize:none;outline:none;max-height:100px;line-height:1.4;color:#333;
    }
    #jt-chat-input:focus{border-color:#0e7a87;}
    .jt-btn {
      background:#0e7a87;border:none;border-radius:10px;
      width:36px;height:36px;cursor:pointer;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;transition:background 0.15s;
    }
    .jt-btn:hover{background:#0a6570;}
    .jt-btn:disabled{background:#ccc;cursor:default;}
    .jt-action-banner {
      margin:0 12px 8px;padding:7px 11px;background:#e8f5f6;
      border-radius:8px;font-size:11px;color:#0e7a87;font-weight:600;
      display:flex;align-items:center;gap:6px;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML('beforeend', `
    <button id="jt-chat-btn" title="Chat with Claude">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
    <div id="jt-chat-panel">
      <div id="jt-chat-header">
        <div>
          <div id="jt-chat-header-title">Trip Planner Assistant</div>
          <div id="jt-chat-header-sub">Powered by Claude · Full site access</div>
        </div>
        <button id="jt-chat-close">✕</button>
      </div>
      <div id="jt-chat-messages">
        <div class="jt-msg assistant">Hi Joel! I have full access to your site — I can update trips, change styles, edit pages, and more. Paste screenshots or describe what you want changed!</div>
      </div>
      <div id="jt-chat-input-area">
        <label class="jt-btn" title="Attach image" style="cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <input type="file" id="jt-img-input" accept="image/*" style="display:none;">
        </label>
        <textarea id="jt-chat-input" rows="1" placeholder="Ask anything or paste a screenshot…"></textarea>
        <button class="jt-btn" id="jt-chat-send" title="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `);

  const panel    = document.getElementById('jt-chat-panel');
  const messages = document.getElementById('jt-chat-messages');
  const input    = document.getElementById('jt-chat-input');
  const sendBtn  = document.getElementById('jt-chat-send');
  const imgInput = document.getElementById('jt-img-input');
  const history  = [];
  let pendingImage = null; // { base64, mediaType, previewUrl }

  document.getElementById('jt-chat-btn').addEventListener('click', () => panel.classList.toggle('open'));
  document.getElementById('jt-chat-close').addEventListener('click', () => panel.classList.remove('open'));

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener('click', send);

  // Image paste (Ctrl+V)
  document.addEventListener('paste', e => {
    if (!panel.classList.contains('open')) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        loadImageFile(item.getAsFile());
        break;
      }
    }
  });

  // Image file picker
  imgInput.addEventListener('change', () => {
    if (imgInput.files[0]) loadImageFile(imgInput.files[0]);
    imgInput.value = '';
  });

  function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/png';
      pendingImage = { base64, mediaType, previewUrl: dataUrl };
      showImagePreview(file.name || 'screenshot.png');
    };
    reader.readAsDataURL(file);
  }

  function showImagePreview(name) {
    const existing = document.getElementById('jt-img-preview');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'jt-img-preview'; div.id = 'jt-img-preview';
    div.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>${name}<button onclick="document.getElementById('jt-img-preview').remove(); pendingImage=null;">✕</button>`;
    document.getElementById('jt-chat-input-area').before(div);
  }

  function addMsg(role, text, imgUrl) {
    const div = document.createElement('div');
    div.className = 'jt-msg ' + role;
    if (imgUrl) {
      const img = document.createElement('img'); img.src = imgUrl; div.appendChild(img);
    }
    if (text) div.appendChild(document.createTextNode(text));
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function showActionBanner(text) {
    const div = document.createElement('div'); div.className = 'jt-action-banner';
    div.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>${text}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function getToken() {
    try { return JSON.parse(localStorage.getItem('jh_auth')||'null')?.token||''; } catch { return ''; }
  }

  async function getContext() {
    try {
      const reg = await window.dbLoadRegistry();
      const trips = (reg||[]).filter(t=>!t.deleted);
      return { trips: trips.map(t=>({dest:t.dest,dep:t.dep,ret:t.ret,status:t.status,slug:t.slug,url:t.url,flags:t.flags})), page: location.pathname };
    } catch { return {}; }
  }

  async function applyActions(text) {
    const actions = [];
    // Extract all JSON objects that have an "action" key
    const regex = /\{(?:[^{}]|\{[^{}]*\})*"action"\s*:\s*"[^"]+"/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Try to find the complete JSON object
      let depth = 0, start = match.index, end = start;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      try { actions.push(JSON.parse(text.slice(start, end))); } catch {}
    }

    for (const a of actions) {
      try {
        if (a.action === 'update_status') {
          const trips = await window.dbLoadRegistry();
          const t = trips.find(t=>t.slug===a.slug);
          if (t) { t.status = a.status; await window.dbSaveRegistry(trips); }
          showActionBanner(`Updated ${a.slug} status → ${a.status}`);

        } else if (a.action === 'update_trip') {
          const trips = await window.dbLoadRegistry();
          const t = trips.find(t=>t.slug===a.slug);
          if (t) { Object.assign(t, a.fields); await window.dbSaveRegistry(trips); }
          showActionBanner(`Updated trip: ${a.slug}`);

        } else if (a.action === 'add_trip') {
          const trips = await window.dbLoadRegistry();
          if (!trips.find(t=>t.slug===a.trip.slug)) {
            trips.push({...a.trip, created: Date.now()});
            await window.dbSaveRegistry(trips);
          }
          showActionBanner(`Added trip: ${a.trip.dest}`);

        } else if (a.action === 'remove_trip') {
          const trips = await window.dbLoadRegistry();
          const updated = trips.filter(t=>t.slug!==a.slug);
          updated.push({deleted: a.slug});
          await window.dbSaveRegistry(updated);
          showActionBanner(`Removed trip: ${a.slug}`);

        } else if (a.action === 'write_file') {
          const res = await fetch('/api.php?action=write_asset', {
            method: 'POST',
            headers: {'Content-Type':'application/json','X-Auth-Token':getToken()},
            body: JSON.stringify({filename: a.filename, content: a.content})
          });
          const data = await res.json();
          if (data.ok) showActionBanner(`Updated file: ${a.filename}`);
          else showActionBanner(`File write failed: ${a.filename}`);
        }
      } catch(e) { console.warn('Action error:', e); }
    }
  }

  async function send() {
    const text = input.value.trim();
    if (!text && !pendingImage) return;
    sendBtn.disabled = true;
    input.value = ''; input.style.height = 'auto';

    // Build user message content
    const imgPreview = pendingImage?.previewUrl;
    addMsg('user', text, imgPreview);
    document.getElementById('jt-img-preview')?.remove();

    // Build history entry
    let userContent;
    if (pendingImage) {
      userContent = [
        {type:'image',source:{type:'base64',media_type:pendingImage.mediaType,data:pendingImage.base64}},
        {type:'text',text: text || 'What do you see in this screenshot? How can I improve it?'}
      ];
    } else {
      userContent = text;
    }
    history.push({role:'user', content: userContent});
    pendingImage = null;

    const typing = addMsg('typing', 'Claude is thinking…');

    try {
      const context = await getContext();
      const res = await fetch('/api.php?action=chat', {
        method: 'POST',
        headers: {'Content-Type':'application/json','X-Auth-Token':getToken()},
        body: JSON.stringify({messages: history, context})
      });
      const data = await res.json();
      typing.remove();

      if (data.ok) {
        const reply = data.data.reply;
        const display = reply.replace(/\{(?:[^{}]|\{[^{}]*\})*"action"\s*:\s*"[^"]+"(?:[^{}]|\{[^{}]*\})*\}/g,'').replace(/\n{3,}/g,'\n\n').trim();
        if (display) addMsg('assistant', display);
        history.push({role:'assistant', content: reply});
        await applyActions(reply);
      } else {
        addMsg('assistant', 'Sorry, something went wrong: ' + (data.error || 'Unknown error'));
      }
    } catch(e) {
      typing.remove();
      addMsg('assistant', 'Connection error. Please try again.');
      console.error(e);
    }

    sendBtn.disabled = false;
  }
})();
