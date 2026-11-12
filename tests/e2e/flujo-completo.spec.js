'use strict';
// Flujo funcional de punta a punta en un navegador real (generado con IA a partir de los requisitos RF-01..RF-06).
// Cada paso deja una captura en docs/evidencias/qa/ que se usa como evidencia en el informe.

const path = require('node:path');
const { test, expect } = require('@playwright/test');

const EVIDENCIA = process.env.EVIDENCIA_DIR || path.join(__dirname, '..', '..', 'docs', 'evidencias', 'qa');
const captura = (page, nombre, opciones = {}) =>
  page.screenshot({ path: path.join(EVIDENCIA, `${nombre}.png`), fullPage: true, ...opciones });

const sufijo = Date.now().toString(36);

test.describe.configure({ mode: 'serial' });

test.describe('Carta digital: flujo de un cliente y del administrador', () => {
  test('RF-01 la carta del restaurante 1 se muestra completa', async ({ page }) => {
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    // COOP se ignora en origenes HTTP que no son localhost (QA por HTTP interno): no es un fallo de la aplicacion.
    page.on('console', (m) => { if (m.type() === 'error' && !/Cross-Origin-Opener-Policy/.test(m.text())) errores.push(m.text()); });

    await page.goto('/restaurantes/1');
    await expect(page.getByRole('heading', { name: 'Afríca Restobar' })).toBeVisible();
    await expect(page.locator('.cm-slide.activa').getByText('Menús Destacados')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Seleccionar' }).first()).toBeVisible();
    await expect(page.locator('.cm-slide.activa')).toBeVisible(); // el hero de destacados se armo (JS + CSP sin inline)
    await expect(page.locator('.cm-mini')).toHaveCount(3);
    // Formato de moneda chilena en el precio del destacado visible y en la carta abierta (Bebidas: Pisco Sour).
    await expect(page.locator('.cm-slide.activa .price-tag')).toHaveText('$ 2.000');
    await expect(page.getByText('$ 3.500').filter({ visible: true }).first()).toBeVisible();
    await captura(page, '01-carta');
    expect(errores, 'sin errores de consola ni violaciones de CSP').toEqual([]);
  });

  test('RF-04 un login incorrecto muestra un mensaje generico', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('alondra@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('clave-equivocada');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Usuario o contraseña incorrectos.' })).toBeVisible();
    await captura(page, '02-login-error', { fullPage: false });
  });

  test('RF-03 agregar productos al carrito y revisarlos', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.locator('a.button[id="5"]').first().click();
    await expect(page.locator('#myModal')).toBeVisible();
    await expect(page.getByText('ha sido agregado sin problemas')).toBeVisible();
    await captura(page, '03-producto-agregado', { fullPage: false });
    await page.locator('#myModal .close').click();
    await expect(page.locator('#myModal')).toBeHidden();
    await page.getByRole('link', { name: /Productos Seleccionados/ }).click();
    await expect(page).toHaveURL(/\/restaurantes\/1\/carrito$/);
    await expect(page.getByRole('cell', { name: 'Lomo a lo Pobre', exact: true })).toBeVisible();
    await expect(page.locator('tbody').getByRole('cell', { name: '$ 12.500', exact: true })).toBeVisible();
    await expect(page.locator('tfoot .fila-total')).toContainText('Total');
    await captura(page, '04-carrito');
  });

  test('RF-03 cambiar la cantidad con los botones - / + (UPDATE)', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.locator('a.button[id="5"]').first().click();
    await expect(page.locator('#myModal')).toBeVisible();
    await page.locator('#myModal .close').click();
    await page.goto('/restaurantes/1/carrito');
    const fila = page.locator('tbody tr', { hasText: 'Lomo a lo Pobre' });
    await expect(fila.locator('.car-num')).toHaveText('1');
    await expect(fila.locator('.car-paso.menos')).toBeDisabled();
    await fila.getByRole('button', { name: /Agregar uno más/ }).click();
    await fila.getByRole('button', { name: /Agregar uno más/ }).click();
    await expect(fila.locator('.car-num')).toHaveText('3');
    await expect(fila.locator('.car-precio')).toContainText('$ 37.500');
    await expect(fila.locator('.car-precio')).toContainText('$ 12.500 c/u');
    await expect(page.locator('.car-cantidad')).toHaveText('3 productos');
    await captura(page, '04b-carrito-cantidad');
    await fila.getByRole('button', { name: /Quitar uno/ }).click();
    await expect(fila.locator('.car-num')).toHaveText('2');
    await expect(page.locator('tfoot .fila-total')).toContainText('$ 25.000');
    await page.getByRole('link', { name: 'Eliminar Todo' }).click();
  });

  test('RF-03 eliminar un producto y vaciar el carrito', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.locator('a.button[id="2"]').first().click();
    await expect(page.locator('#myModal')).toBeVisible();
    await page.locator('#myModal .close').click();
    await expect(page.locator('#myModal')).toBeHidden();
    await page.goto('/restaurantes/1/carrito');
    // Solo filas de productos (con boton eliminar); el carrito vacio muestra una fila de aviso.
    const filas = page.locator('tbody tr:has(a.elim)');
    const antes = await filas.count();
    await page.locator('a.elim').first().click();
    await expect(filas).toHaveCount(antes - 1);
    await page.getByRole('link', { name: 'Eliminar Todo' }).click();
    await expect(filas).toHaveCount(0);
    await expect(page.getByText('Tu carrito está vacío')).toBeVisible();
    await expect(page.locator('tfoot .fila-total')).toContainText('$ 0');
  });

  test('RF-04 / RF-05 iniciar sesion y comentar (el HTML se muestra como texto)', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('alondra@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('alondra01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Bienvenido: Alondra')).toBeVisible();

    const texto = `Comentario e2e ${sufijo} <script>alert('xss')</script>`;
    await page.locator('#comentario').fill(texto);
    await page.getByRole('button', { name: 'Comentar' }).click();
    await expect(page.getByText('Comentario publicado.')).toBeVisible();
    await expect(page.locator('.card-body').filter({ hasText: `Comentario e2e ${sufijo}` })).toContainText("<script>alert('xss')</script>");
    await captura(page, '05-comentario-publicado');
  });

  test('RF-04 cerrar sesion', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('alondra@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('alondra01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });

  test('RF-06 el administrador crea un producto con foto y aparece en la carta', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('admin@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('admin01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.getByRole('link', { name: 'Administrar carta (CRUD)' }).click();
    await expect(page.getByRole('heading', { name: 'Panel de administración' })).toBeVisible();
    await captura(page, '06-panel-admin');

    await page.goto('/admin/productos');
    await captura(page, '07-admin-productos');
    await page.getByRole('link', { name: /Nuevo producto/ }).click();
    await page.locator('#f-categoria_id').selectOption({ label: 'Principales › Carnes' });
    await page.locator('#f-nombre').fill(`Plato e2e ${sufijo}`);
    await page.locator('#f-descripcion').fill('Plato creado por la prueba automatica');
    await page.locator('#f-precio').fill('7800');
    await page.locator('#f-puntuacion').fill('5');
    await page.locator('#f-visible').check();
    await page.locator('#f-foto').setInputFiles(path.join(__dirname, '..', '..', 'frontend', 'public', 'imagenes', 'cod1', 'item1.jpg'));
    await captura(page, '08-admin-formulario');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Registro creado.')).toBeVisible();
    await expect(page.getByRole('cell', { name: `Plato e2e ${sufijo}`, exact: true })).toBeVisible();

    await page.goto('/restaurantes/1');
    await page.getByRole('tab', { name: 'Principales' }).click(); // el producto esta en la carta "Principales"
    await expect(page.getByText(`Plato e2e ${sufijo}`).first()).toBeVisible();
    await expect(page.getByText('$ 7.800').first()).toBeVisible();
    await captura(page, '09-producto-en-carta');
  });

  test('RF-06 el administrador elimina el producto creado', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('admin@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('admin01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    // El login es por fetch: se espera a que la pagina muestre la sesion iniciada antes de navegar.
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await page.goto('/admin/productos');
    const fila = page.locator('tr', { hasText: `Plato e2e ${sufijo}` });
    // Eliminacion en dos pasos: el primer clic pide confirmacion en el mismo boton (sin ventanas emergentes).
    await fila.getByRole('button', { name: 'Eliminar' }).click();
    await expect(fila.getByRole('button', { name: /Confirmar eliminación/ })).toHaveText('¿Confirmar?');
    await fila.getByRole('button', { name: /Confirmar eliminación/ }).click();
    await expect(page.getByText('Registro eliminado.')).toBeVisible();
    await page.goto('/restaurantes/1');
    await expect(page.getByText(`Plato e2e ${sufijo}`)).toHaveCount(0);
  });

  test('ASVS V8 un cliente sin rol de administrador no accede al panel', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('alondra@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('alondra01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    // La pagina /admin es estatica (la entrega nginx); quien niega el acceso es la API del backend.
    const api = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin');
    await page.goto('/admin');
    expect((await api).status()).toBe(403);
    await expect(page.getByText('Acceso restringido')).toBeVisible();
    await expect(page.getByText('Cartas')).toHaveCount(0);
    await captura(page, '10-panel-denegado', { fullPage: false });
  });

  test('ASVS V2 una inyeccion SQL en la URL responde 404 sin detalles tecnicos', async ({ page }) => {
    const respuesta = await page.goto("/restaurantes/1%20OR%201=1");
    expect(respuesta.status()).toBe(404);
    await expect(page.locator('body')).not.toContainText(/syntax|postgres|SELECT/i);
    await captura(page, '11-sqli-404', { fullPage: false });
  });
});

