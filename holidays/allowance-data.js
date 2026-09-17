// Read the same trip lists and storage keys as the editable allowance pages.
window.HolidayAllowance = (() => {
  const holidayDays = 27;
  const christmasDays = 3;
  const bankHolidays = 8;
  const flexibleDays = holidayDays - christmasDays;
  const sources = ['2025-26', '2026-27', '2027-28'];

  function parsePage(html) {
    const match = html.match(/const\s+(?:trips|defaultTrips)\s*=\s*(\[.*?\]);/s);
    if (!match) throw new Error('Holiday trip data unavailable');
    return JSON.parse(match[1]);
  }

  async function loadPage(period) {
    try {
      const saved = JSON.parse(localStorage.getItem('holiday-allowance-' + period + '-v1'));
      if (Array.isArray(saved)) return saved;
    } catch (error) { /* Fall back to the original trips if storage is unavailable. */ }
    const response = await fetch('/holidays/' + period + '.html', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Holiday page unavailable');
    return parsePage(await response.text());
  }

  async function loadJonathan(year) {
    const pages = await Promise.all(sources.map(async period => {
      const trips = await loadPage(period);
      return trips.map(trip => ({ ...trip, _source: "Joel's " + period.replace('-', '/') + ' allowance' }));
    }));
    return pages.flat().filter(trip => String(trip.start || '').split('/')[2] === String(year))
      .sort((a, b) => {
        const date = trip => trip.start.split('/').reverse().join('-');
        return date(a).localeCompare(date(b));
      });
  }

  function summary(trips) {
    const used = trips.reduce((total, trip) => total + (parseFloat(trip.hol) || 0), 0);
    return { used, remaining: flexibleDays - used, total: holidayDays + bankHolidays };
  }

  return { holidayDays, christmasDays, bankHolidays, flexibleDays, loadPage, loadJonathan, summary };
})();
