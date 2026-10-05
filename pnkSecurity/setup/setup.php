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

/** Ruta relativa de una imagen sólo si el nombre de archivo es seguro; si no, null. */
function ruta_foto(int $restauranteId, $foto): ?string
{
    if (!is_string($foto) || !preg_match('/^[A-Za-z0-9._-]{1,100}\.(jpe?g|png|gif|webp)\z/i', $foto) || strpos($foto, '..') !== false) {
        return null;
    }
    return 'imagenes/cod' . $restauranteId . '/' . $foto;
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

