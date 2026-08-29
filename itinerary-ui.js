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
    installSharePrivacyControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
