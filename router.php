<?php
/**
 * Router untuk server PHP bawaan (php -S) saat Bilingku dipasang sebagai add-on panel utama.
 * Meniru aturan .htaccess: folder data/, inc/, pages/, bin/ dan berkas data tidak bisa dibuka dari web.
 */
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('#^/(data|inc|pages|bin)(/|$)#', $path) || preg_match('#/\.#', $path)
    || preg_match('#\.(tmp|json|log|md|txt|zip|rsc|bak|sql|gz|tar|db|lock)$#i', $path)) {
    http_response_code(403);
    echo 'Forbidden';
    return true;
}
if ($path === '/' || $path === '') {
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    require __DIR__ . '/index.php';
    return true;
}
$file = realpath(__DIR__ . $path);
if ($file === false || strpos($file, __DIR__ . '/') !== 0) {
    http_response_code(404);
    echo 'Not found';
    return true;
}
if (preg_match('#\.php$#', $file)) {
    // hanya berkas PHP di folder utama yang boleh dijalankan langsung
    if (dirname($file) !== __DIR__ || basename($file) === 'router.php') {
        http_response_code(403);
        echo 'Forbidden';
        return true;
    }
    $_SERVER['SCRIPT_NAME'] = '/' . basename($file);
    require $file;
    return true;
}
return false; // berkas statis (gambar, svg, css, js)
