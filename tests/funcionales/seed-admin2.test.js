'use strict';
// Cuentas iniciales en produccion: cada restaurante tiene su propio administrador (sin acceso cruzado entre restaurantes).
// ASVS v5 V8 (control de acceso) | ISO 27001 A.5.15. Prueba pura de la logica de seed (no usa la base de datos).

const { cuentasIniciales } = require('../../scripts/seed-usuarios');

const prod = (extra = {}) => ({ esProd: true, ADMIN_PASSWORD: 'a'.repeat(20), CLIENTE_PASSWORD: 'c'.repeat(20), ADMIN2_PASSWORD: '', ...extra });

describe('seed de cuentas en produccion', () => {
  test('sin ADMIN2_PASSWORD solo existe el admin del restaurante 1', () => {
    const admins = cuentasIniciales(prod()).filter((c) => c.rol === 'admin');
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ email: 'admin@gmail.com', restaurante_id: 1 });
  });

  test('con ADMIN2_PASSWORD se crea el admin del restaurante 2, con su propia clave', () => {
    const clave = 'b'.repeat(20);
    const admins = cuentasIniciales(prod({ ADMIN2_PASSWORD: clave })).filter((c) => c.rol === 'admin');
    expect(admins).toHaveLength(2);
    const bahia = admins.find((c) => c.restaurante_id === 2);
    expect(bahia).toMatchObject({ email: 'admin.bahia@gmail.com', password: clave });
    expect(admins.map((c) => c.password)).toEqual([expect.any(String), clave]);
    expect(admins[0].password).not.toBe(clave);
  });

  test('una clave corta (menos de 12 caracteres) no crea la cuenta', () => {
    const admins = cuentasIniciales(prod({ ADMIN2_PASSWORD: 'corta' })).filter((c) => c.rol === 'admin');
    expect(admins).toHaveLength(1);
  });
});
