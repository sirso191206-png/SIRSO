import { lanzar } from './lanzar.mjs'
const BASE = 'http://localhost:4173'; const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await lanzar(); const p = await b.newPage()
const consola = []; p.on('console', (m) => consola.push(m.text().slice(0, 140)))
await p.goto(BASE + '/login', { waitUntil: 'networkidle0' }); await p.evaluate(() => navigator.serviceWorker.ready); await dormir(2500)
await p.reload({ waitUntil: 'networkidle0' }); const controlada = await p.evaluate(() => !!navigator.serviceWorker.controller)
const R = { controlada_por_SW: controlada }
// 1) recurso de OTRO dominio que falla en la red: ya NO lo fabrica el SW
consola.length = 0
R.tercero = await p.evaluate(async () => { try { const x = await fetch('https://cdn.example-tercero.com/x.js', { mode: 'no-cors' }); return `RESPUESTA ${x.status} ${x.statusText}` } catch (e) { return `error de red del navegador (${e.name})` } })
R.tercero_mensajes_503 = consola.filter((c) => /503|Sin conexi/i.test(c)).length
// 2) un archivo inexistente: el servidor (vite preview) responde index.html 200 → el SW lo convierte en 404 honesto y no lo guarda
const r = await p.evaluate(async () => { const x = await fetch('/assets/archivo-que-no-existe-abc.js'); return { status: x.status, texto: (await x.text()).slice(0, 40) } })
R.archivo_inexistente = r
R.guardado_en_cache = await p.evaluate(async () => { for (const n of await caches.keys()) { const c = await caches.open(n); if (await c.match('/assets/archivo-que-no-existe-abc.js')) return true } return false })
// 3) modelo 3D y shell precacheados se sirven del caché
R.glb = await p.evaluate(async () => { const x = await fetch('/models/odontograma.glb'); return { status: x.status, bytes: (await x.arrayBuffer()).byteLength } })
// 4) una ruta de la app (navegación) devuelve el shell
R.ruta_app = await p.evaluate(async () => { const x = await fetch('/pacientes/abc', { headers: { Accept: 'text/html' } }); return { status: x.status, esHtml: /text\/html/.test(x.headers.get('content-type') ?? '') } })
console.log(JSON.stringify(R, null, 1)); await b.close()
