// Settings-only reliability helpers. The server returns one consistent DB snapshot,
// and PIN changes use the v2 server-session API rather than the retired hash-token flow.
(() => {
  if (!/\/settings(?:\.html)?\/?$/.test(location.pathname)) return;

  window.getToken = function getToken() {
    try {
      const raw = localStorage.getItem('jh_auth') || sessionStorage.getItem('jh_auth') || 'null';
      return JSON.parse(raw)?.sessionToken || '';
    } catch { return ''; }
  };

  function pinErrorMessage(error, fallback) {
    const message = error && typeof error.message === 'string' ? error.message.trim() : '';
    return message || fallback;
  }

  // Normal Change PIN flow: verify the current PIN first, then collect and confirm
  // the replacement. All PIN comparison/hashing happens on the server.
  window.handlePinDigit = async function handlePinDigit(n) {
    if (pinEntered.length >= 4) return;
    pinEntered += String(n);
    updatePinUI();
    if (pinEntered.length < 4) return;

    await new Promise(r => setTimeout(r, 80));

    if (pinStep === 'verify') {
      try {
        const verified = await dbVerifyPin(pinEntered);
        if (!verified) throw new Error('Incorrect PIN');
        flashDots('#34c759', () => { pinStep = 'new'; updatePinUI(); });
      } catch (e) {
        const message = pinErrorMessage(e, 'Could not verify PIN');
        flashDots('#ff3b30', () => {
          document.getElementById('pin-panel-error').textContent = message;
        });
      }
      return;
    }

    if (pinStep === 'new') {
      newPinCandidate = pinEntered;
      flashDots('#007aff', () => { pinStep = 'confirm'; updatePinUI(); });
      return;
    }

    if (pinStep === 'confirm') {
      if (pinEntered !== newPinCandidate) {
        flashDots('#ff3b30', () => {
          document.getElementById('pin-panel-error').textContent = 'PINs do not match';
          pinStep = 'new';
          updatePinUI();
        });
        return;
      }

      try {
        await dbChangePin(newPinCandidate);
        flashDots('#34c759', () => {
          closePanel('pin');
          setTimeout(() => alert('PIN changed successfully!'), 300);
        });
      } catch (e) {
        const message = pinErrorMessage(e, 'Could not save the new PIN');
        flashDots('#ff3b30', () => {
          document.getElementById('pin-panel-error').textContent = message;
        });
      }
    }
  };

  document.querySelectorAll('#panel-pin .pin-btn-p[data-n]').forEach(btn => {
    const replacement = btn.cloneNode(true);
    btn.replaceWith(replacement);
    replacement.addEventListener('click', () => window.handlePinDigit(replacement.dataset.n));
  });
  const oldDelete = document.getElementById('pp-del');
  if (oldDelete) {
    const replacement = oldDelete.cloneNode(true);
    oldDelete.replaceWith(replacement);
    replacement.addEventListener('click', () => {
      pinEntered = pinEntered.slice(0, -1);
      updatePinUI();
    });
  }

  const infoBox = document.querySelector('#panel-backup .panel-body > div[style*="background:#e8e8e8"]');
  if (infoBox) {
    infoBox.innerHTML = '<strong style="color:#444;display:block;margin-bottom:4px;">What\'s included</strong>'
      + 'All itinerary records · Trip registry · Non-security settings<br>'
      + '<span style="opacity:0.6;">PINs, sessions and share/access tokens are deliberately excluded. Code &amp; templates are backed up via GitHub.</span>';
  }

  const panelSub = document.querySelector('#panel-backup .panel-sub');
  if (panelSub) panelSub.textContent = 'Exports one consistent database snapshot as a JSON file. Keep it somewhere safe.';

  window.doBackup = async function doBackup() {
    const btn = document.getElementById('backup-btn');
    const statusEl = document.getElementById('backup-status');
    btn.textContent = 'Creating snapshot…';
    btn.disabled = true;

    try {
      const token = window.getToken();
      const res = await fetch('/backup-export.php', {
        headers: { 'X-Auth-Token': token },
        cache: 'no-store',
      });
      let json;
      try { json = await res.json(); } catch { throw new Error('Backup service returned an invalid response'); }
      if (res.status === 401) document.dispatchEvent(new Event('mytrips:auth-expired'));
      if (!res.ok || !json?.ok || !json.data || typeof json.data !== 'object') {
        throw new Error(json?.error || 'Backup export failed');
      }

      const backup = json.data;
      if (!Number.isInteger(backup.record_count) || backup.record_count < 1 || !backup.records) {
        throw new Error('Backup did not contain the expected records');
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mytrips-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      localStorage.setItem('mytrips_last_backup', Date.now().toString());
      if (typeof updateBackupLabels === 'function') updateBackupLabels();
      statusEl.className = 'status-badge ok';
      statusEl.textContent = `Backup downloaded successfully · ${backup.record_count} records`;
      statusEl.style.display = 'flex';
      btn.textContent = '✓ Downloaded';
      setTimeout(() => { btn.textContent = 'Download backup.json'; btn.disabled = false; }, 3000);
    } catch (e) {
      const detail = e && typeof e.message === 'string' && e.message.trim()
        ? e.message.trim()
        : 'Backup export failed';
      statusEl.className = 'status-badge not';
      statusEl.textContent = `${detail} — no partial backup was downloaded`;
      statusEl.style.display = 'flex';
      btn.textContent = 'Try again';
      btn.disabled = false;
    }
  };
})();
