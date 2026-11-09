'use strict';
// RF-06 Panel de administracion (API) | ASVS v5 V8 (control de acceso, IDOR), V5 (archivos), V3.5 (CSRF), V2 (validacion)
// ISO 27001 A.5.15 / A.8.3 (control de acceso a la informacion)
// Las escrituras van en multipart (igual que el FormData del frontend) con el token en X-CSRF-Token.

const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { crearEntorno, iniciarSesion, limpiarIntentos, UPLOAD_DIR } = require('../ayuda');

let env;
beforeAll(() => { env = crearEntorno(); });
afterAll(async () => {
  await env.pool.query("DELETE FROM items WHERE nombre LIKE 'QA %'");
  await env.pool.query("DELETE FROM categorias WHERE nombre LIKE 'QA %'");
  await env.pool.query("DELETE FROM cartas WHERE nombre LIKE 'QA %'");
  await limpiarIntentos(env.pool);
  await env.pool.end();
});
beforeEach(async () => { await limpiarIntentos(env.pool); });

const adminUno = () => iniciarSesion(env.app, 'admin@gmail.com', 'admin01');
const adminDos = () => iniciarSesion(env.app, 'admin.bahia@gmail.com', 'bahia01');

// PNG minimo valido (1x1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// Envia un formulario multipart. campos: { nombre: valor }; foto opcional: { buffer, filename, contentType }.
function enviar(sesion, metodo, ruta, campos = {}, foto = null) {
  let r = sesion.agente[metodo](`/api/admin${ruta}`).set('X-CSRF-Token', sesion.csrf);
  for (const [k, v] of Object.entries(campos)) r = r.field(k, String(v));
  if (foto) r = r.attach('foto', foto.buffer, { filename: foto.filename, contentType: foto.contentType });
  return r;
}
const crear = (s, recurso, campos, foto) => enviar(s, 'post', `/${recurso}`, campos, foto);
const actualizar = (s, recurso, id, campos, foto) => enviar(s, 'put', `/${recurso}/${id}`, campos, foto);
const eliminar = (s, recurso, id) => s.agente.delete(`/api/admin/${recurso}/${id}`).set('X-CSRF-Token', s.csrf);

const cartaPublica = async (rid = 1) => (await request(env.app).get(`/api/restaurantes/${rid}`)).body;
const nombresPublicos = (b) => [
  ...b.cartas.map((c) => c.nombre),
  ...b.cartas.flatMap((c) => c.categorias.flatMap((k) => k.items.map((i) => i.nombre))),
];

describe('Control de acceso al panel', () => {
  test.each([['/api/admin'], ['/api/admin/cartas'], ['/api/admin/categorias'], ['/api/admin/productos'], ['/api/admin/cartas/nuevo']])(
    'sin sesion %s responde 401', async (ruta) => {
      const r = await request(env.app).get(ruta);
      expect(r.status).toBe(401);
      expect(r.body.codigo).toBe('sin_sesion');
    }
  );

  test('un usuario con rol cliente no entra al panel (403)', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    expect((await agente.get('/api/admin')).status).toBe(403);
    expect((await agente.get('/api/admin/productos')).status).toBe(403);
  });

  test('el administrador ve el resumen de SU restaurante', async () => {
    const { agente } = await adminUno();
    const r = await agente.get('/api/admin');
    expect(r.status).toBe(200);
    expect(r.body.restaurante).toEqual({ id: 1, nombre: 'Afríca Restobar' });
    expect(r.body.usuario.rol).toBe('admin');
    expect(r.body.totales.cartas).toBeGreaterThan(0);
  });

  test('/api/sesion informa el rol (el frontend muestra el enlace al panel solo a administradores)', async () => {
    const { agente } = await adminUno();
    expect((await agente.get('/api/sesion')).body.usuario.rol).toBe('admin');
    expect((await request(env.app).get('/api/sesion')).body.usuario).toBeNull();
  });

  test('un recurso desconocido responde 404', async () => {
    const { agente } = await adminUno();
    expect((await agente.get('/api/admin/usuarios')).status).toBe(404);
    expect((await agente.get('/api/admin/__proto__')).status).toBe(404);
    expect((await agente.get('/api/admin/constructor')).status).toBe(404);
  });
});

