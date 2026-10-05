<?php
/**
 * Núcleo de seguridad de pnkSecurity.
 *
 * Todas las páginas incluyen este archivo. Centraliza: manejo de errores,
 * conexión a BD, consultas parametrizadas, escape de salida, sesión endurecida,
 * protección CSRF y cabeceras HTTP de seguridad.
 */

// --- Errores: nunca mostrar detalles técnicos al usuario (A.8.28 / ASVS V16) ---
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// Requisitos mínimos: con PHP < 7.3 las opciones de la cookie de sesión (HttpOnly/SameSite) se
// ignorarían en silencio, así que se prefiere fallar de forma controlada.
if (PHP_VERSION_ID < 70300 || !extension_loaded('mysqli') || !extension_loaded('mbstring')) {
    error_log('[pnkSecurity] Requisitos no cumplidos: PHP >= 7.3 con las extensiones mysqli y mbstring.');
    if (PHP_SAPI !== 'cli' && !headers_sent()) {
        http_response_code(500);
    }
    exit('Error de configuración del servidor.');
}

set_exception_handler(function (Throwable $t) {
    error_log('[pnkSecurity] ' . get_class($t) . ': ' . $t->getMessage() . ' @ ' . $t->getFile() . ':' . $t->getLine());
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, "Error: " . $t->getMessage() . PHP_EOL);
        exit(1);
    }
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/html; charset=UTF-8');
    }
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Error</title></head>'
       . '<body><h1>Ha ocurrido un error</h1><p>Intente nuevamente más tarde.</p></body></html>';
    exit;
});

function es_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

// --- Cabeceras de seguridad (ASVS V3 / V13) ---
function enviar_cabeceras_seguridad(): void
{
    if (PHP_SAPI === 'cli' || headers_sent()) {
        return;
    }
    header_remove('X-Powered-By');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; "
         . "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
         . "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; "
         . "connect-src 'self'; object-src 'none'; base-uri 'self'; "
         . "form-action 'self'; frame-ancestors 'none'");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), camera=(), microphone=()');
    header('Cache-Control: no-store');
    if (es_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}
enviar_cabeceras_seguridad();

// --- Conexión a BD ---
// Los valores por defecto son los que usaba la aplicación (la BD no se modifica). Se pueden
// sobrescribir con variables de entorno del servidor (PNK_DB_HOST, PNK_DB_NAME, PNK_DB_USER,
// PNK_DB_PASS, PNK_DB_PORT), por ejemplo para usar un usuario de BD de menor privilegio
// el día que se decida crearlo.
/** Lee una variable PNK_* del entorno del proceso o de SetEnv de Apache (que según el SAPI llega por $_SERVER). */
function env_pnk(string $nombre): string
{
    $v = getenv($nombre);
    if ($v === false || $v === '') {
        $v = $_SERVER[$nombre] ?? '';
    }
    return is_string($v) ? $v : '';
}

function cargar_config_bd(): array
{
    return [
        'host' => env_pnk('PNK_DB_HOST') ?: 'localhost',
        'name' => env_pnk('PNK_DB_NAME') ?: 'pnk_security',
        'user' => env_pnk('PNK_DB_USER') ?: 'root',
        'pass' => env_pnk('PNK_DB_PASS'),
        'port' => (int) (env_pnk('PNK_DB_PORT') ?: 3306),
    ];
}

