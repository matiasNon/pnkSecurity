<?php
// Cierre de sesión: sólo por POST con token CSRF; invalida la sesión en el servidor
// y expira la cookie (ASVS V7).

require __DIR__ . '/setup.php';
iniciar_sesion();

$id      = entero_post('id');
$destino = '../index.php' . ($id !== null ? '?id=' . $id : '');

if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_validar()) {
    log_seguridad('AUTH', 'logout', ['uid' => $_SESSION['uid'] ?? '-']);
    session_unset();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'],
            'domain'   => $p['domain'],
            'secure'   => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
}

redirigir($destino);
