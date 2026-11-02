-- 002_datos_iniciales.sql
-- Datos del volcado MySQL original (pnk_security.sql, 05/11/2020), traducidos a PostgreSQL.
--   * Las fechas '1899-12-29 00:00:00' de MySQL (fecha cero mal convertida) pasan a NULL.
--   * Los ids originales se conservan (hay huecos: 9, 6 de items...) para no romper las rutas de imagen
--     (public/imagenes/cod<restaurante>/...) ni los enlaces existentes.
--   * Los usuarios NO se cargan aqui: se crean con scripts/seed-usuarios.js, que calcula el hash scrypt
--     (el volcado original guardaba las claves en texto plano).
--   * Los comentarios del volcado original estaban vacios.

INSERT INTO direcciones (id, calle, numero, comuna, region, creado_en, actualizado_en, eliminado_en) VALUES
  (1, 'Los Arandanos',     '1550', 'La Serena',  'Coquimbo', '2020-09-22 22:57:59-03', NULL,                     NULL),
  (2, 'Avenida Argentina', '951',  'La Serena',  'Coquimbo', '2020-09-24 14:58:00-03', '2020-10-04 12:14:35-03', NULL),
  (3, 'Balmaceda',         '357',  'La Serena',  'Coquimbo', '2020-09-24 14:58:00-03', '2020-09-28 01:59:00-03', NULL),
  (4, 'Peru',              '2255', 'La Serena',  'Coquimbo', '2020-09-27 14:10:19-03', '2020-09-28 01:58:16-03', NULL),
  (5, 'Miraflores',        '36',   'Ovalle',     'Coquimbo', '2020-09-28 15:31:09-03', NULL,                     NULL),
  (6, 'Arrayanes',         '66',   'La Higuera', 'Coquimbo', '2020-09-29 10:35:11-03', NULL,                     NULL),
  (7, 'Casa',              '25',   'La Higuera', 'Coquimbo', '2020-09-30 17:38:12-03', NULL,                     NULL),
  (8, 'Guatemala',         '55',   'La Serena',  'Coquimbo', '2020-10-05 04:59:40-03', '2020-10-05 05:14:08-03', NULL);

INSERT INTO restaurantes (id, rut, nombre, fono, mapa, foto, email, direccion_id, creado_en, actualizado_en, eliminado_en) VALUES
  (1, '99887766-5', 'Afríca Restobar',        '22334455',  NULL, 'resto1.jpg',                'mail@correo.cl',  2, '2020-09-22 22:59:26-03', '2020-10-04 12:14:35-03', NULL),
  (2, '88776655-4', 'Restaurant la Bahía',    '512323232', NULL, 'resto2.png',                'mail1@correo.cl', 3, '2020-09-24 15:07:32-03', '2020-09-28 01:59:00-03', NULL),
  (3, '22334455-6', 'La Esquina del Sabor',   '22334455',  NULL, 'logo_empresa_comodin.png',  'mail2@correo.cl', 4, '2020-09-27 14:10:20-03', '2020-09-28 01:58:16-03', NULL),
  (4, '258-3',      'La Pica de Armando',     '223366',    NULL, 'logo_empresa_comodin.png',  'mail3@correo.cl', 5, '2020-09-28 15:31:09-03', NULL,                     NULL),
  (5, '258-9',      'Donde Carlos',           '336699',    NULL, 'logo_empresa_comodin.png',  'mail4@correo.cl', 6, '2020-09-29 10:35:12-03', NULL,                     NULL),
  (6, '258-6',      'RestoPenka',             '336699',    NULL, 'logo_empresa_comodin.png',  'mail5@correo.cl', 7, '2020-09-30 17:38:12-03', NULL,                     NULL),
  (7, '369-5',      'La Pica de Carolina',    '336699',    NULL, 'logo_empresa_comodin.png',  'mail6@correo.cl', 8, '2020-10-05 04:59:40-03', '2020-10-05 05:14:08-03', NULL);

INSERT INTO cartas (id, nombre, orden, visible, foto, restaurante_id, creado_en, actualizado_en, eliminado_en) VALUES
  (1,  'Vinos',       1, true, 'carta2.jpg',  1, '2020-09-22 23:03:07-03', NULL, NULL),
  (2,  'Bebidas',     2, true, 'carta2.jpg',  1, '2020-09-22 23:03:07-03', NULL, NULL),
  (3,  'Entradas',    3, true, 'carta3.jpg',  1, '2020-09-22 23:06:14-03', NULL, NULL),
  (4,  'Principales', 4, true, 'carta6.jpg',  1, '2020-09-22 23:06:14-03', NULL, NULL),
  (5,  'Postres',     5, true, 'carta6.jpg',  1, '2020-09-22 23:30:22-03', NULL, NULL),
  (6,  'Helados',     9, true, 'carta6.jpg',  1, '2020-09-23 04:55:51-03', NULL, NULL),
  (7,  'Pizzas',      6, true, 'carta7.jpg',  1, '2020-09-23 05:38:42-03', NULL, NULL),
  (8,  'Dulces',      7, true, 'carta6.jpg',  1, '2020-09-23 05:48:07-03', NULL, NULL),
  (10, 'Vinos',       1, true, 'carta10.jpg', 2, '2020-09-24 15:54:20-03', NULL, NULL),
  (11, 'Principal',   2, true, 'carta11.jpg', 2, '2020-09-26 20:20:07-03', NULL, NULL),
  (12, 'Comiditas',   2, true, 'carta12.jpg', 2, '2020-09-29 19:08:01-03', NULL, NULL);

