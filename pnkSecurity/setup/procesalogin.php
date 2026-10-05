<?php
// Autenticación: consulta parametrizada, comparación en tiempo constante, anti fuerza bruta,
// renovación de sesión y mensajes genéricos (ASVS V6/V7, ISO 27001 A.8.5).

require __DIR__ . '/setup.php';
iniciar_sesion();

// Límites en la ventana de 15 minutos. Se cuentan por (cuenta + IP) para que un tercero no pueda dejar
// sin acceso a otra persona fallando a propósito, y por cuenta y por IP en total como tope general.
const LOGIN_MAX_POR_PAR    = 5;
const LOGIN_MAX_POR_CUENTA = 25;
const LOGIN_MAX_POR_IP     = 20;
const LOGIN_VENTANA_SEG    = 900;

$id      = entero_post('id');
$destino = '../index.php' . ($id !== null ? '?id=' . $id . '&' : '?');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    redirigir('../index.php' . ($id !== null ? '?id=' . $id : ''));
}
if ($id === null) {
    responder_error(400, 'Solicitud inválida');
}
if (!csrf_validar()) {
    log_seguridad('AUTH', 'login_csrf_invalido');
    redirigir($destino . 'login=csrf');
}

$email    = mb_substr(trim((string) ($_POST['frmusuario'] ?? '')), 0, 255);
$password = (string) ($_POST['frmpassword'] ?? '');
if ($email === '' || $password === '' || strlen($password) > 128) {
    redirigir($destino . 'login=error');
}

// Cuenta: un correo con bytes UTF-8 inválidos no se envía a la BD (se trata como cuenta inexistente).
$emailValido = mb_check_encoding($email, 'UTF-8');
$fila = $emailValido
    ? (consultar(
        'SELECT Id, nombre, password FROM usuarios WHERE email = ? AND estado = ? LIMIT 1',
        'ss',
        [$email, '1']
    )[0] ?? null)
    : null;

// La clave de la cuenta es su Id real (así 'admin@…', 'ADMIN@…' o 'admín@…', que la BD considera iguales,
// cuentan contra la misma cuenta); si no existe, el correo normalizado.
$ip           = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$claveCuenta  = 'c:' . hash('sha256', $fila !== null ? 'id:' . (int) $fila['Id'] : 'mail:' . ($emailValido ? mb_strtolower($email) : $email));
$clavePar     = 'p:' . hash('sha256', $claveCuenta . '|' . $ip);
$claveIp      = 'i:' . hash('sha256', $ip);

// Comprobación y reserva del intento en una sola sección crítica: peticiones en paralelo no pueden
// superar el límite (la marca se registra ANTES de verificar la clave y se retira si el login es válido).
$control = almacen_operar(function (array &$datos, int $ahora) use ($claveCuenta, $clavePar, $claveIp) {
    if (almacen_contar($datos, $clavePar, $ahora, LOGIN_VENTANA_SEG) >= LOGIN_MAX_POR_PAR
        || almacen_contar($datos, $claveCuenta, $ahora, LOGIN_VENTANA_SEG) >= LOGIN_MAX_POR_CUENTA
        || almacen_contar($datos, $claveIp, $ahora, LOGIN_VENTANA_SEG) >= LOGIN_MAX_POR_IP) {
        return ['bloqueado' => true, 'intentos' => 0];
    }
    foreach ([$clavePar, $claveCuenta, $claveIp] as $k) {
        $datos[$k][] = $ahora;
    }
    return ['bloqueado' => false, 'intentos' => almacen_contar($datos, $clavePar, $ahora, LOGIN_VENTANA_SEG)];
}) ?? ['bloqueado' => false, 'intentos' => 1];

if ($control['bloqueado']) {
    log_seguridad('AUTH', 'login_bloqueado', ['usuario' => log_usuario($email)]);
    redirigir($destino . 'login=bloqueado');
}

// Nota: si las claves pasan a hash, conviene ejecutar password_verify() contra un hash señuelo
// cuando el usuario no existe, para igualar los tiempos de respuesta.
$valido = $fila !== null && verificar_password($password, (string) $fila['password']);

if (!$valido) {
    log_seguridad('AUTH', 'login_fallido', ['usuario' => log_usuario($email), 'intentos' => $control['intentos']]);
    // Retraso incremental (0,3 s por intento fallido, hasta 1,5 s) para encarecer la fuerza bruta.
    usleep(min(max($control['intentos'], 1), 5) * 300000);
    redirigir($destino . 'login=error');
}

// Éxito: se libera el intento reservado y los contadores de la cuenta, y se renueva la sesión (evita fijación).
almacen_operar(function (array &$datos) use ($claveCuenta, $clavePar, $claveIp) {
    unset($datos[$clavePar], $datos[$claveCuenta]);
    if (!empty($datos[$claveIp])) {
        array_pop($datos[$claveIp]);
        if (!$datos[$claveIp]) {
            unset($datos[$claveIp]);
        }
    }
});
log_seguridad('AUTH', 'login_ok', ['usuario' => log_usuario($email), 'uid' => (int) $fila['Id']]);

$carrito = $_SESSION['carrito'] ?? [];
session_regenerate_id(true);
$_SESSION = [
    'uid'              => (int) $fila['Id'],
    'nombre'           => (string) $fila['nombre'],
    'carrito'          => is_array($carrito) ? $carrito : [],
    'inicio'           => time(),
    'ultima_actividad' => time(),
];

redirigir('../index.php?id=' . $id);
