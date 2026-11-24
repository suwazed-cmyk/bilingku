<?php
/** Data ringan untuk dashboard (dipanggil lewat fetch). */
session_write_close();
header('Content-Type: application/json');
header('Cache-Control: no-store');
$out = ['ok' => false];
$a = get('a');
if ($a === 'ping') {
    $out = ['ok' => true, 'left' => max(0, IDLE_MAX - (time() - (int)($_SESSION['seen'] ?? time())))];   // sisa waktu sebelum logout otomatis
} elseif ($a === 'traffic' && ros()) {
    $r = rq('/interface/monitor-traffic', ['interface' => get('iface'), 'once' => '']);
    if ($r) $out = ['ok' => true, 'rx' => (float)($r[0]['rx-bits-per-second'] ?? 0), 'tx' => (float)($r[0]['tx-bits-per-second'] ?? 0)];
    if ($r && get('bytes') !== '') { $b = rq('/interface/print', ['?name' => get('iface'), '.proplist' => 'rx-byte,tx-byte']); if ($b) { $out['rxb'] = (float)($b[0]['rx-byte'] ?? 0); $out['txb'] = (float)($b[0]['tx-byte'] ?? 0); } }
} elseif ($a === 'log' && ros()) {
    $rows = [];
    foreach (rq('/log/print', ['.proplist' => 'time,topics,message']) as $l) {
        if (preg_match('/hotspot|ppp/i', $l['topics'] ?? '')) $rows[] = ['t' => $l['time'] ?? '', 'm' => $l['message'] ?? ''];
    }
    $out = ['ok' => true, 'rows' => array_reverse(array_slice($rows, -12))];
}
if (!$out['ok']) $out['error'] = $GLOBALS['ROS_ERR'] ?? 'gagal';
echo json_encode($out, JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
