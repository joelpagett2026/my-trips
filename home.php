<?php
$core = __DIR__ . '/home-core.php';
if (!is_file($core)) {
    $core = dirname(__DIR__) . '/my-trips/home-core.php';
}
if (!is_file($core)) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The homepage renderer could not be loaded.</p>';
    exit;
}

ob_start();
include $core;
$page = ob_get_clean();

$theme = <<<'CSS'
/* Full colour-backed treatment for the five main homepage sections. */
.main-grid > a.dash-card[href="/trips/"],
.main-grid > a.dash-card[href="/holidays/"],
.main-grid > a.dash-card[href="/concerts/"],
.main-grid > a.dash-card[href="/shows/"],
.main-grid > a.dash-card[href="/parks/"]{
  color:#fff!important;
  border-color:rgba(255,255,255,.16)!important;
  box-shadow:0 12px 32px rgba(39,54,58,.11),0 2px 5px rgba(39,54,58,.08)!important;
}
.main-grid > a.dash-card[href="/trips/"]{background:linear-gradient(145deg,#0d8794 0%,#087582 58%,#096b76 100%)!important}
.main-grid > a.dash-card[href="/holidays/"]{background:linear-gradient(145deg,#8271ad 0%,#73639d 58%,#68598f 100%)!important}
.main-grid > a.dash-card[href="/concerts/"]{background:linear-gradient(145deg,#d58a42 0%,#c9792b 58%,#b96c22 100%)!important}
.main-grid > a.dash-card[href="/shows/"]{background:linear-gradient(145deg,#6289b6 0%,#4f78a8 58%,#456b98 100%)!important}
.main-grid > a.dash-card[href="/parks/"]{background:linear-gradient(145deg,#7f9979 0%,#6c8966 58%,#5e7b59 100%)!important}

.main-grid > a.dash-card[href="/trips/"] .card-title,
.main-grid > a.dash-card[href="/holidays/"] .card-title,
.main-grid > a.dash-card[href="/concerts/"] .card-title,
.main-grid > a.dash-card[href="/shows/"] .card-title,
.main-grid > a.dash-card[href="/parks/"] .card-title,
.main-grid > a.dash-card[href="/holidays/"] .person-name,
.main-grid > a.dash-card[href="/concerts/"] .event-title,
.main-grid > a.dash-card[href="/shows/"] .event-title,
.main-grid > a.dash-card[href="/parks/"] .event-title{color:#fff!important}

.main-grid > a.dash-card[href="/trips/"] .card-sub,
.main-grid > a.dash-card[href="/holidays/"] .card-sub,
.main-grid > a.dash-card[href="/concerts/"] .card-sub,
.main-grid > a.dash-card[href="/shows/"] .card-sub,
.main-grid > a.dash-card[href="/parks/"] .card-sub,
.main-grid > a.dash-card[href="/holidays/"] .person-period,
.main-grid > a.dash-card[href="/holidays/"] .allow-stat span,
.main-grid > a.dash-card[href="/holidays/"] .progress-copy,
.main-grid > a.dash-card[href="/concerts/"] .event-line,
.main-grid > a.dash-card[href="/shows/"] .event-line,
.main-grid > a.dash-card[href="/parks/"] .event-line,
.main-grid > a.dash-card[href="/concerts/"] .stat-lbl,
.main-grid > a.dash-card[href="/shows/"] .stat-lbl,
.main-grid > a.dash-card[href="/parks/"] .stat-lbl{color:rgba(255,255,255,.74)!important}

.main-grid > a.dash-card[href="/trips/"] .card-head-icon,
.main-grid > a.dash-card[href="/holidays/"] .card-head-icon,
.main-grid > a.dash-card[href="/concerts/"] .card-head-icon,
.main-grid > a.dash-card[href="/shows/"] .card-head-icon,
.main-grid > a.dash-card[href="/parks/"] .card-head-icon,
.main-grid > a.dash-card[href="/holidays/"] .initials{
  color:#fff!important;
  background:rgba(255,255,255,.16)!important;
}
.main-grid > a.dash-card[href="/holidays/"] .initials.gray{color:#fff!important;background:rgba(255,255,255,.12)!important}
.main-grid > a.dash-card[href="/trips/"] .card-arrow,
.main-grid > a.dash-card[href="/holidays/"] .card-arrow,
.main-grid > a.dash-card[href="/concerts/"] .card-arrow,
.main-grid > a.dash-card[href="/shows/"] .card-arrow,
.main-grid > a.dash-card[href="/parks/"] .card-arrow{color:rgba(255,255,255,.9)!important}

body .main-grid > a.dash-card[href="/trips/"] .travel-stats-row{
  background:rgba(255,255,255,.95)!important;
  border-color:rgba(255,255,255,.42)!important;
  box-shadow:0 8px 24px rgba(4,67,75,.11)!important;
}

body .main-grid > a.dash-card[href="/holidays/"] .person + .person,
body .main-grid > a.dash-card[href="/holidays/"] .allow-stat{border-color:rgba(255,255,255,.18)!important}
.main-grid > a.dash-card[href="/holidays/"] .allow-stat.used strong,
.main-grid > a.dash-card[href="/holidays/"] .allow-stat.remain strong{color:#fff!important}
.main-grid > a.dash-card[href="/holidays/"] .progress{background:rgba(255,255,255,.18)!important}
.main-grid > a.dash-card[href="/holidays/"] .progress > span{background:linear-gradient(90deg,rgba(255,255,255,.98),rgba(255,255,255,.70))!important}

.main-grid > a.dash-card[href="/concerts/"] .pill,
.main-grid > a.dash-card[href="/shows/"] .pill,
.main-grid > a.dash-card[href="/parks/"] .pill{color:#fff!important;background:rgba(255,255,255,.16)!important}
.main-grid > a.dash-card[href="/concerts/"] .event-countdown,
.main-grid > a.dash-card[href="/shows/"] .event-countdown,
.main-grid > a.dash-card[href="/parks/"] .event-countdown,
.main-grid > a.dash-card[href="/concerts/"] .stat-val,
.main-grid > a.dash-card[href="/shows/"] .stat-val,
.main-grid > a.dash-card[href="/parks/"] .stat-val{color:#fff!important}
body .main-grid > a.dash-card[href="/concerts/"] .event-stats,
body .main-grid > a.dash-card[href="/shows/"] .wide-stats,
body .main-grid > a.dash-card[href="/parks/"] .wide-stats,
body .main-grid > a.dash-card[href="/concerts/"] .stat,
body .main-grid > a.dash-card[href="/shows/"] .stat,
body .main-grid > a.dash-card[href="/parks/"] .stat{border-color:rgba(255,255,255,.18)!important}

.main-grid > a.dash-card[href="/holidays/"] .skeleton,
.main-grid > a.dash-card[href="/concerts/"] .skeleton,
.main-grid > a.dash-card[href="/shows/"] .skeleton,
.main-grid > a.dash-card[href="/parks/"] .skeleton{
  background:linear-gradient(90deg,rgba(255,255,255,.12) 25%,rgba(255,255,255,.22) 37%,rgba(255,255,255,.12) 63%)!important;
  background-size:400% 100%!important;
}

@media (max-width:800px){
  .main-grid > a.dash-card[href="/trips/"],
  .main-grid > a.dash-card[href="/holidays/"],
  .main-grid > a.dash-card[href="/concerts/"],
  .main-grid > a.dash-card[href="/shows/"],
  .main-grid > a.dash-card[href="/parks/"]{box-shadow:0 8px 24px rgba(39,54,58,.10)!important}
}
CSS;

if (stripos($page, '</head>') === false) {
    echo $page;
    exit;
}

echo str_ireplace('</head>', "<style id=\"homepage-section-colours\">\n{$theme}\n</style>\n</head>", $page);
