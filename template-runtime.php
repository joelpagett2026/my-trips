<?php
// Shared sanitising/injection for HTML templates that are stored in Git but
// rendered through PHP. No private credential is ever copied into browser HTML.
@include_once __DIR__ . '/secrets.php';

function runtimeConfigValue(string $name): string {
    if (defined($name)) return trim((string)constant($name));
    $env = getenv($name);
    return $env !== false ? trim((string)$env) : '';
}

function browserMapsKey(): string {
    // This key is intentionally a browser key: it will be visible to visitors.
    // Restrict it in Google Cloud by HTTP referrer and to Maps JavaScript API.
    return runtimeConfigValue('MAPS_BROWSER_KEY');
}

/**
 * Remove legacy credentials from the shared itinerary source and inject only
 * the explicitly public browser Maps key. Returns [html, diagnostics].
 */
function applyItineraryRuntimeSafety(string $html): array {
    $diagnostics = [];

    // The old PIN hash must never be emitted as a browser bearer credential.
    $html = preg_replace(
        "/const AUTH_TOKEN = '[a-f0-9]{64}';/",
        "const AUTH_TOKEN = ''; // legacy constant intentionally disabled",
        $html,
        1,
        $authConstCount
    );
    $diagnostics['auth_const_removed'] = $authConstCount;

    // Direct API fetches inside the monolithic template must request the current
    // random session at call time. Do not capture it during initial parsing.
    $html = str_replace(
        "'X-Auth-Token': AUTH_TOKEN",
        "'X-Auth-Token': (typeof getToken === 'function' ? getToken() : '')",
        $html,
        $authHeaderCount
    );
    $diagnostics['auth_headers_rewritten'] = $authHeaderCount;

    $mapsKey = browserMapsKey();
    $replacement = 'const MAPS_API_KEY = ' . json_encode($mapsKey, JSON_UNESCAPED_SLASHES) . ';';
    $html = preg_replace(
        "/const MAPS_API_KEY = 'AIza[0-9A-Za-z_-]+';/",
        $replacement,
        $html,
        1,
        $mapsCount
    );
    $diagnostics['maps_key_rewritten'] = $mapsCount;

    // New links use the PHP renderer. .htaccess also preserves old links that
    // still point at new-trip-v2.html?share=1&t=...
    $html = str_replace(
        "return location.origin + '/new-trip-v2.html?share=1&t=' + token;",
        "return location.origin + '/share.php?share=1&t=' + token;",
        $html,
        $shareUrlCount
    );
    $diagnostics['share_url_rewritten'] = $shareUrlCount;

    return [$html, $diagnostics];
}

function applyTripsDashboardRuntimeSafety(string $html): array {
    $key = browserMapsKey();
    $replacement = 'const GOOGLE_MAPS_API_KEY = ' . json_encode($key, JSON_UNESCAPED_SLASHES) . ';';
    $html = preg_replace(
        "/const GOOGLE_MAPS_API_KEY = 'AIza[0-9A-Za-z_-]+';/",
        $replacement,
        $html,
        1,
        $mapsCount
    );

    // Travel Day is an itinerary state label, not a city. Filter it where the
    // dashboard card is constructed instead of relying on a DOM MutationObserver.
    $html = str_replace(
        ".filter((c,i,a) => a.indexOf(c) === i) // dedupe",
        ".filter((c,i,a) => a.indexOf(c) === i && String(c).trim().toLowerCase() !== 'travel day') // dedupe + exclude non-location label",
        $html,
        $travelDayCount
    );

    return [$html, [
        'maps_key_rewritten' => $mapsCount,
        'travel_day_filter_rewritten' => $travelDayCount,
    ]];
}
