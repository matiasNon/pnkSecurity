'use strict';
// RF-06 Panel de administracion | ASVS v5 V8 (control de acceso, IDOR), V5 (archivos), V3.5 (CSRF), V2 (validacion)
// ISO 27001 A.5.15 / A.8.3 (control de acceso a la informacion)

const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { crearEntorno, tokenDe, iniciarSesion, limpiarIntentos, UPLOAD_DIR } = require('../ayuda');

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

const adminUno = () => iniciarSesion(env.app, 'admin@gmail.com', 'admin01', 1);
const adminDos = () => iniciarSesion(env.app, 'admin.bahia@gmail.com', 'bahia01', 2);

// PNG minimo valido (1x1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('Control de acceso al panel', () => {
  test.each([['/admin'], ['/admin/cartas'], ['/admin/categorias'], ['/admin/productos'], ['/admin/cartas/nuevo']])(
    'sin sesion %s responde 403', async (ruta) => {
      const r = await request(env.app).get(ruta);
      expect(r.status).toBe(403);
    }
  );

  test('un usuario con rol cliente no entra al panel (403)', async () => {
    const { agente } = await iniciarSesion(env.app, 'alondra@gmail.com', 'alondra01');
    expect((await agente.get('/admin')).status).toBe(403);
    expect((await agente.get('/admin/productos')).status).toBe(403);
  });

  test('el administrador ve su panel con los totales de su restaurante', async () => {
    const { agente } = await adminUno();
    const r = await agente.get('/admin');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Panel de administración');
    expect(r.text).toContain('Afríca Restobar');
  });

  test('la carta muestra el enlace al panel solo si el usuario es administrador', async () => {
    const { agente } = await adminUno();
    expect((await agente.get('/restaurantes/1')).text).toContain('href="/admin"');
    expect((await request(env.app).get('/restaurantes/1')).text).not.toContain('href="/admin"');
  });

  test('un recurso desconocido responde 404', async () => {
    const { agente } = await adminUno();
    expect((await agente.get('/admin/usuarios')).status).toBe(404);
    expect((await agente.get('/admin/__proto__')).status).toBe(404);
  });
});

describe('RF-06 CRUD de cartas, categorias y productos', () => {
  test('crear, editar y eliminar una carta se refleja en la carta publica', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const crear = await agente.post('/admin/cartas').type('form').send({ csrf, nombre: 'QA Carta Verano', orden: 20, visible: 'on' });
    expect(crear.status).toBe(303);
    expect(crear.headers.location).toBe('/admin/cartas?m=creado');
    const id = (await env.pool.query("SELECT id FROM cartas WHERE nombre = 'QA Carta Verano'")).rows[0].id;
    expect((await request(env.app).get('/restaurantes/1')).text).toContain('QA Carta Verano');

    const editar = await agente.post(`/admin/cartas/${id}`).type('form').send({ csrf, nombre: 'QA Carta Invierno', orden: 20 });
    expect(editar.headers.location).toBe('/admin/cartas?m=actualizado');
    // Sin la casilla "visible" marcada la carta queda oculta.
    expect((await request(env.app).get('/restaurantes/1')).text).not.toContain('QA Carta Invierno');

    const borrar = await agente.post(`/admin/cartas/${id}/eliminar`).type('form').send({ csrf });
    expect(borrar.headers.location).toBe('/admin/cartas?m=eliminado');
    const fila = await env.pool.query('SELECT eliminado_en FROM cartas WHERE id = $1', [id]);
    expect(fila.rows[0].eliminado_en).not.toBeNull(); // borrado logico
  });

  test('crear una categoria y un producto con foto (flujo completo) y verlos en la carta', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    await agente.post('/admin/cartas').type('form').send({ csrf, nombre: 'QA Carta Flujo', visible: 'on' });
    const cartaId = (await env.pool.query("SELECT id FROM cartas WHERE nombre = 'QA Carta Flujo'")).rows[0].id;
    const cat = await agente.post('/admin/categorias').type('form').send({ csrf, nombre: 'QA Categoria Flujo', carta_id: cartaId, visible: 'on' });
    expect(cat.headers.location).toBe('/admin/categorias?m=creado');
    const catId = (await env.pool.query("SELECT id FROM categorias WHERE nombre = 'QA Categoria Flujo'")).rows[0].id;

    const prod = await agente.post('/admin/productos')
      .field('csrf', csrf).field('nombre', 'QA Producto Flujo').field('precio', '4500').field('categoria_id', String(catId))
      .field('visible', 'on').field('descripcion', 'Descripcion de prueba').field('puntuacion', '4')
      .attach('foto', PNG, { filename: 'foto.png', contentType: 'image/png' });
    expect(prod.status).toBe(303);
    const fila = (await env.pool.query("SELECT id, foto, precio FROM items WHERE nombre = 'QA Producto Flujo'")).rows[0];
    expect(fila.precio).toBe(4500);
    expect(fila.foto).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, 'cod1', fila.foto))).toBe(true);

    const publica = await request(env.app).get('/restaurantes/1');
    expect(publica.text).toContain('QA Producto Flujo');
    expect(publica.text).toContain('$ 4.500');
    expect(publica.text).toContain(`/imagenes/cod1/${fila.foto}`);
    // la imagen subida se sirve como imagen
    const img = await request(env.app).get(`/imagenes/cod1/${fila.foto}`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toMatch(/image\/png/);
  });

  test('editar un producto sin subir foto conserva la foto actual', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const antes = (await env.pool.query('SELECT foto, categoria_id FROM items WHERE id = 5')).rows[0];
    const r = await agente.post('/admin/productos/5').field('csrf', csrf).field('nombre', 'Lomo a lo Pobre')
      .field('precio', '12500').field('categoria_id', String(antes.categoria_id)).field('visible', 'on').field('destacado', 'on').field('puntuacion', '5');
    expect(r.headers.location).toBe('/admin/productos?m=actualizado');
    const despues = (await env.pool.query('SELECT foto FROM items WHERE id = 5')).rows[0];
    expect(despues.foto).toBe(antes.foto);
  });

  test('las listas muestran solo registros del restaurante del administrador', async () => {
    const { agente } = await adminUno();
    const cartas = await agente.get('/admin/cartas');
    expect(cartas.text).toContain('Entradas');
    expect(cartas.text).not.toContain('Comiditas'); // carta 12 del restaurante 2
  });
});

