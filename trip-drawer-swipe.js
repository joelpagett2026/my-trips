// Authenticated itinerary: mobile drawer swipe-to-close compatibility helper.
(function () {
  if (!window.matchMedia || !window.matchMedia('(max-width: 768px)').matches) return;
  const drawer = document.getElementById('drawer');
  if (!drawer || drawer.dataset.mapSwipeFix === '1') return;
  drawer.dataset.mapSwipeFix = '1';

  let startY = 0, lastY = 0, tracking = false, eligible = false;
  const scrollIsAtTop = () => {
    const candidates = [drawer, document.getElementById('dr-body'), drawer.querySelector('.dr-scroll'), drawer.querySelector('.drawer-body')].filter(Boolean);
    return candidates.every(el => (el.scrollTop || 0) <= 1);
  };
  const isOpen = () => drawer.classList.contains('open') || document.getElementById('drawer-overlay')?.classList.contains('open');

  drawer.addEventListener('touchstart', e => {
    if (!isOpen() || !e.touches || e.touches.length !== 1) return;
    const target = e.target;
    const inHeader = !!target.closest('.dr-head');
    eligible = inHeader || scrollIsAtTop();
    if (!eligible) return;
    startY = lastY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  drawer.addEventListener('touchmove', e => {
    if (!tracking || !eligible || !e.touches || e.touches.length !== 1) return;
    lastY = e.touches[0].clientY;
    const dy = Math.max(0, lastY - startY);
    if (dy > 0) {
      drawer.style.transition = 'none';
      drawer.style.transform = `translateY(${Math.min(dy, 180)}px)`;
    }
  }, { passive: true });

  function finish() {
    if (!tracking) return;
    const dy = Math.max(0, lastY - startY);
    tracking = false;
    eligible = false;
    drawer.style.transition = '';
    drawer.style.transform = '';
    if (dy >= 70 && typeof closeDrawer === 'function') closeDrawer();
    startY = lastY = 0;
  }

  drawer.addEventListener('touchend', finish, { passive: true });
  drawer.addEventListener('touchcancel', finish, { passive: true });
})();
