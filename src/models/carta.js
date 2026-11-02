'use strict';

module.exports = (pool) => ({
  // Productos destacados de todas las cartas visibles del restaurante.
  async destacados(restauranteId) {
    const r = await pool.query(
      `SELECT i.id, i.nombre, i.descripcion, i.observaciones, i.tiempo, i.puntuacion, i.precio, i.foto
         FROM items i
         JOIN categorias k ON i.categoria_id = k.id
         JOIN cartas c ON k.carta_id = c.id
        WHERE i.destacado AND i.visible AND i.eliminado_en IS NULL
          AND k.visible AND k.eliminado_en IS NULL
          AND c.visible AND c.eliminado_en IS NULL
          AND c.restaurante_id = $1
        ORDER BY i.id`,
      [restauranteId]
    );
    return r.rows;
  },

  // Arbol completo de la carta publica: cartas (pestanas) -> categorias -> productos.
  // Tres consultas en total (no una por categoria como en la version PHP).
  async arbolPublico(restauranteId) {
    const cartas = (await pool.query(
      `SELECT id, nombre FROM cartas
        WHERE restaurante_id = $1 AND visible AND eliminado_en IS NULL
        ORDER BY orden NULLS LAST, id`,
      [restauranteId]
    )).rows;
    if (cartas.length === 0) return [];

    const categorias = (await pool.query(
      `SELECT id, nombre, carta_id FROM categorias
        WHERE carta_id = ANY($1) AND visible AND eliminado_en IS NULL
        ORDER BY orden NULLS LAST, id`,
      [cartas.map((c) => c.id)]
    )).rows;

    const items = categorias.length === 0 ? [] : (await pool.query(
      `SELECT id, nombre, descripcion, observaciones, tiempo, puntuacion, precio, foto, categoria_id
         FROM items
        WHERE categoria_id = ANY($1) AND visible AND eliminado_en IS NULL
        ORDER BY orden NULLS LAST, id`,
      [categorias.map((k) => k.id)]
    )).rows;

    return cartas.map((carta) => ({
      ...carta,
      categorias: categorias
        .filter((k) => k.carta_id === carta.id)
        .map((k) => ({ ...k, items: items.filter((i) => i.categoria_id === k.id) })),
    }));
  },

  // Producto agregable al carrito: misma cadena de visibilidad que la carta y debe pertenecer al restaurante.
  // El precio y el nombre SIEMPRE salen de la BD, nunca del cliente.
  async itemParaCarrito(itemId, restauranteId) {
    const r = await pool.query(
      `SELECT i.id, i.nombre, i.precio
         FROM items i
         JOIN categorias k ON i.categoria_id = k.id
         JOIN cartas c ON k.carta_id = c.id
         JOIN restaurantes r ON c.restaurante_id = r.id
        WHERE i.id = $1 AND c.restaurante_id = $2
          AND i.visible AND i.eliminado_en IS NULL
          AND k.visible AND k.eliminado_en IS NULL
          AND c.visible AND c.eliminado_en IS NULL
          AND r.eliminado_en IS NULL`,
      [itemId, restauranteId]
    );
    return r.rows[0] || null;
  },
});