describe('ASVS V8.2 IDOR: un administrador no toca datos de otro restaurante', () => {
  test.each([
    ['carta', '/admin/cartas/10/editar'],
    ['categoria', '/admin/categorias/12/editar'],
  ])('editar %s de otro restaurante -> 404', async (_n, ruta) => {
    const { agente } = await adminUno();
    expect((await agente.get(ruta)).status).toBe(404);
  });

  test('modificar o eliminar una carta ajena no cambia nada', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const antes = (await env.pool.query('SELECT nombre, eliminado_en FROM cartas WHERE id = 10')).rows[0];
    const mod = await agente.post('/admin/cartas/10').type('form').send({ csrf, nombre: 'HACKEADA', visible: 'on' });
    expect(mod.status).toBe(404);
    const del = await agente.post('/admin/cartas/10/eliminar').type('form').send({ csrf });
    expect(del.status).toBe(404);
    const despues = (await env.pool.query('SELECT nombre, eliminado_en FROM cartas WHERE id = 10')).rows[0];
    expect(despues).toEqual(antes);
  });

  test('no se puede crear una categoria dentro de una carta de otro restaurante', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await agente.post('/admin/categorias').type('form').send({ csrf, nombre: 'QA Intrusa', carta_id: 10, visible: 'on' });
    expect(r.status).toBe(400);
    expect((await env.pool.query("SELECT 1 FROM categorias WHERE nombre = 'QA Intrusa'")).rowCount).toBe(0);
  });

  test('no se puede mover un producto propio a una categoria ajena', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await agente.post('/admin/productos/5').field('csrf', csrf).field('nombre', 'Lomo a lo Pobre')
      .field('precio', '12500').field('categoria_id', '12').field('visible', 'on');
    expect(r.status).toBe(400);
    expect((await env.pool.query('SELECT categoria_id FROM items WHERE id = 5')).rows[0].categoria_id).toBe(3);
  });

  test('un producto creado por el administrador 2 es invisible e intocable para el administrador 1', async () => {
    const dos = await adminDos();
    const csrfDos = await tokenDe(dos.agente, '/admin');
    const crear = await dos.agente.post('/admin/productos').field('csrf', csrfDos).field('nombre', 'QA Plato Bahia')
      .field('precio', '3000').field('categoria_id', '12').field('visible', 'on');
    expect(crear.status).toBe(303);
    const itemId = (await env.pool.query("SELECT id FROM items WHERE nombre = 'QA Plato Bahia'")).rows[0].id;

    const uno = await adminUno();
    const csrfUno = await tokenDe(uno.agente, '/admin');
    expect((await uno.agente.get(`/admin/productos/${itemId}/editar`)).status).toBe(404);
    expect((await uno.agente.post(`/admin/productos/${itemId}`).field('csrf', csrfUno).field('nombre', 'ROBADO')
      .field('precio', '1').field('categoria_id', '3')).status).toBe(404);
    expect((await uno.agente.post(`/admin/productos/${itemId}/eliminar`).type('form').send({ csrf: csrfUno })).status).toBe(404);
    expect((await env.pool.query('SELECT nombre, eliminado_en FROM items WHERE id = $1', [itemId])).rows[0])
      .toEqual({ nombre: 'QA Plato Bahia', eliminado_en: null });
    expect((await uno.agente.get('/admin/productos')).text).not.toContain('QA Plato Bahia');
  });

  test('el restaurante nunca se toma del cliente: un campo restaurante_id enviado se ignora', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    await agente.post('/admin/cartas').type('form').send({ csrf, nombre: 'QA Carta Propia', restaurante_id: 2, visible: 'on' });
    const fila = (await env.pool.query("SELECT restaurante_id FROM cartas WHERE nombre = 'QA Carta Propia'")).rows[0];
    expect(fila.restaurante_id).toBe(1);
  });
});

