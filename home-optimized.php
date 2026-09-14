<?php
ob_start();
include __DIR__ . '/home.php';
$page = ob_get_clean();

$asset = __DIR__ . '/home-optimized.js';
$version = @filemtime($asset) ?: time();
$tag = '<script src="/home-optimized.js?v=' . rawurlencode((string)$version) . '" defer></script>';

if (stripos($page, '</body>') === false) {
    echo $page;
    exit;
}

echo str_ireplace('</body>', $tag . "\n</body>", $page);
