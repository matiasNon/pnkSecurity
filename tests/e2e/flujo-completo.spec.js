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
    await expect(page.getByText('Menús Destacados')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Seleccionar' }).first()).toBeVisible();
    await expect(page.locator('.owl-carousel .owl-item').first()).toBeVisible(); // el carrusel se inicializo (JS + CSP sin inline)
    await expect(page.getByText('$ 12.500').first()).toBeVisible();
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
    await expect(page.getByRole('cell', { name: 'Lomo a lo Pobre' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '$ 12.500' })).toBeVisible();
    await captura(page, '04-carrito');
  });

  test('RF-03 eliminar un producto y vaciar el carrito', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.locator('a.button[id="2"]').first().click();
    await expect(page.locator('#myModal')).toBeVisible();
    await page.locator('#myModal .close').click();
    await expect(page.locator('#myModal')).toBeHidden();
    await page.goto('/restaurantes/1/carrito');
    const filas = page.locator('tbody tr');
    const antes = await filas.count();
    await page.locator('a.elim').first().click();
    await expect(filas).toHaveCount(antes - 1);
    await page.getByRole('link', { name: 'Eliminar Todo' }).click();
    await expect(filas).toHaveCount(0);
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
    await page.getByRole('link', { name: 'Panel de administración' }).click();
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
    await page.locator('#f-foto').setInputFiles(path.join(__dirname, '..', '..', 'public', 'imagenes', 'cod1', 'item1.jpg'));
    await captura(page, '08-admin-formulario');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Registro creado.')).toBeVisible();
    await expect(page.getByRole('cell', { name: `Plato e2e ${sufijo}` })).toBeVisible();

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
    await page.goto('/admin/productos');
    const fila = page.locator('tr', { hasText: `Plato e2e ${sufijo}` });
    await fila.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Registro eliminado.')).toBeVisible();
    await page.goto('/restaurantes/1');
    await expect(page.getByText(`Plato e2e ${sufijo}`)).toHaveCount(0);
  });

  test('ASVS V8 un cliente sin rol de administrador no accede al panel', async ({ page }) => {
    await page.goto('/restaurantes/1');
    await page.getByPlaceholder('Usuario').fill('alondra@gmail.com');
    await page.getByPlaceholder('Contraseña').fill('alondra01');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const respuesta = await page.goto('/admin');
    expect(respuesta.status()).toBe(403);
    await captura(page, '10-panel-denegado', { fullPage: false });
  });

  test('ASVS V2 una inyeccion SQL en la URL responde 404 sin detalles tecnicos', async ({ page }) => {
    const respuesta = await page.goto("/restaurantes/1%20OR%201=1");
    expect(respuesta.status()).toBe(404);
    await expect(page.locator('body')).not.toContainText(/syntax|postgres|SELECT/i);
    await captura(page, '11-sqli-404', { fullPage: false });
  });
});