test.describe('Consola del backend (/api/)', () => {
  test('estado en vivo y CRUD de categorias contra la API (crear, editar, eliminar)', async ({ page }) => {
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Cross-Origin-Opener-Policy/.test(m.text())) errores.push(m.text()); });
    await page.goto('/api/');
    await expect(page.getByRole('heading', { name: 'Consola del backend' })).toBeVisible();
    await expect(page.locator('#estado-global')).toHaveAttribute('data-estado', 'ok');

    // Un cliente no admin no entra al CRUD.
    await page.locator('#crud-email').fill('alondra@gmail.com');
    await page.locator('#crud-clave').fill('alondra01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.locator('#crud')).toContainText('no tiene rol de administrador');

    await page.locator('#crud-email').fill('admin@gmail.com');
    await page.locator('#crud-clave').fill('admin01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('tab', { name: 'Cartas' })).toHaveAttribute('aria-selected', 'true');

    const nombre = `Consola ${sufijo}`;
    await page.getByRole('tab', { name: 'Categorías' }).click();
    await page.getByRole('button', { name: /\+ Nueva categoría/ }).click();
    await page.locator('#crud-carta_id').selectOption({ index: 1 });
    await page.locator('#crud-nombre').fill(nombre);
    await page.getByRole('button', { name: 'Crear (POST)' }).click();
    await expect(page.locator('.crud-ok')).toHaveText('Registro creado.');
    const fila = page.locator('.crud-tabla tbody tr', { hasText: nombre });
    await expect(fila).toHaveCount(1);
    await expect(page.locator('#crud-log')).toContainText('POST/api/admin/categorias201');

    await fila.getByRole('button', { name: 'Editar' }).click();
    await page.locator('#crud-nombre').fill(`${nombre} editada`);
    await page.getByRole('button', { name: 'Guardar cambios (PUT)' }).click();
    await expect(page.locator('.crud-ok')).toHaveText('Cambios guardados.');
    const editada = page.locator('.crud-tabla tbody tr', { hasText: `${nombre} editada` });
    await expect(editada).toHaveCount(1);
    await captura(page, '11-consola-backend-crud');

    await editada.getByRole('button', { name: 'Eliminar' }).click();
    await editada.getByRole('button', { name: '¿Confirmar?' }).click();
    await expect(page.locator('.crud-ok')).toContainText('eliminado');
    await expect(page.locator('.crud-tabla tbody tr', { hasText: nombre })).toHaveCount(0);
    await expect(page.locator('#crud-log')).toContainText('DELETE/api/admin/categorias/');
    expect(errores).toEqual([]);
  });
});

