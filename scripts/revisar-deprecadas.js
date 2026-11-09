'use strict';
// Filtro de seguridad: rechaza el despliegue si alguna dependencia de PRODUCCION esta marcada como "deprecated" en npm
// (ISO 27001 A.8.8 / ASVS V15: componentes sin mantenimiento). Lee package-lock.json y consulta el registro de npm.
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

const paquetes = new Map();
for (const [ruta, info] of Object.entries(lock.packages || {})) {
  if (!ruta || info.dev || info.devOptional || !info.version) continue; // solo lo que llega a produccion
  const nombre = ruta.slice(ruta.lastIndexOf('node_modules/') + 'node_modules/'.length);
  paquetes.set(`${nombre}@${info.version}`, nombre);
}

async function revisar(especificador) {
  try {
    const { stdout } = await run('npm', ['view', especificador, 'deprecated', '--json'], { shell: process.platform === 'win32', timeout: 60000 });
    const texto = stdout.trim();
    return texto ? { especificador, mensaje: JSON.parse(texto) } : null;
  } catch (e) {
    return { especificador, error: (e.stderr || e.message || '').toString().split('\n')[0] };
  }
}

(async () => {
  const lista = [...paquetes.keys()];
  const deprecadas = [];
  const errores = [];
  const lote = 8;
  for (let i = 0; i < lista.length; i += lote) {
    const res = await Promise.all(lista.slice(i, i + lote).map(revisar));
    for (const r of res) {
      if (!r) continue;
      (r.error ? errores : deprecadas).push(r);
    }
  }
  console.log(`Dependencias de produccion revisadas: ${lista.length}`);
  for (const d of deprecadas) console.log(`DEPRECADA  ${d.especificador}: ${d.mensaje}`);
  for (const e of errores) console.log(`NO SE PUDO CONSULTAR  ${e.especificador}: ${e.error}`);
  fs.mkdirSync('reports/seguridad', { recursive: true });
  fs.writeFileSync('reports/seguridad/deprecadas.json', JSON.stringify({ revisadas: lista.length, deprecadas, errores }, null, 2));
  if (deprecadas.length || errores.length) {
    console.error(`Rechazado: ${deprecadas.length} deprecada(s), ${errores.length} sin verificar.`);
    process.exit(1);
  }
  console.log('OK: ninguna dependencia de produccion esta deprecada.');
})();
