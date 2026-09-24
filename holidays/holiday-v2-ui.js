(function () {
  'use strict';

  const page = document.body.dataset.page;
  const period = document.body.dataset.period;
  const year = document.body.dataset.year;
  const $ = selector => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  function field(label, value, options = {}) {
    const wrap = el('label', 'v2-field' + (options.wide ? ' wide' : ''));
    wrap.appendChild(el('span', 'v2-label', label));
    const input = options.multiline ? el('textarea', 'v2-input') : el('input', 'v2-input');
    if (!options.multiline) input.type = options.type || 'text';
    input.value = value ?? '';
    input.placeholder = options.placeholder || '';
    if (options.inputMode) input.inputMode = options.inputMode;
    input.addEventListener('input', () => options.onInput?.(input.value));
    if (options.onBlur) input.addEventListener('blur', options.onBlur);
    wrap.appendChild(input);
    return wrap;
  }

  function button(label, className, onClick) {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function reorderCards(records) {
    const cards = new Map([...$('#cards').children].map(card => [card.dataset.tripId, card]));
    HolidayV2.sortedByStartDate(records).forEach(record => {
      const card = cards.get(record.id);
      if (card) $('#cards').appendChild(card);
    });
  }

  function setTotals(values, allowance, includeLieu) {
    $('#tot-days').textContent = values.days;
    $('#tot-hol').textContent = values.hol;
    if (includeLieu && $('#tot-lieu')) $('#tot-lieu').textContent = values.lieu;
    const remaining = $('#tot-remain');
    remaining.textContent = values.remaining;
    remaining.className = 'stat-val ' + (values.remaining < 0 ? 'red' : values.remaining <= 3 ? 'orange' : 'green');
    $('#remain-stat').classList.toggle('danger', values.remaining < 0);
    $('#remain-sub').textContent = values.remaining < 0
      ? Math.abs(values.remaining) + ' days over allowance'
      : values.remaining + ' of ' + allowance + ' days remaining';
  }

  function statusForJoel(trip) {
    const link = HolidayV2.findJonBySource(trip.id)?.record;
    if (!link) return { text:'Not shared', cls:'muted' };
    if (link.sourceStatus === 'cancelled') return { text:'Jon kept a cancelled copy', cls:'warning' };
    if (link.status === 'pending') return { text:'Sent to Jon · awaiting review', cls:'pending' };
    if (link.status === 'update_available') return { text:'Jon has an update to review', cls:'warning' };
    return { text:'Sent to Jon ✓', cls:'success' };
  }

  function renderJoel() {
    const trips = HolidayV2.getState().joel[period];
    const container = $('#cards');
    container.replaceChildren();
    HolidayV2.sortedByStartDate(trips).forEach(trip => {
      const card = el('article', 'v2-trip-card');
      card.dataset.tripId = trip.id;
      const top = el('div', 'v2-card-top');
      const title = field('Destination', trip.dest, { placeholder:'Where are you going?', onInput:value => { HolidayV2.updateJoelTrip(period, trip.id, {dest:value}); refreshJoelStatus(card, trip); } });
      title.classList.add('title-field');
      top.appendChild(title);
      const status = statusForJoel(trip);
      top.appendChild(el('span', 'share-status ' + status.cls, status.text));
      card.appendChild(top);

      const dates = el('div', 'v2-grid dates-grid');
      [['Start date','start'],['End date','end'],['Return date','ret']].forEach(([label,key]) => {
        dates.appendChild(field(label, trip[key], { placeholder:'dd/mm/yyyy', inputMode:'numeric', onBlur:key === 'start' ? () => reorderCards(trips) : null, onInput:value => { HolidayV2.updateJoelTrip(period, trip.id, {[key]:value}); refreshJoelStatus(card, trip); } }));
      });
      card.appendChild(dates);

      const allowance = el('div', 'v2-grid allowance-grid');
      [['Days off','days'],['Lieu time','lieu'],['Holiday days','hol']].forEach(([label,key]) => {
        allowance.appendChild(field(label, trip[key], { type:'number', inputMode:'decimal', onInput:value => { HolidayV2.updateJoelTrip(period, trip.id, {[key]:value}); updateJoelTotals(); } }));
      });
      allowance.appendChild(field('Notes', trip.notes, { wide:true, onInput:value => HolidayV2.updateJoelTrip(period, trip.id, {notes:value}) }));
      card.appendChild(allowance);

      const actions = el('div', 'v2-actions');
      const linked = HolidayV2.findJonBySource(trip.id);
      const share = button(linked ? 'Sent to Jon' : 'Send to Jon’s calendar', 'v2-btn secondary', () => {
        try {
          HolidayV2.sendToJon(period, trip.id);
          renderJoel();
        } catch (error) { alert(error.message); }
      });
      share.disabled = Boolean(linked);
      actions.appendChild(share);
      actions.appendChild(button('Delete trip', 'v2-btn danger-text', () => {
        const warning = linked
          ? 'Delete this from Joel’s allowance? Jonathan’s linked copy will be kept and marked as cancelled by Joel.'
          : 'Delete this trip?';
        if (!confirm(warning)) return;
        HolidayV2.deleteJoelTrip(period, trip.id);
        renderJoel();
      }));
      card.appendChild(actions);
      container.appendChild(card);
    });
    if (!trips.length) container.appendChild(el('div', 'v2-empty', 'No trips yet. Add one to start planning.'));
    updateJoelTotals();
  }

  function refreshJoelStatus(card, trip) {
    const status = statusForJoel(trip);
    const badge = card.querySelector('.share-status');
    badge.className = 'share-status ' + status.cls;
    badge.textContent = status.text;
  }

  function updateJoelTotals() {
    setTotals(HolidayV2.totals(HolidayV2.getState().joel[period], HolidayV2.JOEL_ALLOWANCE), HolidayV2.JOEL_ALLOWANCE, true);
  }

  function jonStatus(record) {
    if (record.sourceStatus === 'cancelled') return { text:'Joel cancelled or deleted the source trip. Your copy is safe.', cls:'cancelled' };
    if (record.status === 'pending') return { text:'Review this trip before it affects your allowance.', cls:'pending' };
    if (record.status === 'update_available') return { text:'Joel changed the shared trip details.', cls:'warning' };
    if (!record.sourceTripId) return { text:'Personal trip', cls:'muted' };
    return { text:'Reviewed · linked to Joel', cls:'success' };
  }

  function renderJon() {
    const records = HolidayV2.getState().jon[year] || [];
    const container = $('#cards');
    container.replaceChildren();
    HolidayV2.sortedByStartDate(records).forEach(record => {
      const card = el('article', 'v2-trip-card jon-card');
      card.dataset.tripId = record.id;
      const state = jonStatus(record);
      const notice = el('div', 'review-banner ' + state.cls, state.text);
      card.appendChild(notice);

      if (record.status === 'update_available' && record.latestSource) {
        const details = el('div', 'update-preview');
        details.appendChild(el('strong', '', 'Latest from Joel: '));
        details.appendChild(document.createTextNode([record.latestSource.dest, record.latestSource.start + ' – ' + record.latestSource.end].filter(Boolean).join(' · ')));
        const updateActions = el('div', 'inline-actions');
        updateActions.appendChild(button('Apply Joel’s update', 'v2-btn primary small', () => { HolidayV2.applySourceUpdate(year, record.id); renderJon(); }));
        updateActions.appendChild(button('Keep my version', 'v2-btn secondary small', () => { HolidayV2.keepJonVersion(year, record.id); renderJon(); }));
        details.appendChild(updateActions);
        card.appendChild(details);
      }

      const details = el('div', 'v2-grid jon-details-grid');
      [['Destination','dest'],['Start date','start'],['End date','end'],['Return date','ret']].forEach(([label,key], index) => {
        details.appendChild(field(label, record[key], { wide:index === 0, placeholder:key === 'dest' ? 'Destination' : 'dd/mm/yyyy', onBlur:key === 'start' ? () => reorderCards(records) : null, onInput:value => HolidayV2.updateJon(year, record.id, {[key]:value}, false) }));
      });
      card.appendChild(details);

      const calculation = el('div', 'v2-grid jon-calc-grid');
      calculation.appendChild(field('Your days off', record.days, { type:'number', inputMode:'decimal', onInput:value => { HolidayV2.updateJon(year, record.id, {days:value}, false); updateJonTotals(); } }));
      calculation.appendChild(field('Your holiday days', record.hol, { type:'number', inputMode:'decimal', onInput:value => { HolidayV2.updateJon(year, record.id, {hol:value}, false); updateJonTotals(); } }));
      calculation.appendChild(field('Bank holiday days', record.bankHolidays, { type:'number', inputMode:'decimal', onInput:value => { HolidayV2.updateJon(year, record.id, {bankHolidays:value}, false); updateJonTotals(); } }));
      calculation.appendChild(field('Working pattern / calculation', record.workPattern, { wide:true, placeholder:'How these dates affect your working days', onInput:value => HolidayV2.updateJon(year, record.id, {workPattern:value}, false) }));
      calculation.appendChild(field('Your notes', record.notes, { wide:true, placeholder:'Optional notes', onInput:value => HolidayV2.updateJon(year, record.id, {notes:value}, false) }));
      card.appendChild(calculation);

      const actions = el('div', 'v2-actions');
      actions.appendChild(button(record.status === 'pending' ? 'Save and include in allowance' : 'Save review', 'v2-btn primary', () => {
        HolidayV2.updateJon(year, record.id, {}, true);
        renderJon();
      }));
      actions.appendChild(button('Delete my copy', 'v2-btn danger-text', () => {
        if (!confirm('Delete this from Jonathan’s calendar? Joel’s trip will not be changed.')) return;
        HolidayV2.deleteJon(year, record.id);
        renderJon();
      }));
      card.appendChild(actions);
      container.appendChild(card);
    });
    if (!records.length) container.appendChild(el('div', 'v2-empty', 'No trips in ' + year + '. Shared trips will appear here for review.'));
    updateJonTotals();
  }

  function updateJonTotals() {
    const records = HolidayV2.getState().jon[year] || [];
    const totals = HolidayV2.totals(records, HolidayV2.JON_FLEXIBLE_ALLOWANCE);
    setTotals(totals, HolidayV2.JON_FLEXIBLE_ALLOWANCE, false);
    $('#holiday-used').textContent = totals.hol;
    $('#holiday-remaining').textContent = totals.remaining;
    $('#holiday-remaining').className = 'allowance-number ' + (totals.remaining < 0 ? 'red' : 'green');
    $('#bank-used').textContent = totals.bankHolidays;
    $('#bank-remaining').textContent = totals.bankRemaining;
    $('#bank-remaining').className = 'allowance-number ' + (totals.bankRemaining < 0 ? 'red' : 'green');
    $('#bank-progress').value = totals.bankHolidays;
    $('#holiday-progress').value = totals.hol;
    const pending = records.filter(item => item.status === 'pending' || item.status === 'update_available').length;
    $('#pending-count').textContent = pending;
    $('#pending-card').classList.toggle('attention', pending > 0);
  }

  async function start() {
    await HolidayV2.load();
    if (page === 'joel') {
      $('#add-trip').addEventListener('click', () => { HolidayV2.addJoelTrip(period); renderJoel(); $('#cards .v2-trip-card:last-child input')?.focus(); });
      renderJoel();
    } else {
      $('#add-trip').addEventListener('click', () => { HolidayV2.addJon(year); renderJon(); $('#cards .v2-trip-card:last-child input')?.focus(); });
      renderJon();
    }
  }

  start().catch(error => {
    console.error(error);
    $('#cards').textContent = 'Holiday data could not be loaded. Your existing saved data has not been changed.';
  });
})();

