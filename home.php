<?php
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$core = __DIR__ . '/home-core.php';
if (!is_file($core)) {
    http_response_code(500);
    echo '<!doctype html><title>Homepage unavailable</title><p>The homepage renderer could not be loaded.</p>';
    exit;
}

ob_start();
include $core;
$page = ob_get_clean();

$theme = <<<'CSS'
/* Colour-backed treatment for the five main homepage sections. */
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

/* Keep the Holiday Planner photo clean: no decorative plane or image overlay. */
body .main-grid > a.dash-card[href="/trips/"] .trip-plane{
  display:none!important;
}
body .main-grid > a.dash-card[href="/trips/"] .trip-hero::after{
  display:none!important;
  content:none!important;
}

/* Holiday Planner stats: plain and integrated directly into the teal card. */
body .main-grid > a.dash-card[href="/trips/"] .travel-stats-row{
  position:relative;
  overflow:hidden;
  background:transparent!important;
  border:0!important;
  border-radius:0!important;
  box-shadow:none!important;
  padding:7px 4px 2px!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stats-row:before{
  display:none!important;
  content:none!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stats-head{
  position:relative;
  padding:0 2px 8px!important;
  border:0!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stats-eyebrow{
  color:rgba(255,255,255,.62)!important;
  letter-spacing:.12em!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stats-head strong{
  color:#fff!important;
  font-size:14px!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stat{
  position:relative;
  grid-template-columns:28px minmax(0,1fr) auto!important;
  gap:8px!important;
  padding:8px 2px!important;
  border:0!important;
  border-top:1px solid rgba(255,255,255,.14)!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stat-icon{
  width:28px!important;
  height:28px!important;
  border-radius:9px!important;
  color:#fff!important;
  background:rgba(255,255,255,.13)!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stat-icon svg{width:16px!important;height:16px!important}
body .main-grid > a.dash-card[href="/trips/"] .travel-stat-label{
  color:rgba(255,255,255,.82)!important;
  font-size:9.5px!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stat-value{
  color:#fff!important;
  font-size:17px!important;
}
body .main-grid > a.dash-card[href="/trips/"] .travel-stats-cta{
  position:relative;
  margin-top:2px!important;
  padding:9px 2px 1px!important;
  border-top:1px solid rgba(255,255,255,.14)!important;
  color:#fff!important;
}

/* Holiday Allowance on purple. */
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
  body .main-grid > a.dash-card[href="/trips/"] .travel-stats-row{padding:4px 4px 0!important}
  body .main-grid > a.dash-card[href="/trips/"] .travel-stats-head{padding:0 2px 10px!important}
  body .main-grid > a.dash-card[href="/trips/"] .travel-stat{
    grid-template-columns:32px minmax(0,1fr) auto!important;
    padding:10px 2px!important;
  }
  body .main-grid > a.dash-card[href="/trips/"] .travel-stat-icon{width:32px!important;height:32px!important}
  body .main-grid > a.dash-card[href="/trips/"] .travel-stat-value{font-size:19px!important}
}
CSS;

if (stripos($page, '</head>') === false) {
    echo $page;
    exit;
}

echo str_ireplace('</head>', "<style id=\"homepage-section-colours\">\n{$theme}\n</style>\n</head>", $page);
