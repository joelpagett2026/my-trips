// ══════════════════════════════════════════════════════════════════════
//  MY TRIPS — Custom Date Picker
//  Replaces native date inputs with a themed calendar
// ══════════════════════════════════════════════════════════════════════

(function() {

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];

// Inject styles once
const style = document.createElement('style');
style.textContent = `
.dp-wrap{position:relative;display:inline-block;width:100%;}
.dp-input{
  background:transparent;border:none;outline:none;
  font-family:'Montserrat',sans-serif;font-size:inherit;
  font-weight:inherit;color:#444;width:100%;cursor:pointer;
  padding:0;
}
.dp-input::placeholder{color:#b8b8b8;}

.dp-popup{
  position:fixed;z-index:99999;
  background:#fff;border-radius:16px;
  box-shadow:0 8px 32px rgba(0,0,0,0.18),0 0 0 0.5px rgba(0,0,0,0.08);
  padding:16px;width:280px;
  font-family:'Montserrat',sans-serif;
  animation:dpFadeIn 0.15s ease;
}
@keyframes dpFadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}

.dp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.dp-month-label{font-size:14px;font-weight:700;color:#444;letter-spacing:-0.2px;}
.dp-nav{display:flex;gap:4px;}
.dp-nav-btn{
  background:#e8e8e8;border:none;border-radius:8px;
  width:30px;height:30px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  color:#444;transition:background 0.1s;
}
.dp-nav-btn:hover{background:#0e7a87;color:#fff;}

.dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.dp-day-hd{
  font-size:10px;font-weight:700;color:#b8b8b8;
  text-align:center;padding:4px 0 6px;text-transform:uppercase;letter-spacing:0.04em;
}
.dp-day{
  aspect-ratio:1;display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:500;color:#444;
  border-radius:8px;cursor:pointer;transition:background 0.1s,color 0.1s;
  border:none;background:none;font-family:'Montserrat',sans-serif;
}
.dp-day:hover:not(.dp-day-empty):not(.dp-day-selected){background:#e8e8e8;}
.dp-day-empty{cursor:default;}
.dp-day-today{color:#0e7a87;font-weight:700;}
.dp-day-selected{background:#0e7a87!important;color:#fff!important;font-weight:700;}
.dp-day-other-month{color:#c8c8c8;}

.dp-footer{display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:0.5px solid #e8e8e8;}
.dp-btn-clear{font-size:12px;font-weight:600;color:#b8b8b8;background:none;border:none;cursor:pointer;font-family:'Montserrat',sans-serif;}
.dp-btn-clear:hover{color:#ff3b30;}
.dp-btn-today{font-size:12px;font-weight:600;color:#0e7a87;background:none;border:none;cursor:pointer;font-family:'Montserrat',sans-serif;}
.dp-btn-today:hover{text-decoration:underline;}
`;
document.head.appendChild(style);

let activePopup = null;
let activeInput = null;

function parseValue(val) {
  if (!val) return null;
  // Accepts yyyy-mm-dd or dd/mm/yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y,m,d] = val.split('-').map(Number);
    return new Date(y, m-1, d);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
    const [d,m,y] = val.split('/').map(Number);
    return new Date(y, m-1, d);
  }
  return null;
}

function formatDisplay(date) {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2,'0');
  const m = String(date.getMonth()+1).padStart(2,'0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatISO(date) {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2,'0');
  const m = String(date.getMonth()+1).padStart(2,'0');
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
}

function closePopup() {
  if (activePopup) { activePopup.remove(); activePopup = null; }
  activeInput = null;
}

document.addEventListener('mousedown', e => {
  if (activePopup && !activePopup.contains(e.target) && e.target !== activeInput) {
    closePopup();
  }
});

