<?php
// TEMPORARY RECOVERY TOOL — remove after successful PIN reset.
// Protected by the server-only DEPLOY_KEY. No PIN or deploy secret is stored here.
require_once __DIR__ . '/db-config.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive', true);

function cfg(string $name): string {
    if (defined($name)) return trim((string)constant($name));
    $env = getenv($name);
    return $env !== false ? trim((string)$env) : '';
}

$error = '';
$success = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $deployKey = trim((string)($_POST['deploy_key'] ?? ''));
    $newPin = trim((string)($_POST['new_pin'] ?? ''));
    $confirmPin = trim((string)($_POST['confirm_pin'] ?? ''));
    $expected = cfg('DEPLOY_KEY');

    if ($expected === '' || $deployKey === '' || !hash_equals($expected, $deployKey)) {
        $error = 'Recovery key was not accepted.';
    } elseif (!preg_match('/^\d{4}$/', $newPin)) {
        $error = 'PIN must be exactly 4 digits.';
    } elseif ($newPin !== $confirmPin) {
        $error = 'PIN confirmation does not match.';
    } else {
        try {
            $pdo = db();
            $pdo->beginTransaction();
            $hash = hash('sha256', $newPin);
            $pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('pin_hash', ?) ON DUPLICATE KEY UPDATE `value` = ?")
                ->execute([$hash, $hash]);
            $pdo->prepare("DELETE FROM settings WHERE `key` IN ('pin_bootstrap_consumed','pin_bootstrap_consumed_hash')")->execute();
            $pdo->exec('DELETE FROM auth_attempts');
            $pdo->exec('DELETE FROM auth_sessions');
            $pdo->commit();
            $success = true;
        } catch (Throwable $e) {
            if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
            $error = 'PIN reset failed. No changes were applied.';
        }
    }
}
?><!doctype html>
<html lang="en-GB">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PIN Recovery</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#eef1f2;margin:0;min-height:100vh;display:grid;place-items:center;color:#333}.card{width:min(420px,calc(100% - 32px));background:#fff;border-radius:18px;padding:28px;box-shadow:0 10px 35px rgba(0,0,0,.12)}h1{margin:0 0 8px;font-size:24px}p{color:#666;line-height:1.45}.field{margin:16px 0}label{display:block;font-size:12px;font-weight:700;margin-bottom:6px}input{box-sizing:border-box;width:100%;padding:12px 13px;border:1px solid #ccd2d5;border-radius:10px;font-size:16px}button{width:100%;padding:13px;border:0;border-radius:10px;background:#0e7a87;color:white;font-size:15px;font-weight:700;cursor:pointer}.err{background:#fff0f0;color:#9c1c1c;padding:10px 12px;border-radius:10px}.ok{background:#edf9f3;color:#14633c;padding:12px;border-radius:10px}</style></head>
<body><main class="card"><h1>Reset website PIN</h1>
<?php if ($success): ?>
<div class="ok"><strong>PIN reset complete.</strong><br>You can now return to the website and sign in with your new PIN.</div>
<?php else: ?>
<p>Enter the same deploy key stored in <code>secrets.php</code>, then choose the 4-digit PIN you want to use.</p>
<?php if ($error): ?><div class="err"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
<form method="post" autocomplete="off">
<div class="field"><label for="deploy_key">DEPLOY_KEY</label><input id="deploy_key" name="deploy_key" type="password" required autocomplete="off"></div>
<div class="field"><label for="new_pin">New 4-digit PIN</label><input id="new_pin" name="new_pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"></div>
<div class="field"><label for="confirm_pin">Confirm PIN</label><input id="confirm_pin" name="confirm_pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"></div>
<button type="submit">Reset PIN</button></form>
<?php endif; ?></main></body></html>
