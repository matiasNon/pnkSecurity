<?php

function conectar(): mysqli
{
    static $con = null;
    if ($con instanceof mysqli) {
        return $con;
    }
    $cfg = ['host'=>'localhost','name'=>'pnk_security','user'=>'root','pass'=>'','port'=>3306];
    $con = new mysqli($cfg['host'], $cfg['user'], $cfg['pass'], $cfg['name'], $cfg['port']);
    $con->set_charset('utf8mb4');
    return $con;
}

/** SELECT parametrizado: devuelve todas las filas como arreglos asociativos. */
function consultar(string $sql, string $tipos = '', array $params = []): array
{
    $stmt = conectar()->prepare($sql);
    if ($tipos !== '') {
        $stmt->bind_param($tipos, ...$params);
    }
    $stmt->execute();
    $filas = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $filas;
}

/** INSERT/UPDATE/DELETE parametrizado: devuelve las filas afectadas. */
function ejecutar(string $sql, string $tipos = '', array $params = []): int
{
    $stmt = conectar()->prepare($sql);
    if ($tipos !== '') {
        $stmt->bind_param($tipos, ...$params);
    }
    $stmt->execute();
    $afectadas = $stmt->affected_rows;
    $stmt->close();
    return $afectadas;
}

// --- Salida y entradas ---

/** Escape de salida HTML para cualquier dato que provenga de BD, sesión o usuario. */
function e($valor): string
{
    return htmlspecialchars((string) $valor, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function entero_get(string $clave): ?int
{
    $v = filter_input(INPUT_GET, $clave, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 2147483647]]);
    return is_int($v) ? $v : null;
}

function entero_post(string $clave): ?int
{
    $v = filter_input(INPUT_POST, $clave, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 2147483647]]);
    return is_int($v) ? $v : null;
}

/** Ruta relativa de una imagen sólo si el nombre de archivo es seguro; si no, null. */
function ruta_foto(int $restauranteId, $foto): ?string
{
    if (!is_string($foto) || !preg_match('/^[A-Za-z0-9._-]{1,100}\.(jpe?g|png|gif|webp)\z/i', $foto) || strpos($foto, '..') !== false) {
        return null;
    }
    return 'imagenes/cod' . $restauranteId . '/' . $foto;
}

function responder_error(int $codigo, string $mensaje): void
{
    http_response_code($codigo);
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' . e($mensaje) . '</title></head>'
       . '<body><h1>' . e($mensaje) . '</h1></body></html>';
    exit;
}

/** Redirección interna (sólo rutas relativas construidas por el servidor). */
function redirigir(string $ruta): void
{
    header('Location: ' . $ruta);
    exit;
}

function quitarespacios($titulo)
{
    $titulo = str_replace(" ", "", $titulo);
    $cadena = str_replace("ñ", "", $titulo);
    $cadena = str_replace("Ñ", "", $cadena);
    return $cadena;
}

function moneda_chilena($numero)
{
    $numero = (string) (int) $numero;
    $tmp = "";
    $pos = 1;
    for ($i = strlen($numero) - 1; $i >= 0; $i--) {
        $tmp = $tmp . substr($numero, $i, 1);
        if ($pos % 3 == 0 && $pos != strlen($numero)) {
            $tmp = $tmp . ".";
        }
        $pos = $pos + 1;
    }
    return "$ " . strrev($tmp);
}

// --- Sesión endurecida (ASVS V7) ---
const SESION_INACTIVIDAD_MAX = 1800;  // 30 minutos sin actividad
const SESION_VIDA_MAX        = 28800; // 8 horas desde el inicio de sesión, aunque haya actividad

function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    // Que el servidor no borre la sesión antes que el control de inactividad de este código.
    ini_set('session.gc_maxlifetime', (string) (SESION_INACTIVIDAD_MAX + 600));
    session_name('PNKSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => es_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
    $ahora = time();
    $inactiva = isset($_SESSION['ultima_actividad']) && ($ahora - (int) $_SESSION['ultima_actividad']) > SESION_INACTIVIDAD_MAX;
    $vencida  = isset($_SESSION['inicio']) && ($ahora - (int) $_SESSION['inicio']) > SESION_VIDA_MAX;
    if ($inactiva || $vencida) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['ultima_actividad'] = $ahora;
}

function usuario_autenticado(): bool
{
    return isset($_SESSION['uid']) && is_int($_SESSION['uid']);
}

// --- CSRF (ASVS V3): token por sesión, comparación en tiempo constante ---
function csrf_token(): string
{
    iniciar_sesion();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_campo(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function csrf_validar(): bool
{
    iniciar_sesion();
    $enviado = $_POST['csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    return is_string($enviado) && isset($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $enviado);
}
