# Migracion de MySQL (PHP) a PostgreSQL (Node.js)

Origen: `Script_BD/pnk_security.sql` (MySQL 8, 05/11/2020). Destino: `db/migrations/*.sql`, aplicadas por `scripts/migrate.js`
(tabla `schema_migrations`, idempotente, con candado para varias instancias).

| Migracion | Contenido |
|---|---|
| `001_esquema.sql` | Tablas, claves foraneas, indices, `citext`, CHECK de rangos |
| `002_datos_iniciales.sql` | 8 direcciones, 7 restaurantes, 11 cartas, 14 categorias, 6 productos (1 eliminado) |
| `003_seguridad.sql` | `sesiones` (connect-pg-simple) e `intentos` (limitacion de login y comentarios) |

Cambios de modelo: `restautantes` -> `restaurantes` (error de tipeo); `Id` -> `id`; `bit(1)` -> `boolean`; `datetime` -> `timestamptz`;
`AUTO_INCREMENT` -> `IDENTITY`; fechas `1899-12-29` (fecha cero mal convertida) -> `NULL`; campos `creado/actualizado/eliminado`
-> `*_en`; `usuarios.password` en texto plano -> `password_hash` (scrypt); `usuarios.rol` y `restaurante_id` (el admin solo gestiona
su restaurante). Los ids originales se conservan para no romper imagenes ni codigos QR (`/index.php?id=N` redirige a `/restaurantes/N`).

Diferencia deliberada: el login ya no ignora acentos (era un efecto de la collation de MySQL); sigue ignorando mayusculas (`citext`).
Los usuarios no estan en la migracion de datos: `scripts/seed-usuarios.js` los crea con hash (en prod, con claves del `.env.prod`).
