-- 003_seguridad.sql
-- Tablas de soporte de seguridad: sesiones (connect-pg-simple) y contadores de intentos
-- (reemplaza el archivo JSON temporal de la version PHP; sirve con varias instancias).

CREATE TABLE sesiones (
  sid    varchar      NOT NULL PRIMARY KEY,
  sess   json         NOT NULL,
  expire timestamptz  NOT NULL
);
CREATE INDEX idx_sesiones_expire ON sesiones(expire);

-- Una fila por intento. 'clave' es un hash (sha256) de la cuenta, el par cuenta+IP, la IP o el usuario
-- que comenta; asi la tabla no guarda correos ni IP en claro. 'tipo' separa login de comentarios.
CREATE TABLE intentos (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo   varchar(12)  NOT NULL CHECK (tipo IN ('login', 'comentario')),
  clave  varchar(80)  NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intentos_clave ON intentos(tipo, clave, creado_en DESC);
CREATE INDEX idx_intentos_creado ON intentos(creado_en);