describe('RF-06 CRUD de cartas, categorias y productos', () => {
  test('crear, editar y eliminar una carta se refleja en la carta publica', async () => {
    const s = await adminUno();
    const alta = await crear(s, 'cartas', { nombre: 'QA Carta Verano', orden: 20, visible: 'on' });
    expect(alta.status).toBe(201);
    expect(alta.body).toMatchObject({ ok: true, mensaje: 'Registro creado.' });
    const id = alta.body.id;
    expect(nombresPublicos(await cartaPublica())).toContain('QA Carta Verano');

    const mod = await actualizar(s, 'cartas', id, { nombre: 'QA Carta Invierno', orden: 20 });
    expect(mod.status).toBe(200);
    // Sin la casilla "visible" marcada la carta queda oculta.
    expect(nombresPublicos(await cartaPublica())).not.toContain('QA Carta Invierno');

    const baja = await eliminar(s, 'cartas', id);
    expect(baja.status).toBe(200);
    const fila = await env.pool.query('SELECT eliminado_en FROM cartas WHERE id = $1', [id]);
    expect(fila.rows[0].eliminado_en).not.toBeNull(); // borrado logico
  });

  test('crear una categoria y un producto con foto (flujo completo) y verlos en la carta', async () => {
    const s = await adminUno();
    const cartaId = (await crear(s, 'cartas', { nombre: 'QA Carta Flujo', visible: 'on' })).body.id;
    const cat = await crear(s, 'categorias', { nombre: 'QA Categoria Flujo', carta_id: cartaId, visible: 'on' });
    expect(cat.status).toBe(201);

    const prod = await crear(s, 'productos', {
      nombre: 'QA Producto Flujo', precio: 4500, categoria_id: cat.body.id, visible: 'on',
      descripcion: 'Descripcion de prueba', puntuacion: 4,
    }, { buffer: PNG, filename: 'foto.png', contentType: 'image/png' });
    expect(prod.status).toBe(201);
    const fila = (await env.pool.query('SELECT foto, precio FROM items WHERE id = $1', [prod.body.id])).rows[0];
    expect(fila.precio).toBe(4500);
    expect(fila.foto).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, 'cod1', fila.foto))).toBe(true);

    const publica = await cartaPublica();
    const item = publica.cartas.flatMap((c) => c.categorias.flatMap((k) => k.items)).find((i) => i.id === prod.body.id);
    expect(item).toMatchObject({ nombre: 'QA Producto Flujo', precio: 4500, foto: `/uploads/cod1/${fila.foto}` });
    // la imagen subida la sirve el backend como imagen (en AWS: EFS compartido por todas las instancias)
    const img = await request(env.app).get(item.foto);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toMatch(/image\/png/);
  });

  test('el formulario de alta entrega sus campos con opciones SOLO del restaurante propio', async () => {
    const { agente } = await adminUno();
    const r = await agente.get('/api/admin/categorias/nuevo');
    expect(r.status).toBe(200);
    const select = r.body.campos.find((c) => c.nombre === 'carta_id');
    expect(select.opciones.map((o) => o.texto)).toContain('Entradas');
    expect(select.opciones.map((o) => o.valor)).not.toContain(10); // carta 10 es del restaurante 2
  });

  test('editar un producto sin subir foto conserva la foto actual', async () => {
    const s = await adminUno();
    const antes = (await env.pool.query('SELECT foto, categoria_id FROM items WHERE id = 5')).rows[0];
    const r = await actualizar(s, 'productos', 5, {
      nombre: 'Lomo a lo Pobre', precio: 12500, categoria_id: antes.categoria_id, visible: 'on', destacado: 'on', puntuacion: 5,
    });
    expect(r.status).toBe(200);
    expect((await env.pool.query('SELECT foto FROM items WHERE id = 5')).rows[0].foto).toBe(antes.foto);
  });

  test('las listas muestran solo registros del restaurante del administrador', async () => {
    const { agente } = await adminUno();
    const r = await agente.get('/api/admin/cartas');
    const nombres = r.body.filas.map((f) => f.nombre);
    expect(nombres).toContain('Entradas');
    expect(nombres).not.toContain('Comiditas'); // carta 12 del restaurante 2
  });
});

