<?php
/** Kerangka halaman masuk & pemasangan awal. */
function auth_page($title, $body)
{
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="id" translate="no" class="notranslate"><head><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta name="google" content="notranslate"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . h($title) . ' — ' . h(app_name()) . '</title><link rel="stylesheet" href="' . asset_url('style.css') . '"><link rel="stylesheet" href="' . asset_url('theme.css') . '"></head>'
        . '<body class="auth"><div class="authbox"><div class="brand">' . h(app_name()) . '</div><h1>' . h($title) . '</h1>';
    echo flashes();
    echo $body . '</div><script src="' . asset_url('app3.js') . '"></script></body></html>';
}