function openPicker(inputEl, currentDate, onSelect) {
  closePopup();
  activeInput = inputEl;

  let viewDate = currentDate ? new Date(currentDate) : new Date();
  viewDate.setDate(1);

  const today = new Date(); today.setHours(0,0,0,0);

  function build() {
    const popup = document.createElement('div');
    popup.className = 'dp-popup';

    // Position relative to input
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    popup.style.left = rect.left + 'px';
    if (spaceBelow > 280) {
      popup.style.top = (rect.bottom + 6) + 'px';
    } else {
      popup.style.top = (rect.top - 6) + 'px';
      popup.style.transform = 'translateY(-100%)';
    }

    // Header
    const hdr = document.createElement('div'); hdr.className = 'dp-header';
    const lbl = document.createElement('div'); lbl.className = 'dp-month-label';
    lbl.textContent = MONTHS[viewDate.getMonth()] + ' ' + viewDate.getFullYear();

    const nav = document.createElement('div'); nav.className = 'dp-nav';
    const prev = document.createElement('button'); prev.className = 'dp-nav-btn';
    prev.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>';
    prev.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); viewDate.setMonth(viewDate.getMonth()-1); rebuild(); });

    const next = document.createElement('button'); next.className = 'dp-nav-btn';
    next.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
    next.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); viewDate.setMonth(viewDate.getMonth()+1); rebuild(); });

    nav.appendChild(prev); nav.appendChild(next);
    hdr.appendChild(lbl); hdr.appendChild(nav);
    popup.appendChild(hdr);

    // Day headers
    const grid = document.createElement('div'); grid.className = 'dp-grid';
    DAYS.forEach(d => {
      const hd = document.createElement('div'); hd.className = 'dp-day-hd'; hd.textContent = d;
      grid.appendChild(hd);
    });

    // Days
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const blanks = firstDay === 0 ? 6 : firstDay - 1; // Mon-start
    const daysInMonth = new Date(year, month+1, 0).getDate();

    for (let i = 0; i < blanks; i++) {
      const em = document.createElement('div'); em.className = 'dp-day dp-day-empty';
      grid.appendChild(em);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const btn = document.createElement('button'); btn.className = 'dp-day';
      btn.textContent = d;
      const thisDate = new Date(year, month, d);
      thisDate.setHours(0,0,0,0);
      if (thisDate.getTime() === today.getTime()) btn.classList.add('dp-day-today');
      if (currentDate && thisDate.getTime() === new Date(currentDate).setHours(0,0,0,0)) {
        btn.classList.add('dp-day-selected');
      }
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        onSelect(thisDate);
        closePopup();
      });
      grid.appendChild(btn);
    }
    popup.appendChild(grid);

    // Footer
    const footer = document.createElement('div'); footer.className = 'dp-footer';
    const clearBtn = document.createElement('button'); clearBtn.className = 'dp-btn-clear'; clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('mousedown', e => { e.preventDefault(); onSelect(null); closePopup(); });
    const todayBtn = document.createElement('button'); todayBtn.className = 'dp-btn-today'; todayBtn.textContent = 'Today';
    todayBtn.addEventListener('mousedown', e => { e.preventDefault(); onSelect(today); closePopup(); });
    footer.appendChild(clearBtn); footer.appendChild(todayBtn);
    popup.appendChild(footer);

    return popup;
  }

  function rebuild() {
    if (activePopup) activePopup.remove();
    activePopup = build();
    document.body.appendChild(activePopup);
  }

  rebuild();
}

// ── ATTACH TO ALL DATE INPUTS ────────────────────────────────────────
function attachPicker(input) {
  if (input.dataset.dpAttached) return;
  input.dataset.dpAttached = '1';

  // Replace with a text display input + hidden storage
  const wrap = document.createElement('div'); wrap.className = 'dp-wrap';
  const display = document.createElement('input'); display.className = 'dp-input';
  display.type = 'text'; display.readOnly = true;
  display.placeholder = input.placeholder || 'Select date';

  // Copy classes and styles
  display.className = 'dp-input ' + (input.className || '');
  display.style.cssText = input.style.cssText;

  // Parse existing value
  let currentDate = parseValue(input.value);
  display.value = currentDate ? formatDisplay(currentDate) : '';

  display.addEventListener('focus', () => {
    openPicker(display, currentDate, date => {
      currentDate = date;
      display.value = date ? formatDisplay(date) : '';
      // Update the original hidden input value
      input.value = date ? (input.dataset.format === 'dmy' ? formatDisplay(date) : formatISO(date)) : '';
      // Trigger change event so scheduleSave fires
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new Event('change', {bubbles:true}));
    });
  });

  display.addEventListener('click', () => display.focus());

  // Hide original, insert wrapper
  input.style.display = 'none';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(display);
  wrap.appendChild(input);
}

// Format hint: itinerary pages store dd/mm/yyyy, modal uses ISO
function initPickers() {
  document.querySelectorAll('input[type="date"]').forEach(input => {
    // Detect context: modal inputs use ISO, itinerary inputs use dmy
    if (input.closest('.modal-overlay') || input.id === 'm-dep' || input.id === 'm-ret') {
      input.dataset.format = 'iso';
    } else {
      input.dataset.format = 'dmy';
    }
    attachPicker(input);
  });
}

// Run on DOM ready and observe for dynamically added inputs
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPickers);
} else {
  initPickers();
}

// Expose for external use (e.g. modal re-init)
window.dpAttach = function(input) {
  if (!input.dataset.format) input.dataset.format = 'iso';
  attachPicker(input);
};

// For plain text inputs that just need the picker popup (no wrapping needed)
window.dpAttachText = function(input) {
  if (input.dataset.dpText) return;
  input.dataset.dpText = '1';
  input.readOnly = true;
  input.style.cursor = 'pointer';

  let currentDate = parseValue(input.value);

  function onSelect(date) {
    currentDate = date;
    input.value = date ? formatDisplay(date) : '';
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }

  input.addEventListener('focus', () => openPicker(input, currentDate, onSelect));
  input.addEventListener('click', () => {
    if (document.activeElement === input) openPicker(input, currentDate, onSelect);
  });
};

// Re-run when new day cards are added dynamically
const observer = new MutationObserver(() => {
  document.querySelectorAll('input[type="date"]:not([data-dp-attached])').forEach(input => {
    input.dataset.format = 'dmy';
    attachPicker(input);
  });
});
observer.observe(document.body, {childList:true, subtree:true});

})();
