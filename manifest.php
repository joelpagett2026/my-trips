<?php
// Per-itinerary PWA manifest so an itinerary added to the iPhone Home Screen
// launches back into that exact trip in standalone mode.
header('Content-Type: application/manifest+json; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

$slug = preg_replace('/[^a-z0-9\-]/', '', strtolower($_GET['slug'] ?? ''));
$start = $slug ? '/' . $slug : '/trips/';

$manifest = [
  'name' => "Joel Pagett's Trip Planner",
  'short_name' => 'Trip Planner',
  'id' => $start,
  'start_url' => $start,
  'scope' => '/',
  'display' => 'standalone',
  'display_override' => ['standalone'],
  'background_color' => '#0d1117',
  'theme_color' => '#0e7a87',
  'icons' => [
    [
      'src' => '/icons/icon-192.png',
      'sizes' => '192x192',
      'type' => 'image/png'
    ],
    [
      'src' => '/icons/icon-512.png',
      'sizes' => '512x512',
      'type' => 'image/png'
    ]
  ]
];

echo json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