INSERT INTO categorias (id, nombre, visible, foto, orden, carta_id, creado_en, actualizado_en, eliminado_en) VALUES
  (1,  'Blancos',        true,  NULL, 1,    1,  '2020-09-22 23:28:29-03', NULL, NULL),
  (2,  'Tintos',         true,  NULL, 2,    1,  '2020-09-22 23:28:29-03', NULL, NULL),
  (3,  'Carnes',         true,  NULL, 1,    4,  '2020-09-22 23:33:02-03', NULL, NULL),
  (4,  'Pescados',       true,  NULL, 2,    4,  '2020-09-22 23:33:02-03', NULL, NULL),
  (5,  'Mariscos',       true,  NULL, 3,    4,  '2020-09-22 23:33:02-03', NULL, NULL),
  (6,  'Pastas',         true,  NULL, 4,    4,  '2020-09-22 23:33:02-03', NULL, NULL),
  (7,  'Frías',          true,  NULL, 1,    3,  '2020-09-22 23:36:44-03', NULL, NULL),
  (8,  'Calientes',      true,  NULL, 2,    3,  '2020-09-22 23:36:44-03', NULL, NULL),
  (9,  'Comida casera',  false, NULL, NULL, 4,  '2020-09-22 23:40:40-03', NULL, NULL),
  (10, 'Con Alcohol',    true,  NULL, NULL, 2,  '2020-09-22 23:42:52-03', NULL, NULL),
  (11, 'Sin Alcohol',    true,  NULL, 2,    2,  '2020-09-22 23:42:52-03', NULL, NULL),
  (12, 'Blancos',        true,  NULL, 2,    10, '2020-09-26 18:19:37-03', NULL, NULL),
  (13, 'Tintos',         true,  NULL, 1,    10, '2020-09-26 18:19:58-03', NULL, NULL),
  (14, 'Carnes',         true,  NULL, 1,    11, '2020-09-26 20:21:37-03', NULL, NULL);

INSERT INTO items (id, nombre, descripcion, tiempo, observaciones, precio, visible, destacado, puntuacion, foto, orden, categoria_id, creado_en, actualizado_en, eliminado_en) VALUES
  (1, 'Ensalada Cesar',     'Ensalada con queso',                         '15 minutos', NULL,                    3500,  true, false, 4, 'item1.jpg', 1,    7,  '2020-09-22 23:39:07-03', NULL,                     NULL),
  (2, 'Crema de espinacas', 'Crema a base de espinacas y finas hierbas',  '20 minutos', '',                      2000,  true, true,  4, 'item2.jpg', 2,    8,  '2020-09-22 23:39:07-03', '2020-09-29 01:48:57-03', NULL),
  (3, 'Porotos Granados',   'Porotos con verduras',                       '25 minutos', NULL,                    3500,  true, false, 5, 'item3.jpg', NULL, 9,  '2020-09-22 23:43:50-03', NULL,                     '2020-09-29 02:02:48-03'),
  (4, 'Pisco Sour',         'Pisco sour casero',                          '15 minutos', NULL,                    3500,  true, false, 0, 'item4.jpg', NULL, 10, '2020-09-22 23:43:50-03', NULL,                     NULL),
  (5, 'Lomo a lo Pobre',    'Lomo con papas fritas, huevo y cebolla',     '30 minutos', 'Muy sabroso',           12500, true, true,  5, 'item5.jpg', 1,    3,  '2020-09-29 02:12:03-03', NULL,                     NULL),
  (7, 'Lomo a lo Pobre',    'Lomo a lo Pobre',                            '20 minutos', 'Rico Lomo a lo Pobre',  9900,  true, true,  3, 'item3.jpg', 2,    3,  '2020-10-05 20:30:06-03', NULL,                     NULL);

-- Reajusta las secuencias de identidad al maximo id cargado.
SELECT setval(pg_get_serial_sequence('direcciones',  'id'), (SELECT max(id) FROM direcciones));
SELECT setval(pg_get_serial_sequence('restaurantes', 'id'), (SELECT max(id) FROM restaurantes));
SELECT setval(pg_get_serial_sequence('cartas',       'id'), (SELECT max(id) FROM cartas));
SELECT setval(pg_get_serial_sequence('categorias',   'id'), (SELECT max(id) FROM categorias));
SELECT setval(pg_get_serial_sequence('items',        'id'), (SELECT max(id) FROM items));
