// Lightweight read API used by the Holiday Allowance and home dashboards.
// V2 keeps Jonathan's reviewed calculations separate from Joel's trip records.
window.HolidayAllowance = (() => {
  const holidayDays = 27;
  const christmasDays = 3;
  const bankHolidays = 8;
  const flexibleDays = holidayDays - christmasDays;
  const localKey = 'holiday-allowance-v2';

  function localState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(localKey));
      return parsed?.version === 2 ? parsed : null;
    } catch (_) { return null; }
  }

  async function state() {
    let remote = null;
    if (typeof window.dbLoad === 'function') {
      try { remote = await window.dbLoad('holiday-allowance-v2'); } catch (_) { /* use device cache */ }
    }
    const local = localState();
    const remoteTime = Date.parse(remote?.updatedAt || 0) || 0;
    const localTime = Date.parse(local?.updatedAt || 0) || 0;
    return remoteTime > localTime ? remote : local;
  }

  async function loadPage(period) {
    const current = await state();
    if (Array.isArray(current?.joel?.[period])) return current.joel[period];
    try {
      const legacy = JSON.parse(localStorage.getItem('holiday-allowance-' + period + '-v1'));
      return Array.isArray(legacy) ? legacy : [];
    } catch (_) { return []; }
  }

  async function loadJonathan(year) {
    const current = await state();
    if (!current) return [];
    return (current.jon?.[String(year)] || [])
      .filter(trip => trip.status !== 'pending' && trip.status !== 'cancelled')
      .map(trip => ({ ...trip, _source:trip.sourceTripId ? 'Linked to Joel' : 'Jonathan’s trip' }));
  }

  function summary(trips) {
    const included = trips.filter(trip => trip.status !== 'pending' && trip.status !== 'cancelled');
    const used = included.reduce((total, trip) => total + (parseFloat(trip.hol) || 0), 0);
    return { used, remaining:flexibleDays - used, total:holidayDays + bankHolidays };
  }

  return { holidayDays, christmasDays, bankHolidays, flexibleDays, loadPage, loadJonathan, summary };
})();

