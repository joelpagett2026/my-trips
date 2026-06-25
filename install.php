<?php
define('DB_HOST', 'sdb-77.hosting.stackcp.net');
define('DB_NAME', 'claudedb-35303735bca3');
define('DB_USER', 'claudedb-35303735bca3');
define('DB_PASS', 'v^l]&AyQxr4G');

echo '<style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;}
code{background:#f2f2f7;padding:2px 6px;border-radius:4px;font-size:13px;}
pre{background:#f2f2f7;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;}
.ok{color:green;} .err{color:red;} h3{margin-top:24px;}</style>';

echo '<h2>My Trips — Installer Diagnostics</h2>';

// 1. Check if we can resolve the hostname
echo '<h3>1. DNS lookup</h3>';
$ip = gethostbyname(DB_HOST);
if ($ip === DB_HOST) {
    echo '<p class="err">❌ Could not resolve hostname <code>' . DB_HOST . '</code></p>';
} else {
    echo '<p class="ok">✓ Resolved to <code>' . $ip . '</code></p>';
}

// 2. Check if port 3306 is reachable
echo '<h3>2. Port 3306 reachability</h3>';
$sock = @fsockopen(DB_HOST, 3306, $errno, $errstr, 5);
if ($sock) {
    fclose($sock);
    echo '<p class="ok">✓ Port 3306 is open and reachable</p>';
} else {
    echo '<p class="err">❌ Port 3306 unreachable: ' . htmlspecialchars($errstr) . ' (error ' . $errno . ')</p>';
    echo '<p>This usually means the MySQL server only allows connections from <code>localhost</code> via a Unix socket, not TCP/IP.</p>';
}

// 3. Try connecting via PDO with multiple socket paths
echo '<h3>3. PDO connection attempts</h3>';

$attempts = [
    ['host' => DB_HOST,    'label' => 'TCP: ' . DB_HOST],
    ['host' => '127.0.0.1','label' => 'TCP: 127.0.0.1'],
    ['dsn'  => 'mysql:unix_socket=/var/run/mysqld/mysqld.sock;dbname=' . DB_NAME . ';charset=utf8mb4', 'label' => 'Socket: /var/run/mysqld/mysqld.sock'],
    ['dsn'  => 'mysql:unix_socket=/tmp/mysql.sock;dbname=' . DB_NAME . ';charset=utf8mb4',             'label' => 'Socket: /tmp/mysql.sock'],
    ['dsn'  => 'mysql:unix_socket=/var/lib/mysql/mysql.sock;dbname=' . DB_NAME . ';charset=utf8mb4',   'label' => 'Socket: /var/lib/mysql/mysql.sock'],
];

$connected = false;
$workingDsn = '';

foreach ($attempts as $attempt) {
    try {
        $dsn = $attempt['dsn'] ?? "mysql:host={$attempt['host']};dbname=" . DB_NAME . ";charset=utf8mb4";
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 4
        ]);
        echo '<p class="ok">✓ Connected via: <strong>' . $attempt['label'] . '</strong></p>';
        $connected = true;
        $workingDsn = $dsn;
        break;
    } catch (PDOException $e) {
        echo '<p class="err">❌ ' . $attempt['label'] . ' — ' . htmlspecialchars($e->getMessage()) . '</p>';
    }
}

if (!$connected) {
    echo '<h3 class="err">Could not connect.</h3>';
    echo '<p>Please contact 20i support and ask: <em>"What is the MySQL hostname or socket path for connecting from PHP on my shared hosting account?"</em></p>';
    exit;
}

// 4. Create tables
echo '<h3>4. Creating tables</h3>';
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `itinerary` (
        `id`         VARCHAR(255) NOT NULL,
        `data`       LONGTEXT     NOT NULL,
        `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `settings` (
        `key`   VARCHAR(100) NOT NULL,
        `value` TEXT         NOT NULL,
        PRIMARY KEY (`key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

    echo '<p class="ok">✓ Tables created successfully!</p>';
    echo '<h3>Working DSN for api.php:</h3>';
    echo '<pre>' . htmlspecialchars($workingDsn) . '</pre>';
    echo '<p><strong class="err">⚠️ Delete install.php from your server now.</strong></p>';
} catch (PDOException $e) {
    echo '<p class="err">❌ ' . htmlspecialchars($e->getMessage()) . '</p>';
}