describe('ASVS V8.2 IDOR: un administrador no toca datos de otro restaurante', () => {
  test.each([
    ['carta', '/api/admin/cartas/10'],
    ['categoria', '/api/admin/categorias/12'],
  ])('leer %s de otro restaurante -> 404', async (_n, ruta) => {
    const { agente } = await adminUno();
    expect((await agente.get(ruta)).status).toBe(404);
  });

  test('modificar o eliminar una carta ajena no cambia nada', async () => {
    const s = await adminUno();
    const antes = (await env.pool.query('SELECT nombre, eliminado_en FROM cartas WHERE id = 10')).rows[0];
    expect((await actualizar(s, 'cartas', 10, { nombre: 'HACKEADA', visible: 'on' })).status).toBe(404);
    expect((await eliminar(s, 'cartas', 10)).status).toBe(404);
    expect((await env.pool.query('SELECT nombre, eliminado_en FROM cartas WHERE id = 10')).rows[0]).toEqual(antes);
  });

  test('no se puede crear una categoria dentro de una carta de otro restaurante', async () => {
    const s = await adminUno();
    const r = await crear(s, 'categorias', { nombre: 'QA Intrusa', carta_id: 10, visible: 'on' });
    expect(r.status).toBe(400);
    expect((await env.pool.query("SELECT 1 FROM categorias WHERE nombre = 'QA Intrusa'")).rowCount).toBe(0);
  });

  test('no se puede mover un producto propio a una categoria ajena', async () => {
    const s = await adminUno();
    const r = await actualizar(s, 'productos', 5, { nombre: 'Lomo a lo Pobre', precio: 12500, categoria_id: 12, visible: 'on' });
    expect(r.status).toBe(400);
    expect((await env.pool.query('SELECT categoria_id FROM items WHERE id = 5')).rows[0].categoria_id).toBe(3);
  });

  test('un producto creado por el administrador 2 es invisible e intocable para el administrador 1', async () => {
    const dos = await adminDos();
    const alta = await crear(dos, 'productos', { nombre: 'QA Plato Bahia', precio: 3000, categoria_id: 12, visible: 'on' });
    expect(alta.status).toBe(201);
    const itemId = alta.body.id;

    const uno = await adminUno();
    expect((await uno.agente.get(`/api/admin/productos/${itemId}`)).status).toBe(404);
    expect((await actualizar(uno, 'productos', itemId, { nombre: 'ROBADO', precio: 1, categoria_id: 3 })).status).toBe(404);
    expect((await eliminar(uno, 'productos', itemId)).status).toBe(404);
    expect((await env.pool.query('SELECT nombre, eliminado_en FROM items WHERE id = $1', [itemId])).rows[0])
      .toEqual({ nombre: 'QA Plato Bahia', eliminado_en: null });
    expect((await uno.agente.get('/api/admin/productos')).body.filas.map((f) => f.nombre)).not.toContain('QA Plato Bahia');
  });

  test('el restaurante nunca se toma del cliente: un campo restaurante_id enviado se ignora', async () => {
    const s = await adminUno();
    const r = await crear(s, 'cartas', { nombre: 'QA Carta Propia', restaurante_id: 2, visible: 'on' });
    expect((await env.pool.query('SELECT restaurante_id FROM cartas WHERE id = $1', [r.body.id])).rows[0].restaurante_id).toBe(1);
  });
});

