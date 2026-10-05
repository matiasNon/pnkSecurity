<?php
// Publicación de comentarios: requiere sesión, POST con token CSRF, autor tomado de
// la sesión (no del formulario), validación de longitud y consulta parametrizada.
// El escape contra XSS se aplica al mostrar los comentarios (index.php).

require __DIR__ . '/setup/setup.php';
iniciar_sesion();

const COMENTARIO_MAX        = 1000;
const COMENTARIO_ESPERA_SEG = 10;  // mínimo entre dos comentarios del mismo usuario
const COMENTARIO_MAX_HORA   = 30;  // tope por usuario y por hora

$id = entero_post('id');
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || $id === null) {
    responder_error(400, 'Solicitud inválida');
}
$destino = 'index.php?id=' . $id;
if (!csrf_validar()) {
    // Sesión vencida o token obsoleto: se vuelve a la carta con un aviso en lugar de una página de error.
    log_seguridad('SEC', 'comentario_csrf_invalido');
    redirigir($destino . '&c=csrf');
}
if (!usuario_autenticado()) {
    log_seguridad('SEC', 'comentario_sin_sesion', ['restaurante' => $id]);
    responder_error(403, 'Debe iniciar sesión para comentar');
}

// La sesión no se confía ciegamente: se vuelve a comprobar que la cuenta siga activa.
$cuenta = consultar('SELECT estado FROM usuarios WHERE Id = ? LIMIT 1', 'i', [$_SESSION['uid']])[0] ?? null;
if ($cuenta === null || (string) $cuenta['estado'] !== '1') {
    log_seguridad('SEC', 'comentario_cuenta_inactiva', ['uid' => $_SESSION['uid']]);
    responder_error(403, 'Cuenta no habilitada');
}

$existe = consultar('SELECT id FROM restautantes WHERE id = ? AND eliminado IS NULL', 'i', [$id]);
if (!$existe) {
    responder_error(404, 'Restaurante no encontrado');
}

$comentario = trim((string) ($_POST['comentario'] ?? ''));
if (mb_check_encoding($comentario, 'UTF-8')) {
    // La columna de la BD es utf8 (3 bytes): se descartan los caracteres de 4 bytes (emojis)
    // en lugar de provocar un error al guardar.
    $comentario = trim((string) preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $comentario));
}
$largo = mb_strlen($comentario, 'UTF-8');
if (!mb_check_encoding($comentario, 'UTF-8') || $largo < 1 || $largo > COMENTARIO_MAX) {
    redirigir($destino . '&c=invalido');
}

// Límite por usuario (no por sesión: iniciar sesión de nuevo no lo reinicia).
$uid = (int) $_SESSION['uid'];
$limitado = almacen_operar(function (array &$datos, int $ahora) use ($uid) {
    $clave  = 'm:' . $uid;
    $marcas = $datos[$clave] ?? [];
    $ultimo = $marcas ? max($marcas) : 0;
    if (($ahora - $ultimo) < COMENTARIO_ESPERA_SEG || almacen_contar($datos, $clave, $ahora, 3600) >= COMENTARIO_MAX_HORA) {
        return true;
    }
    $datos[$clave][] = $ahora;
    return false;
});
if ($limitado) {
    log_seguridad('SEC', 'comentario_limitado', ['uid' => $uid]);
    redirigir($destino . '&c=espera');
}

try {
    ejecutar(
        'INSERT INTO comentarios (usuario, comentario, id_restaurante) VALUES (?, ?, ?)',
        'ssi',
        [(string) $_SESSION['nombre'], $comentario, $id]
    );
} catch (mysqli_sql_exception $ex) {
    error_log('[pnkSecurity] No se pudo guardar el comentario: ' . $ex->getMessage());
    redirigir($destino . '&c=error');
}
log_seguridad('SEC', 'comentario_publicado', ['uid' => $uid, 'restaurante' => $id]);

redirigir($destino . '&c=ok');
