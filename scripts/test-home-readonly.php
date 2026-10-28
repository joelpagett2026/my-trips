<?php
// Execute all real homepage entrypoints with a database-access tripwire. A
// routine dashboard visit must never mutate saved attraction bookings.
$root = dirname(__DIR__);
$fixture = sys_get_temp_dir() . '/mytrips-home-readonly-' . bin2hex(random_bytes(6));
if (!mkdir($fixture, 0700)) throw new RuntimeException('Could not create fixture');
$files = ['home-core.php', 'home.php', 'home-optimized.php', 'index.html'];
$marker = $fixture . '/database-access';
$stub = '<?php function db() { file_put_contents(__DIR__ . "/database-access", "called"); throw new RuntimeException("Homepage accessed the database"); }';
try {
    foreach ($files as $file) {
        if (!copy($root . '/' . $file, $fixture . '/' . $file)) throw new RuntimeException('Could not copy ' . $file);
    }
    file_put_contents($fixture . '/db-config.php', $stub);
    foreach (['home-core.php', 'home.php', 'home-optimized.php'] as $entrypoint) {
        $output = [];
        $status = 0;
        exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($fixture . '/' . $entrypoint) . ' 2>&1', $output, $status);
        if ($status !== 0 || !str_contains(implode("\n", $output), '</html>')) {
            throw new RuntimeException($entrypoint . ' did not render successfully');
        }
        if (is_file($marker)) throw new RuntimeException($entrypoint . ' accessed itinerary storage while rendering');
    }
    echo "homepage renderers are read-only: ok\n";
} finally {
    foreach (array_merge($files, ['db-config.php', 'database-access']) as $file) {
        if (is_file($fixture . '/' . $file)) unlink($fixture . '/' . $file);
    }
    rmdir($fixture);
}
