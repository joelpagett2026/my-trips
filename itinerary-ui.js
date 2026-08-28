// MY TRIPS — itinerary-only UI bootstrap
// Keeps presentation concerns out of auth.js. This file is loaded only by trip.php.
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBudgetPresentation, { once: true });
  } else {
    loadBudgetPresentation();
  }
})();
