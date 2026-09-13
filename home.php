<?php
ob_start();
include __DIR__ . '/home-core.php';
$page = ob_get_clean();
echo str_replace('</head>', '<link rel="stylesheet" href="/homepage-section-colours.css?v=1"></head>', $page);
