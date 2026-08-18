<?php
// MY TRIPS — Shared DB config + connection
// Included by both api.php and trip.php so the two never drift apart.
@include_once __DIR__ . '/secrets.php';

define('DB_HOST', 'sdb-77.hosting.stackcp.net');
define('DB_NAME', 'claudedb-35303735bca3');
define('DB_USER', 'claudedb-35303735bca3');
define('DB_PASS', 'v^l]&AyQxr4G');
define('PUBLIC_HTML', '/home/sites/31a/d/dbd40dd264/public_html');

function db(): PDO {
      static $pdo;
      if (!$pdo) {
                $pdo = new PDO(
                              'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                              DB_USER, DB_PASS,
                              [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                               PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
                          );
      }
      return $pdo;
}