test.describe('Privacidad (Ley 19.628 / 21.719)', () => {
  test('aviso de privacidad accesible desde el pie y panel "Mis datos" con sesion', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByRole('link', { name: 'Política de privacidad y tus datos' }).click();
    await expect(page).toHaveURL(/\/privacidad$/);
    await expect(page.getByRole('heading', { name: 'Política de privacidad y tus datos' })).toBeVisible();
    await expect(page.getByText('Amazon Web Services')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();

    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('alondra@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('alondra01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText('Tu comentario se publicará junto a tu nombre')).toBeVisible();
    await page.goto('/privacidad');
    await expect(page.locator('#panel-cuenta')).toContainText('Sesión iniciada como Alondra');
    await expect(page.getByRole('link', { name: 'Descargar mis datos (JSON)' })).toHaveAttribute('href', '/api/mi-cuenta/datos?descargar=1');
    const datos = await page.request.get('/api/mi-cuenta/datos');
    expect((await datos.json()).titular.email).toBe('alondra@gmail.com');
    await page.locator('#pv-nombre').fill('Alondra');
    await page.getByRole('button', { name: 'Guardar nombre' }).click();
    await expect(page.locator('.pv-aviso')).toHaveText('Nombre actualizado.');
    await captura(page, '12-privacidad-mis-datos');
  });
});
