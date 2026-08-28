// Settings-only backup UI. The server returns one consistent DB snapshot, so the
// browser no longer assembles a backup from many independently timed requests.
(() => {
  if (!/\/settings(?:\.html)?\/?$/.test(location.pathname)) return;

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
      const token = typeof getToken === 'function' ? getToken() : '';
      const res = await fetch('/backup-export.php', {
        headers: { 'X-Auth-Token': token },
        cache: 'no-store',
      });
      let json;
      try { json = await res.json(); } catch { throw new Error('Invalid backup response'); }
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
      setTimeout(() => URL.revokeObjectURL(url), 0);

      localStorage.setItem('mytrips_last_backup', Date.now().toString());
      if (typeof updateBackupLabels === 'function') updateBackupLabels();
      statusEl.className = 'status-badge ok';
      statusEl.textContent = `Backup downloaded successfully · ${backup.record_count} records`;
      statusEl.style.display = 'flex';
      btn.textContent = '✓ Downloaded';
      setTimeout(() => { btn.textContent = 'Download backup.json'; btn.disabled = false; }, 3000);
    } catch (e) {
      statusEl.className = 'status-badge not';
      statusEl.textContent = 'Export failed — no partial backup was downloaded';
      statusEl.style.display = 'flex';
      btn.textContent = 'Try again';
      btn.disabled = false;
    }
  };
})();