function conectar(): mysqli
{
    static $con = null;
    if ($con instanceof mysqli) {
        return $con;
    }
    $cfg = cargar_config_bd();
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

// --- Almacén de contadores (límites de intentos de login y de comentarios) ---
// No usa la BD ni archivos del proyecto: es un JSON en el directorio temporal del sistema (donde PHP
// ya guarda las sesiones), con permisos 0600 y bloqueo exclusivo (flock). Sólo guarda hashes y marcas
// de tiempo, que se descartan a la hora. $operacion recibe (array &$datos, int $ahora) y puede
// consultar y modificar los contadores de forma atómica. Si el archivo no se puede usar se registra el
// error y devuelve null (el llamador decide cómo seguir).
const ALMACEN_RETENCION_SEG = 3600;
const ALMACEN_MAX_CLAVES    = 5000;

function almacen_operar(callable $operacion)
{
    $ruta = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pnk_estado_' . substr(hash('sha256', __DIR__), 0, 12) . '.json';
    $mascara = umask(0077);
    $f = @fopen($ruta, 'c+');
    umask($mascara);
    if ($f === false || !flock($f, LOCK_EX)) {
        error_log('[pnkSecurity] No se pudo abrir o bloquear el almacén de contadores: ' . $ruta);
        if (is_resource($f)) {
            fclose($f);
        }
        return null;
    }
    try {
        $datos = json_decode((string) stream_get_contents($f), true);
        if (!is_array($datos)) {
            $datos = [];
        }
        $ahora  = time();
        $limite = $ahora - ALMACEN_RETENCION_SEG;
        foreach ($datos as $clave => $marcas) {
            $vigentes = array_values(array_filter(is_array($marcas) ? $marcas : [], function ($t) use ($limite) {
                return is_int($t) && $t > $limite;
            }));
            if ($vigentes) {
                $datos[$clave] = $vigentes;
            } else {
                unset($datos[$clave]);
            }
        }
        if (count($datos) > ALMACEN_MAX_CLAVES) {
            $datos = array_slice($datos, -ALMACEN_MAX_CLAVES, null, true);
        }
        $resultado = $operacion($datos, $ahora);
        // Se escribe primero y se trunca al final: nunca queda un instante con el archivo vacío.
        $json = (string) json_encode($datos);
        rewind($f);
        if (fwrite($f, $json) === false) {
            error_log('[pnkSecurity] No se pudo escribir el almacén de contadores.');
        } else {
            ftruncate($f, strlen($json));
            fflush($f);
        }
        return $resultado;
    } finally {
        flock($f, LOCK_UN);
        fclose($f);
    }
}

/** Cantidad de marcas de tiempo de $clave dentro de los últimos $ventana segundos. */
function almacen_contar(array $datos, string $clave, int $ahora, int $ventana): int
{
    $n = 0;
    foreach ($datos[$clave] ?? [] as $t) {
        if ($t > $ahora - $ventana) {
            $n++;
        }
    }
    return $n;
}

// --- Registro de eventos de seguridad (ASVS V16, ISO 27001 A.8.15) ---
// Va al log de errores del servidor (error_log de PHP/Apache), que no es accesible por HTTP.
// Nunca se registran contraseñas. Los valores se limpian para evitar inyección de líneas en el log.
function log_limpiar($valor, int $max = 100): string
{
    $v = preg_replace('/[\x00-\x1F\x7F]+/', ' ', (string) $valor);
    return mb_substr((string) $v, 0, $max, 'UTF-8');
}

/** Identifica al usuario en el log: el email si es válido; si no (p. ej. alguien escribió su clave en el campo), sólo un hash corto. */
function log_usuario($usuario): string
{
    $u = trim((string) $usuario);
    if ($u !== '' && filter_var($u, FILTER_VALIDATE_EMAIL) !== false) {
        return log_limpiar($u);
    }
    return $u === '' ? '(vacio)' : '(no-email:' . substr(hash('sha256', $u), 0, 10) . ')';
}

function log_seguridad(string $categoria, string $evento, array $datos = []): void
{
    $partes = [
        'fecha=' . date('c'),
        'ip=' . log_limpiar($_SERVER['REMOTE_ADDR'] ?? '-', 45),
    ];
    foreach ($datos as $clave => $valor) {
        $partes[] = log_limpiar($clave, 30) . '=' . log_limpiar($valor);
    }
    error_log('[' . $categoria . '] ' . $evento . ' ' . implode(' ', $partes));
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

/**
 * Compara la clave ingresada con la almacenada.
 * Si la BD guarda un hash (password_hash) se usa password_verify; si guarda texto plano
 * (estado actual de la BD, que no se modifica) se compara en tiempo constante y distinguiendo
 * mayúsculas. Así el código sigue funcionando el día que las claves pasen a hash.
 */
function verificar_password(string $ingresada, string $almacenada): bool
{
    $info = password_get_info($almacenada);
    if (!empty($info['algo'])) {
        return password_verify($ingresada, $almacenada);
    }
    return $almacenada !== '' && hash_equals($almacenada, $ingresada);
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