describe('ASVS V3.5 CSRF y V2 validacion en el panel', () => {
  test('crear sin token CSRF -> 403 y no se crea nada', async () => {
    const { agente } = await adminUno();
    const r = await agente.post('/admin/cartas').type('form').send({ nombre: 'QA Sin Token' });
    expect(r.status).toBe(403);
    expect((await env.pool.query("SELECT 1 FROM cartas WHERE nombre = 'QA Sin Token'")).rowCount).toBe(0);
  });

  test('eliminar sin token CSRF -> 403', async () => {
    const { agente } = await adminUno();
    expect((await agente.post('/admin/cartas/1/eliminar').type('form').send({})).status).toBe(403);
    expect((await env.pool.query('SELECT eliminado_en FROM cartas WHERE id = 1')).rows[0].eliminado_en).toBeNull();
  });

  test.each([
    ['nombre vacio', { nombre: '' }],
    ['nombre demasiado largo', { nombre: 'x'.repeat(46) }],
    ['orden negativo', { nombre: 'QA Orden', orden: -1 }],
    ['orden no numerico', { nombre: 'QA Orden', orden: 'abc' }],
  ])('carta con %s -> 400', async (_n, datos) => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await agente.post('/admin/cartas').type('form').send({ csrf, ...datos });
    expect(r.status).toBe(400);
  });

  test('el formulario devuelto con errores escapa lo que escribio el usuario', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await agente.post('/admin/productos').field('csrf', csrf).field('nombre', '"><script>alert(1)</script>')
      .field('precio', 'no-es-numero').field('categoria_id', '3');
    expect(r.status).toBe(400);
    expect(r.text).not.toContain('<script>alert(1)</script>');
    expect(r.text).toContain('&lt;script&gt;');
  });

  test.each([
    ['precio negativo', { precio: '-5' }],
    ['precio con decimales', { precio: '10.5' }],
    ['puntuacion 6', { precio: '100', puntuacion: '6' }],
  ])('producto con %s -> 400', async (_n, datos) => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await agente.post('/admin/productos').field('csrf', csrf).field('nombre', 'QA Invalido').field('categoria_id', '3')
      .field('precio', datos.precio).field('puntuacion', datos.puntuacion || '0');
    expect(r.status).toBe(400);
    expect((await env.pool.query("SELECT 1 FROM items WHERE nombre = 'QA Invalido'")).rowCount).toBe(0);
  });
});

describe('ASVS V5 Subida de archivos', () => {
  async function subir(agente, csrf, buffer, filename, contentType) {
    return agente.post('/admin/productos').field('csrf', csrf).field('nombre', 'QA Subida').field('precio', '100')
      .field('categoria_id', '3').attach('foto', buffer, { filename, contentType });
  }
  const sinCreados = async () => expect((await env.pool.query("SELECT 1 FROM items WHERE nombre = 'QA Subida'")).rowCount).toBe(0);

  test('un script PHP disfrazado de imagen (.png con Content-Type image/png) se rechaza', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await subir(agente, csrf, Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.png', 'image/png');
    expect(r.status).toBe(400);
    expect(r.text).toContain('imagen JPG, PNG, GIF o WEBP');
    await sinCreados();
  });

  test('un HTML con extension .jpg se rechaza (el tipo se decide por el contenido, no por el nombre)', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await subir(agente, csrf, Buffer.from('<html><script>alert(1)</script></html>'), 'x.jpg', 'image/jpeg');
    expect(r.status).toBe(400);
    await sinCreados();
  });

  test('un SVG (puede contener scripts) se rechaza', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const r = await subir(agente, csrf, svg, 'x.svg', 'image/svg+xml');
    expect(r.status).toBe(400);
    await sinCreados();
  });

  test('un archivo mayor al maximo (2 MB) se rechaza', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const grande = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const r = await subir(agente, csrf, grande, 'grande.png', 'image/png');
    expect(r.status).toBe(400);
    expect(r.text).toContain('supera el maximo');
    await sinCreados();
  });

  test('el nombre original no se usa: un nombre con ../ no escapa del directorio y se guarda con nombre aleatorio', async () => {
    const { agente } = await adminUno();
    const csrf = await tokenDe(agente, '/admin');
    const r = await subir(agente, csrf, PNG, '../../../etc/pasaporte.png', 'image/png');
    expect(r.status).toBe(303);
    const fila = (await env.pool.query("SELECT foto FROM items WHERE nombre = 'QA Subida'")).rows[0];
    expect(fila.foto).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, 'cod1', fila.foto))).toBe(true);
    await env.pool.query("DELETE FROM items WHERE nombre = 'QA Subida'");
  });
});
