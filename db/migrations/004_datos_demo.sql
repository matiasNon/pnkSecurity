-- Datos de demostracion de la carta del restaurante 1 (cargados por el panel el 09-11-2026 y fijados aqui el 12-11-2026)
-- para que cualquier despliegue nuevo (incluida la prueba de borrar y volver a desplegar) muestre la carta completa.
-- Fotos: archivos estaticos del frontend en /imagenes/cod1/ (frontend/public/imagenes/cod1).
-- IDEMPOTENTE: en una base que ya tiene estos datos (produccion) no inserta duplicados ni pisa cambios hechos por el panel.

-- 1) Categorias nuevas (por nombre dentro de su carta)
INSERT INTO categorias (nombre, visible, orden, carta_id)
SELECT v.nombre, true, 1, v.carta_id
  FROM (VALUES ('Tortas', 5), ('Clásicas', 7), ('Tradicionales', 8), ('Copas', 6)) AS v(nombre, carta_id)
 WHERE EXISTS (SELECT 1 FROM cartas c WHERE c.id = v.carta_id)
   AND NOT EXISTS (SELECT 1 FROM categorias k WHERE k.carta_id = v.carta_id AND k.nombre = v.nombre AND k.eliminado_en IS NULL);

-- 2) Productos (por nombre dentro del restaurante 1)
INSERT INTO items (nombre, descripcion, tiempo, observaciones, precio, visible, destacado, puntuacion, foto, orden, categoria_id)
SELECT v.nombre, v.descripcion, v.tiempo, v.observaciones, v.precio, true, false, v.puntuacion, v.foto, NULL, k.id
  FROM (VALUES
    ('Reineta a la plancha',     'Filete de reineta a la plancha con ensalada chilena',          '25 minutos', 'Con limón y cilantro',     11900, 4, 'reineta-plancha.jpg',   4, 'Pescados'),
    ('Machas a la parmesana',    'Machas gratinadas con queso parmesano en sus conchas',         '20 minutos', 'Plato para compartir',     12900, 5, 'machas-parmesana.jpg',  4, 'Mariscos'),
    ('Fettuccine al pesto',      'Fettuccine con salsa pesto de albahaca, piñones y parmesano',  '20 minutos', 'Opción vegetariana',        9500, 4, 'fettuccine-pesto.jpg',  4, 'Pastas'),
    ('Torta tres leches',        'Bizcocho bañado en tres leches con merengue tostado',          '10 minutos', 'Porción individual',        3900, 5, 'torta-tres-leches.jpg', 5, 'Tortas'),
    ('Pizza pepperoni',          'Masa a la piedra, salsa de tomate, mozzarella y pepperoni',    '25 minutos', 'Tamaño mediano, 8 trozos', 10900, 4, 'pizza-pepperoni.jpg',   7, 'Clásicas'),
    ('Alfajores de maicena',     'Alfajores rellenos con manjar y bordes de coco rallado',       '5 minutos',  '4 unidades',                2500, 4, 'alfajores-maicena.jpg', 8, 'Tradicionales'),
    ('Copa de helado de lúcuma', 'Dos bolas de helado de lúcuma con salsa de manjar y barquillo', '5 minutos', NULL,                        3500, 5, 'helado-lucuma.jpg',     6, 'Copas')
  ) AS v(nombre, descripcion, tiempo, observaciones, precio, puntuacion, foto, carta_id, categoria)
  JOIN categorias k ON k.carta_id = v.carta_id AND k.nombre = v.categoria AND k.eliminado_en IS NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM items i JOIN categorias k2 ON k2.id = i.categoria_id JOIN cartas c2 ON c2.id = k2.carta_id
    WHERE c2.restaurante_id = 1 AND i.nombre = v.nombre AND i.eliminado_en IS NULL);

-- 3) Portadas 4:1 de las cartas del restaurante 1: solo si siguen con la imagen original del volcado
--    (si un administrador ya puso otra portada por el panel, se respeta).
UPDATE cartas c SET foto = v.foto, actualizado_en = now()
  FROM (VALUES
    (1, 'portada-vinos.webp'), (2, 'portada-bebidas.webp'), (3, 'portada-entradas.webp'), (4, 'portada-principales.webp'),
    (5, 'portada-postres.webp'), (6, 'portada-helados.webp'), (7, 'portada-pizzas.webp'), (8, 'portada-dulces.webp')
  ) AS v(id, foto)
 WHERE c.id = v.id AND c.restaurante_id = 1
   AND (c.foto IS NULL OR c.foto IN ('carta2.jpg', 'carta3.jpg', 'carta6.jpg', 'carta7.jpg'));
