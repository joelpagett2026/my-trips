<?php
require_once __DIR__ . '/db-config.php';
require_once __DIR__ . '/auth-session.php';
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive', true);
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pin = trim((string)($_POST['pin'] ?? ''));
        if (!preg_match('/^\d{4}$/', $pin)) {
            $error = 'PIN must be exactly 4 digits.';
        } elseif (!hash_equals(activePinHash(), hash('sha256', $pin))) {
            $error = 'Incorrect PIN';
        } else {
            clearFailedLogins();
            $token = issueAuthSession();
            $payload = json_encode(['sessionToken' => $token, 'ts' => (int)round(microtime(true) * 1000)], JSON_UNESCAPED_SLASHES);
            echo '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Signing in…</title></head><body><script>localStorage.setItem("jh_auth", ' . json_encode($payload) . '); location.replace("/");</script></body></html>';
            exit;
        }
    } catch (Throwable $e) {
        $error = 'Authentication service is temporarily unavailable';
    }
}
?><!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sign in</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#e8e8e8;margin:0;min-height:100vh;display:grid;place-items:center;color:#444}.card{width:min(360px,calc(100% - 32px));background:#fff;border-radius:18px;padding:28px;box-shadow:0 10px 35px rgba(0,0,0,.12)}h1{margin:0 0 8px;font-size:24px}p{color:#666}.field{margin:18px 0}input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #ccd2d5;border-radius:10px;font-size:22px;text-align:center;letter-spacing:.35em}button{width:100%;padding:13px;border:0;border-radius:10px;background:#0e7a87;color:#fff;font-size:15px;font-weight:700}.err{background:#fff0f0;color:#9c1c1c;padding:10px 12px;border-radius:10px;margin:12px 0}</style></head><body><main class="card"><h1>Sign in</h1><p>Temporary direct sign-in while the PIN keypad is being repaired.</p><?php if ($error): ?><div class="err"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?><form method="post" autocomplete="off"><div class="field"><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autofocus autocomplete="off"></div><button type="submit">Sign in</button></form></main></body></html>
