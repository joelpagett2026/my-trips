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

    // `place` and `poi` are current Point of Interest types; `act` is retained
    // for legacy POIs. Ticket/attraction are the green attraction records.
    const eligibleTypes = new Set(['place', 'poi', 'act', 'ticket', 'attraction']);
    const isEligible = item => !!item && eligibleTypes.has(item.type);

    const style = document.createElement('style');
    style.id = 'itinerary-completion-style';
    style.textContent = `
      .tl-complete-btn {
        width:30px;height:30px;flex:0 0 30px;align-self:center;display:inline-flex;
        align-items:center;justify-content:center;padding:0;margin-left:1px;
        border:1.5px solid rgba(14,122,135,.45);border-radius:50%;
        background:rgba(14,122,135,.05);color:#0e7a87;cursor:pointer;
        transition:background .14s ease,border-color .14s ease,color .14s ease,transform .12s ease;
        position:relative;z-index:3;
      }
      .tl-complete-btn svg {width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;opacity:0;transform:scale(.72);transition:opacity .12s ease,transform .12s ease;}
      .tl-complete-btn:hover {background:rgba(14,122,135,.11);border-color:#0e7a87;}
      .tl-complete-btn:active {transform:scale(.93);}
      .tl-complete-btn.is-done {background:#0e7a87;border-color:#0e7a87;color:#fff;}
      .tl-item:has(.tl-ico.ticket) .tl-complete-btn {border-color:rgba(90,137,104,.45);background:rgba(90,137,104,.05);color:#5A8968;}
      .tl-item:has(.tl-ico.ticket) .tl-complete-btn:hover {background:rgba(90,137,104,.11);border-color:#5A8968;}
      .tl-item:has(.tl-ico.ticket) .tl-complete-btn.is-done {background:#5A8968;border-color:#5A8968;color:#fff;}
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
      #ts-completion-reset .ts-completion-copy {font-size:10.5px;color:var(--text3);line-height:1.5;margin-bottom:8px;}
      #ts-completion-reset .ts-completion-status {font-size:10.5px;color:var(--text3);margin-top:7px;}
      @media (max-width:700px) {
        .tl-complete-btn {width:34px;height:34px;flex-basis:34px;margin-left:0;}
        .tl-complete-btn svg {width:15px;height:15px;}
      }
    `;
    document.head.appendChild(style);

    function completedCount() {
      if (typeof STATE === 'undefined' || !Array.isArray(STATE.days)) return 0;
      let count = 0;
      STATE.days.forEach(day => (day.items || []).forEach(item => {
        if (isEligible(item) && item.completed === true) count++;
      }));
      return count;
    }

    function updateResetControl(message) {
      const button = document.getElementById('ts-reset-completed-btn');
      const status = document.getElementById('ts-completion-status');
      if (!button || !status) return;
      const count = completedCount();
      button.disabled = count === 0;
      button.style.opacity = count === 0 ? '.55' : '1';
      button.style.cursor = count === 0 ? 'default' : 'pointer';
      if (message) {
        status.textContent = message;
      } else if (count === 0) {
        status.textContent = 'No Points of Interest or Attractions are currently marked complete.';
      } else {
        status.textContent = `${count} item${count === 1 ? '' : 's'} currently marked complete.`;
      }
    }

    function resetCompletedItems() {
      const count = completedCount();
      if (!count) return;
      const confirmed = confirm(`Reset ${count} completed item${count === 1 ? '' : 's'}? This will mark all Points of Interest and Attractions as not done.`);
      if (!confirmed) return;

      if (typeof takeSnapshot === 'function') takeSnapshot();
      STATE.days.forEach(day => (day.items || []).forEach(item => {
        if (isEligible(item) && item.completed === true) delete item.completed;
      }));
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof renderTimeline === 'function') renderTimeline();
      updateResetControl('All completed Points of Interest and Attractions have been reset.');
    }

    function installResetControl() {
      const overlay = document.getElementById('trip-settings-overlay');
      const body = overlay?.querySelector('.modal-body');
      if (!body || document.getElementById('ts-completion-reset')) return;

      const dangerLabel = [...body.querySelectorAll('.field-label')]
        .find(label => label.textContent.trim().toLowerCase() === 'danger zone');
      const dangerGroup = dangerLabel?.closest('.field-group');
      const group = document.createElement('div');
      group.className = 'field-group';
      group.id = 'ts-completion-reset';
      group.style.cssText = 'border-top:1px solid var(--line);padding-top:13px;';
      group.innerHTML = `
        <label class="field-label">Completed itinerary items</label>
        <div class="ts-completion-copy">Reset all completed Points of Interest and Attractions back to their normal, unticked state. This does not remove or change any itinerary items.</div>
        <button class="modal-btn secondary" id="ts-reset-completed-btn" type="button" style="width:100%;">Reset completed items</button>
        <div class="ts-completion-status" id="ts-completion-status"></div>`;
      if (dangerGroup) body.insertBefore(group, dangerGroup);
      else body.appendChild(group);
      group.querySelector('#ts-reset-completed-btn')?.addEventListener('click', resetCompletedItems);
      updateResetControl();
    }

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
        if (!isEligible(item)) {
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
            if (!isEligible(latest)) return;
            if (typeof takeSnapshot === 'function') takeSnapshot();
            latest.completed = latest.completed !== true;
            syncState(row, button, latest);
            updateResetControl();
            if (typeof scheduleSave === 'function') scheduleSave();
          });

          const more = row.querySelector('.tl-more-btn');
          const body = row.querySelector('.tl-body-wrap');
          if (more && more.parentNode) more.parentNode.insertBefore(button, more);
          else if (body) body.appendChild(button);
        }
        syncState(row, button, item);
      });
      updateResetControl();
    }

    installResetControl();

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

  function installTripPlanningOverviewRedesign() {
    if (window.__tripPlanningOverviewRedesignInstalled) return;
    window.__tripPlanningOverviewRedesignInstalled = true;

    const style = document.createElement('style');
    style.id = 'trip-planning-overview-redesign';
    style.textContent = `
      #rp-readiness .tpo-card {
        background:var(--surface,#fff);
        border-radius:0 0 12px 12px;
        padding:7px 7px 6px;
        overflow:hidden;
      }
      #rp-readiness .tpo-cats {
        display:grid;
        grid-template-columns:repeat(5,minmax(0,1fr));
        align-items:start;
        width:100%;
      }
      #rp-readiness .tpo-cat {
        min-width:0;
        position:relative;
        display:flex;
        flex-direction:column;
        align-items:center;
        text-align:center;
        padding:0 3px;
      }
      #rp-readiness .tpo-cat + .tpo-cat::before {
        content:'';
        position:absolute;
        left:0;
        top:2px;
        bottom:2px;
        width:1px;
        background:var(--line,rgba(0,0,0,.07));
      }
      #rp-readiness .tpo-icon-wrap {
        width:34px;
        height:34px;
        position:relative;
        flex:0 0 34px;
        margin-bottom:2px;
      }
      #rp-readiness .tpo-icon {
        width:34px;
        height:34px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
      }
      #rp-readiness .tpo-cat--things .tpo-icon { border-radius:10px; }
      #rp-readiness .tpo-icon svg { width:18px;height:18px;display:block; }
      #rp-readiness .tpo-check {
        position:absolute;
        top:-2px;
        right:-3px;
        width:15px;
        height:15px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#55b86a;
        color:#fff;
        box-shadow:0 0 0 1.5px #fff;
      }
      #rp-readiness .tpo-check svg { width:9px;height:9px; }
      #rp-readiness .tpo-name {
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        font-size:8px;
        line-height:1.1;
        font-weight:800;
        letter-spacing:.01em;
        color:var(--text,#1a2428);
      }
      #rp-readiness .tpo-status {
        margin-top:1px;
        font-size:8px;
        line-height:1.1;
        font-weight:600;
      }
      #rp-readiness .tpo-count {
        margin-top:1px;
        font-size:13px;
        line-height:1;
        font-weight:800;
      }
      #rp-readiness .tpo-progress {
        display:flex;
        align-items:center;
        gap:7px;
        padding:0 4px;
        margin-top:6px;
        height:10px;
      }
      #rp-readiness .tpo-progress-track {
        position:relative;
        flex:1;
        height:6px;
        border-radius:999px;
        overflow:hidden;
        background:rgba(14,122,135,.12);
      }
      #rp-readiness .tpo-progress-fill {
        position:absolute;
        inset:0 auto 0 0;
        height:100%;
        border-radius:inherit;
        background:linear-gradient(90deg,#0e7a87 0%,#0d9e8c 100%);
        transition:width .25s ease;
      }
      #rp-readiness .tpo-progress-pct {
        width:29px;
        flex:0 0 29px;
        text-align:right;
        font-size:9px;
        line-height:1;
        font-weight:800;
        color:#0e7a87;
      }
      @media (max-width:420px) {
        #rp-readiness .tpo-card { padding-left:5px;padding-right:5px; }
        #rp-readiness .tpo-cat { padding-left:2px;padding-right:2px; }
        #rp-readiness .tpo-icon-wrap,
        #rp-readiness .tpo-icon { width:31px;height:31px;flex-basis:31px; }
        #rp-readiness .tpo-icon svg { width:16px;height:16px; }
        #rp-readiness .tpo-name { font-size:7.2px; }
        #rp-readiness .tpo-status { font-size:7.3px; }
        #rp-readiness .tpo-count { font-size:12px; }
      }
    `;
    document.head.appendChild(style);

    const originalRender = typeof window.renderSidebarReadiness === 'function'
      ? window.renderSidebarReadiness
      : null;
    if (!originalRender) return;

    function renderRedesign() {
      const root = document.getElementById('rp-readiness');
      if (!root || typeof STATE === 'undefined' || !Array.isArray(STATE.days)) return;

      const days = STATE.days || [];
      const N = days.length;
      const getHotelForDay = typeof hotelForDay === 'function' ? hotelForDay : () => null;
      const hasBreakfast = hotel => {
        if (!hotel) return false;
        const value = String(hotel.breakfast || '').toLowerCase();
        return !!value && value !== 'not included' && value !== 'no' && value !== 'none';
      };
      const hasTransport = day => (day?.items || []).some(item => item && item.type === 'move');
      const outboundOk = N > 0 && hasTransport(days[0]);
      const returnOk = N > 1 && hasTransport(days[N - 1]);

      const nights = Math.max(N - 1, 0);
      let hotelDone = 0;
      for (let i = 0; i < nights; i++) {
        if (getHotelForDay(i) || days[i]?.noAccommodation) hotelDone++;
      }

      let mealDone = 0;
      days.forEach((day, index) => {
        const hasMeal = (day.items || []).some(item => item && item.type === 'meal');
        if (hasMeal || hasBreakfast(getHotelForDay(index))) mealDone++;
      });
      const mealTotal = N;

      const middleDays = Math.max(N - 2, 0);
      let activityDone = 0;
      for (let i = 1; i < N - 1; i++) {
        if ((days[i].items || []).some(item => item && ['place','poi','act','ticket','attraction'].includes(item.type))) activityDone++;
      }

      const total = 2 + nights + mealTotal + middleDays;
      const done = (outboundOk ? 1 : 0) + (returnOk ? 1 : 0) + hotelDone + mealDone + activityDone;
      const pct = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 100;

      const flightsOk = outboundOk && returnOk;
      const hotelsOk = hotelDone === nights;
      const mealsOk = mealDone === mealTotal;
      const activitiesOk = activityDone === middleDays;

      let flightCount = 0;
      let mealCount = 0;
      let attractionCount = 0;
      let thingsCount = 0;
      days.forEach((day, index) => {
        const items = day.items || [];
        items.forEach(item => {
          if (!item) return;
          if (item.type === 'move') {
            const mode = String(item.transport?.mode || item.kicker || '').toLowerCase();
            if (mode.includes('flight')) flightCount++;
          } else if (item.type === 'ticket' || item.type === 'attraction') {
            attractionCount++;
          } else if (item.type === 'place' || item.type === 'poi' || item.type === 'act') {
            thingsCount++;
          }
        });
        if (items.some(item => item && item.type === 'meal') || hasBreakfast(getHotelForDay(index))) mealCount++;
      });

      const hotelCount = Array.isArray(STATE.meta?.hotels) ? STATE.meta.hotels.length : 0;
      const checkBadge = '<span class="tpo-check"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>';
      const categories = [
        {
          label:'FLIGHTS', count:flightCount, ok:flightsOk, color:'#526B82', bg:'rgba(82,107,130,.12)',
          icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2h0A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>'
        },
        {
          label:'HOTELS', count:hotelCount, ok:hotelsOk, color:'#6E5090', bg:'rgba(110,80,144,.12)',
          icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/></svg>'
        },
        {
          label:'MEALS', count:mealCount, ok:mealsOk, color:'#d97b0a', bg:'rgba(217,123,10,.12)',
          icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>'
        },
        {
          label:'ATTRACTIONS', count:attractionCount, ok:activitiesOk, color:'#5A8968', bg:'rgba(90,137,104,.12)',
          icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v3.1a3 3 0 0 0 0 5.8V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3.1a3 3 0 0 0 0-5.8V6a2 2 0 0 1 2-2zm8 3.25a1 1 0 0 0-1 1v7.5a1 1 0 1 0 2 0v-7.5a1 1 0 0 0-1-1z"/></svg>'
        },
        {
          label:'THINGS TO DO', count:thingsCount, ok:activitiesOk, color:'#3F8190', bg:'rgba(63,129,144,.10)', className:'tpo-cat--things',
          icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2a7 7 0 0 0-7 7c0 5.12 7 12 7 12s7-6.88 7-12a7 7 0 0 0-7-7zm0 4.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" clip-rule="evenodd"/><ellipse cx="12" cy="21.1" rx="5.4" ry="1.4" opacity=".28"/></svg>'
        }
      ];

      root.innerHTML = `
        <div class="tpo-card" aria-label="Trip planning progress ${pct}%">
          <div class="tpo-cats">
            ${categories.map(category => `
              <div class="tpo-cat ${category.className || ''}">
                <div class="tpo-icon-wrap">
                  <div class="tpo-icon" style="background:${category.bg};color:${category.color}">${category.icon}</div>
                  ${category.ok ? checkBadge : ''}
                </div>
                <div class="tpo-name">${category.label}</div>
                <div class="tpo-status" style="color:${category.ok ? category.color : 'var(--text3,#9aacb0)'}">${category.ok ? 'Complete' : 'Planned'}</div>
                <div class="tpo-count" style="color:${category.color}">${category.count}</div>
              </div>`).join('')}
          </div>
          <div class="tpo-progress">
            <div class="tpo-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
              <div class="tpo-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="tpo-progress-pct">${pct}%</div>
          </div>
        </div>`;
    }

    window.renderSidebarReadiness = function (...args) {
      const result = originalRender.apply(this, args);
      try { renderRedesign(); }
      catch (error) { console.error('Trip planning overview redesign failed', error); }
      return result;
    };

    try { renderRedesign(); }
    catch (error) { console.error('Trip planning overview redesign failed', error); }
  }

  function init() {
    installMobileBrowserViewportFix();
    loadBudgetPresentation();
    installItineraryCompletionTicks();
    installSharePrivacyControls();
    installTripPlanningOverviewRedesign();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();