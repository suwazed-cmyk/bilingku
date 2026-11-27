// Kerangka halaman masuk & pemasangan awal
"use strict";
module.exports = function auth_page(C, title, body) {
  const { h, echo, header, app_name, html_head, flashes, asset_url } = C;
  header("Content-Type: text/html; charset=utf-8");
  echo(html_head(title).replace("</head>", "") + '</head><body class="auth"><div class="authwrap"><div class="authbox"><div class="brand"><b>' + C.icon("wifi") + "</b><span>" + h(app_name()) + "<small>Billing &amp; Hotspot MikroTik</small></span></div><h1>" + h(title) + "</h1>");
  echo(flashes());
  echo(body + '</div><p class="authfoot">' + h(app_name()) + " v" + C.APP_VER + '</p></div><script src="' + asset_url("app3.js") + '"></script></body></html>');
};
