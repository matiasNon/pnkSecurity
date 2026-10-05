<?php
// Operaciones del carrito (AJAX). Sólo POST con token CSRF, entradas validadas y
// consultas parametrizadas. El precio siempre se toma de la BD, nunca del cliente.

require __DIR__ . '/setup/setup.php';
iniciar_sesion();

const CARRITO_MAX_ITEMS = 50;

// Estructura de la solicitud: método POST, formulario codificado y token CSRF válido.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    responder_error(405, 'Método no permitido');
}
if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/x-www-form-urlencoded') !== 0) {
    responder_error(415, 'Tipo de contenido no soportado');
}
if (!csrf_validar()) {
    log_seguridad('SEC', 'carrito_csrf_invalido');
    responder_error(403, 'Solicitud no autorizada');
}

$carrito = (isset($_SESSION['carrito']) && is_array($_SESSION['carrito'])) ? $_SESSION['carrito'] : [];
$op = $_POST['op'] ?? '';

switch ($op) {
    case '1': // agregar
        $iditem = entero_post('iditems');
        $idrest = entero_post('rid');
        if ($iditem === null || $idrest === null) {
            responder_error(400, 'Solicitud inválida');
        }
        if (count($carrito) >= CARRITO_MAX_ITEMS) {
            responder_error(409, 'El carrito alcanzó el máximo de productos');
        }
        $item = consultar(
            // Misma cadena de visibilidad que la carta (producto, categoría, carta y restaurante) y el
            // producto debe pertenecer al restaurante desde el que se agrega.
            'SELECT items.id, items.nombre, items.precio FROM items'
            . ' INNER JOIN categorias ON items.categorias_id = categorias.id'
            . ' INNER JOIN cartas ON categorias.cartas_id = cartas.id'
            . ' INNER JOIN restautantes ON cartas.restautantes_id = restautantes.id'
            . ' WHERE items.id = ? AND cartas.restautantes_id = ?'
            . ' AND items.visible = 1 AND items.eliminado IS NULL'
            . ' AND categorias.visible = 1 AND categorias.eliminado IS NULL'
            . ' AND cartas.visible = 1 AND cartas.eliminada IS NULL'
            . ' AND restautantes.eliminado IS NULL',
            'ii',
            [$iditem, $idrest]
        )[0] ?? null;
        if ($item === null) {
            responder_error(404, 'Producto no encontrado');
        }
        $pos = ($carrito ? max(array_keys($carrito)) : 0) + 1;
        $carrito[$pos] = [
            'posicion' => $pos,
            'id'       => (int) $item['id'],
            'nombre'   => (string) $item['nombre'],
            'precio'   => (int) $item['precio'],
        ];
        break;

    case '2': // eliminar un ítem
        $pos = entero_post('pos');
        if ($pos === null) {
            responder_error(400, 'Solicitud inválida');
        }
        unset($carrito[$pos]);
        break;

    case '3': // vaciar el carrito (no cierra la sesión del usuario)
        $carrito = [];
        break;

    default:
        responder_error(400, 'Solicitud inválida');
}

$_SESSION['carrito'] = $carrito;
header('Content-Type: application/json; charset=UTF-8');
echo json_encode(['ok' => true]);