describe('ASVS V3.5 CSRF y V2 validacion en el panel', () => {
  test('crear sin token CSRF -> 403 y no se crea nada', async () => {
    const { agente } = await adminUno();
    const r = await agente.post('/api/admin/cartas').field('nombre', 'QA Sin Token');
    expect(r.status).toBe(403);
    expect((await env.pool.query("SELECT 1 FROM cartas WHERE nombre = 'QA Sin Token'")).rowCount).toBe(0);
  });

  test('eliminar sin token CSRF -> 403', async () => {
    const { agente } = await adminUno();
    expect((await agente.delete('/api/admin/cartas/1')).status).toBe(403);
    expect((await env.pool.query('SELECT eliminado_en FROM cartas WHERE id = 1')).rows[0].eliminado_en).toBeNull();
  });

  test('una foto enviada sin token CSRF no se escribe en disco', async () => {
    const { agente } = await adminUno();
    const antes = fs.existsSync(path.join(UPLOAD_DIR, 'cod1')) ? fs.readdirSync(path.join(UPLOAD_DIR, 'cod1')).length : 0;
    const r = await agente.post('/api/admin/productos').field('nombre', 'QA Sin Token').field('precio', '1')
      .field('categoria_id', '3').attach('foto', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(r.status).toBe(403);
    const despues = fs.existsSync(path.join(UPLOAD_DIR, 'cod1')) ? fs.readdirSync(path.join(UPLOAD_DIR, 'cod1')).length : 0;
    expect(despues).toBe(antes);
  });

  test.each([
    ['nombre vacio', { nombre: '' }],
    ['nombre demasiado largo', { nombre: 'x'.repeat(46) }],
    ['orden negativo', { nombre: 'QA Orden', orden: -1 }],
    ['orden no numerico', { nombre: 'QA Orden', orden: 'abc' }],
  ])('carta con %s -> 400 con el error junto al campo', async (_n, datos) => {
    const s = await adminUno();
    const r = await crear(s, 'cartas', datos);
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe('validacion');
    expect(Object.keys(r.body.errores).length).toBeGreaterThan(0);
  });

  test('los errores de validacion no devuelven lo que escribio el usuario (no hay reflejo para XSS)', async () => {
    const s = await adminUno();
    const r = await crear(s, 'productos', { nombre: '"><script>alert(1)</script>', precio: 'no-es-numero', categoria_id: 3 });
    expect(r.status).toBe(400);
    expect(r.body.errores.precio).toBeDefined();
    expect(r.text).not.toContain('<script>');
  });

  test.each([
    ['precio negativo', { precio: '-5' }],
    ['precio con decimales', { precio: '10.5' }],
    ['puntuacion 6', { precio: '100', puntuacion: '6' }],
  ])('producto con %s -> 400', async (_n, datos) => {
    const s = await adminUno();
    const r = await crear(s, 'productos', { nombre: 'QA Invalido', categoria_id: 3, puntuacion: 0, ...datos });
    expect(r.status).toBe(400);
    expect((await env.pool.query("SELECT 1 FROM items WHERE nombre = 'QA Invalido'")).rowCount).toBe(0);
  });
});

describe('ASVS V5 Subida de archivos', () => {
  const subir = (s, buffer, filename, contentType) =>
    crear(s, 'productos', { nombre: 'QA Subida', precio: 100, categoria_id: 3 }, { buffer, filename, contentType });
  const sinCreados = async () => expect((await env.pool.query("SELECT 1 FROM items WHERE nombre = 'QA Subida'")).rowCount).toBe(0);

  test('un script PHP disfrazado de imagen (.png con Content-Type image/png) se rechaza', async () => {
    const s = await adminUno();
    const r = await subir(s, Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.png', 'image/png');
    expect(r.status).toBe(400);
    expect(r.body.errores.foto).toContain('imagen JPG, PNG, GIF o WEBP');
    await sinCreados();
  });

  test('un HTML con extension .jpg se rechaza (el tipo se decide por el contenido, no por el nombre)', async () => {
    const s = await adminUno();
    expect((await subir(s, Buffer.from('<html><script>alert(1)</script></html>'), 'x.jpg', 'image/jpeg')).status).toBe(400);
    await sinCreados();
  });

  test('un SVG (puede contener scripts) se rechaza', async () => {
    const s = await adminUno();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect((await subir(s, svg, 'x.svg', 'image/svg+xml')).status).toBe(400);
    await sinCreados();
  });

  test('un archivo mayor al maximo (2 MB) se rechaza', async () => {
    const s = await adminUno();
    const r = await subir(s, Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]), 'grande.png', 'image/png');
    expect(r.status).toBe(400);
    expect(r.body.errores.foto).toContain('supera el maximo');
    await sinCreados();
  });

  test('el nombre original no se usa: un nombre con ../ no escapa del directorio y se guarda con nombre aleatorio', async () => {
    const s = await adminUno();
    const r = await subir(s, PNG, '../../../etc/pasaporte.png', 'image/png');
    expect(r.status).toBe(201);
    const fila = (await env.pool.query('SELECT foto FROM items WHERE id = $1', [r.body.id])).rows[0];
    expect(fila.foto).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, 'cod1', fila.foto))).toBe(true);
    await env.pool.query("DELETE FROM items WHERE nombre = 'QA Subida'");
  });

  test('las fotos subidas solo se sirven con nombre generado: rutas con ../ no salen del directorio', async () => {
    const r = await request(env.app).get('/uploads/cod1/..%2F..%2F..%2Fetc%2Fpasswd');
    expect(r.status).toBe(404);
  });
});
