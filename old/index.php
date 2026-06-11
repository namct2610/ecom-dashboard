<?php
// Safety-net redirect: older frontend JS (cached in browser) may still
// point legacy-auth flows at /old/index.php?legacy=1#/login. The full v1
// SPA was removed in 3.4.9; bounce anyone landing here back to the root
// app so they don't see a 404 dead-end.
header('Location: ../', true, 302);
exit;
