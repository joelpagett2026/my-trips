// MY TRIPS — itinerary-only UI bootstrap
// Presentation enhancements that belong only on itinerary/share renders, not in
// the global authentication/database clients.
(function () {
  function loadBudgetPresentation() {
    if (!document.getElementById('budget-main')) return;
    if (document.querySelector('script[data-budget-live-redesign]')) return;

    const script = document.createElement('script');
    script.src = '/budget-live-redesign.js?v=4';
    script.dataset.budgetLiveRedesign = '1';
    script.onload = () => { document.documentElement.dataset.budgetRedesign = 'loaded'; };
    script.onerror = () => { console.error('Budget redesign asset failed to load'); };
    document.head.appendChild(script);
  }

  function installMobileBrowserViewportFix() {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;

    // The installed web-app/standalone layout already has its own tuned viewport
    // sizing in trip.php and must not be changed here. This fix is only for a trip
    // opened in a normal mobile browser, where 100vh can extend underneath the
    // browser toolbar and make the final Trip Planning Overview card look clipped.
    const isStandalone = window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
    if (isStandalone) return;

    if (document.getElementById('mobile-browser-viewport-fix')) return;
    const style = document.createElement('style');
    style.id = 'mobile-browser-viewport-fix';
    style.textContent = `
      @media (max-width: 768px) {
        html, body {
          height: 100vh !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
        }
        .v2-main {
          height: 100vh !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          min-height: 0 !important;
        }
        .rp-col {
          padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px)) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installItineraryCompletionTicks() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('share')) return; // Owner-only state change.
    if (window.__itineraryCompletionInstalled) return;
    window.__itineraryCompletionInstalled = true;

    const eligibleTypes = new Set(['act', 'ticket', 'attraction']);
    const style = document.createElement('style');
    style.id = 'itinerary-completion-style';
    style.textContent = `
      .tl-complete-btn {
        width:30px;height:30px;flex:0 0 30px;align-self:center;display:inline-flex;
        align-items:center;justify-content:center;padding:0;margin-left:1px;
        border:1.5px solid rgba(90,137,104,.45);border-radius:50%;
        background:rgba(90,137,104,.05);color:#5A8968;cursor:pointer;
        transition:background .14s ease,border-color .14s ease,color .14s ease,transform .12s ease;
        position:relative;z-index:3;
      }
      .tl-complete-btn svg {width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;opacity:0;transform:scale(.72);transition:opacity .12s ease,transform .12s ease;}
      .tl-complete-btn:hover {background:rgba(90,137,104,.11);border-color:#5A8968;}
      .tl-complete-btn:active {transform:scale(.93);}
      .tl-complete-btn.is-done {background:#5A8968;border-color:#5A8968;color:#fff;}
      .tl-complete-btn.is-done svg {opacity:1;transform:scale(1);}
      .tl-item.tl-completed {background:rgba(0,0,0,.018);}
      .tl-item.tl-completed .tl-time,
      .tl-item.tl-completed .tl-text,
      .tl-item.tl-completed .tl-ico,
      .tl-item.tl-completed .tl-price,
      .tl-item.tl-completed .tl-ticket-status,
      .tl-item.tl-completed .badge {opacity:.52;filter:grayscale(.28);}
      .tl-item.tl-completed .tl-dot {background:#aeb8bb !important;box-shadow:none !important;}
      .tl-item.tl-completed .tl-title {color:var(--text2);}
      @media (max-width:700px) {
        .tl-complete-btn {width:34px;height:34px;flex-basis:34px;margin-left:0;}
        .tl-complete-btn svg {width:15px;height:15px;}
      }
    `;
    document.head.appendChild(style);

    function itemForRow(row) {
      if (typeof STATE === 'undefined' || typeof activeDay === 'undefined') return null;
      const idx = Number(row.dataset.idx);
      if (!Number.isInteger(idx)) return null;
      return STATE.days?.[activeDay]?.items?.[idx] || null;
    }

    function syncState(row, button, item) {
      const done = item.completed === true;
      row.classList.toggle('tl-completed', done);
      button.classList.toggle('is-done', done);
      button.setAttribute('aria-pressed', done ? 'true' : 'false');
      button.setAttribute('aria-label', done ? `Mark ${item.title || 'item'} as not done` : `Mark ${item.title || 'item'} as done`);
      button.title = done ? 'Completed — click to undo' : 'Mark as completed';
    }

    function decorateTimeline() {
      const root = document.getElementById('tl-col');
      if (!root) return;

      root.querySelectorAll('.tl-item').forEach(row => {
        const item = itemForRow(row);
        if (!item || !eligibleTypes.has(item.type)) {
          row.classList.remove('tl-completed');
          row.querySelector('.tl-complete-btn')?.remove();
          return;
        }

        let button = row.querySelector('.tl-complete-btn');
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'tl-complete-btn';
          button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="5 12.5 9.2 16.5 19 6.5"></polyline></svg>';
          button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const latest = itemForRow(row);
            if (!latest || !eligibleTypes.has(latest.type)) return;
            if (typeof takeSnapshot === 'function') takeSnapshot();
            latest.completed = latest.completed !== true;
            syncState(row, button, latest);
            if (typeof scheduleSave === 'function') scheduleSave();
          });

          const more = row.querySelector('.tl-more-btn');
          const body = row.querySelector('.tl-body-wrap');
          if (more && more.parentNode) more.parentNode.insertBefore(button, more);
          else if (body) body.appendChild(button);
        }
        syncState(row, button, item);
      });
    }

    const root = document.getElementById('tl-col');
    if (!root) return;
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        decorateTimeline();
      });
    });
    observer.observe(root, { childList:true, subtree:true });
    decorateTimeline();
  }

  function installSharePrivacyControls() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('share')) return; // Public shared copies must remain read-only.
    if (!document.getElementById('share-overlay')) return;
    if (typeof RECORD_ID === 'undefined') return;

    const shareLinkUrl = token => location.origin + '/share.php?share=1&t=' + token;

    function status(message) {
      const el = document.getElementById('share-status');
      if (!el) return;
      el.textContent = message || '';
      el.style.display = message ? 'block' : 'none';
    }

    function authToken() {
      return typeof getToken === 'function' ? getToken() : '';
    }

    async function shareApi(action, { params = {}, body = null, method = null } = {}) {
      const url = new URL('/share.php', location.origin);
      url.searchParams.set('action', action);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      const options = {
        method: method || (body ? 'POST' : 'GET'),
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': authToken(),
        },
      };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(url.toString(), options);
      let json;
      try { json = await response.json(); }
      catch { throw new Error(`Share service returned HTTP ${response.status}`); }

      if (!response.ok || json.ok === false) {
        if (response.status === 401) {
          document.dispatchEvent(new CustomEvent('mytrips:auth-expired'));
        }
        throw new Error(json.error || `Share request failed (${response.status})`);
      }
      return json.data;
    }

    function formatDate(value) {
      const d = new Date((value || '').replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function installCreateButtons() {
      const oldButton = document.querySelector('#share-overlay button[onclick="createShareLink()"]');
      const host = oldButton ? oldButton.closest('.field-group') : document.getElementById('share-create-modes');
      if (!host || host.dataset.shareModesInstalled === '1') return;
      host.dataset.shareModesInstalled = '1';
      host.id = 'share-create-modes';
      host.innerHTML = `
        <div style="font-size:10.5px;font-weight:700;color:var(--text2);margin-bottom:2px;">Create a new read-only link</div>
        <div style="font-size:10px;color:var(--text3);line-height:1.45;margin-bottom:8px;">Choose whether booking references are visible to the person you share it with.</div>
        <button class="modal-btn secondary" style="width:100%;margin-bottom:7px;" type="button" onclick="createShareLink(false)">+ Create link — hide booking references</button>
        <button class="modal-btn secondary" style="width:100%;" type="button" onclick="createShareLink(true)">+ Create link — include booking references</button>`;
    }

    async function renderLinks() {
      const list = document.getElementById('share-links-list');
      if (!list) return;
      list.innerHTML = '<div style="font-size:10.5px;color:var(--text3);">Loading…</div>';
      try {
        const shares = await shareApi('list_shares', { params: { trip_id: RECORD_ID } }) || [];
        if (!shares.length) {
          list.innerHTML = '<div style="font-size:10.5px;color:var(--text3);">No active share links yet.</div>';
          return;
        }

        list.innerHTML = '';
        shares.forEach(share => {
          const token = String(share.token || '');
          if (!/^[a-f0-9]{24}$/i.test(token)) return;
          const url = shareLinkUrl(token);
          const showRefs = share.show_refs === true || Number(share.show_refs) === 1;
          const row = document.createElement('div');
          row.className = 'share-link-row';
          row.innerHTML = `
            <div class="slr-top">
              <div class="slr-url"></div>
              <button class="slr-btn" type="button">Copy</button>
              <button class="slr-btn slr-revoke" type="button">Revoke</button>
            </div>
            <div class="slr-bottom" style="align-items:center;gap:7px;flex-wrap:wrap;">
              <div class="slr-date">Created ${formatDate(share.created_at)}</div>
              <div style="font-size:9px;font-weight:700;padding:3px 6px;border-radius:999px;background:${showRefs ? 'rgba(14,122,135,.10)' : 'rgba(68,68,68,.08)'};color:${showRefs ? '#0e7a87' : 'var(--text3)'};">${showRefs ? 'Booking refs included' : 'Booking refs hidden'}</div>
            </div>`;
          row.querySelector('.slr-url').textContent = url;
          const buttons = row.querySelectorAll('.slr-btn');
          buttons[0].addEventListener('click', () => window.copyShareLink(token));
          buttons[1].addEventListener('click', () => window.revokeShareLink(token));
          list.appendChild(row);
        });
      } catch (error) {
        list.innerHTML = '<div style="font-size:10.5px;color:#e53e3e;">Could not load share links.</div>';
        status(error && error.message ? error.message : 'Could not load share links.');
      }
    }

    async function createLink(showRefs = false) {
      status('Creating…');
      try {
        const result = await shareApi('create_share', {
          method: 'POST',
          body: { trip_id: RECORD_ID, show_refs: !!showRefs },
        });
        const token = String(result?.token || '');
        if (!/^[a-f0-9]{24}$/i.test(token)) throw new Error('Share service returned an invalid link');

        let copied = false;
        if (navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(shareLinkUrl(token));
            copied = true;
          } catch {}
        }
        status(`${showRefs ? 'Full' : 'Private'} share link created${copied ? ' and copied to clipboard' : ''}.`);
        await renderLinks();
      } catch (error) {
        status('Could not create share link. ' + (error && error.message ? error.message : 'Unknown error'));
      }
    }

    async function copyLink(token) {
      const url = shareLinkUrl(token);
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        status('Link copied to clipboard.');
      } catch {
        prompt('Share link (copy it):', url);
      }
    }

    async function revokeLink(token) {
      if (!confirm('Revoke this share link? Anyone using it will lose access immediately.')) return;
      try {
        await shareApi('revoke_share', { params: { token }, method: 'DELETE' });
        status('Link revoked.');
        await renderLinks();
      } catch (error) {
        status('Could not revoke this link. ' + (error && error.message ? error.message : 'Unknown error'));
      }
    }

    async function openModal() {
      status('');
      installCreateButtons();
      document.getElementById('share-overlay')?.classList.add('open');
      await renderLinks();
    }

    // Override only the share-management surface. All itinerary editing/saving
    // continues to use the existing tested functions untouched.
    window.shareUrl = shareLinkUrl;
    window.openShareModal = openModal;
    window.renderShareLinks = renderLinks;
    window.createShareLink = createLink;
    window.copyShareLink = copyLink;
    window.revokeShareLink = revokeLink;

    const desktopShareButton = document.getElementById('tb-share');
    if (desktopShareButton) desktopShareButton.onclick = openModal;
    document.querySelectorAll('[onclick="openShareModal()"]').forEach(button => {
      button.onclick = openModal;
    });

    installCreateButtons();
  }

  function init() {
    installMobileBrowserViewportFix();
    loadBudgetPresentation();
    installItineraryCompletionTicks();
    installSharePrivacyControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
