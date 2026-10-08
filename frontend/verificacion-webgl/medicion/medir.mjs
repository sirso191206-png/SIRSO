import fs from 'node:fs'
import { lanzar } from './lanzar.mjs'
const DIRECCION = process.argv[2] ?? 'http://localhost:5199/'
const ETIQUETA = process.argv[3] ?? 'medicion'
const instr = fs.readFileSync(new URL('./instrumento.js', import.meta.url), 'utf8')
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await lanzar(); const p = await b.newPage()
await p.evaluateOnNewDocument(instr)
const consola = { contextLost: 0, contextRestored: 0, startTime: 0, f503: 0, tooMany: 0, errores: [], avisos: [], otros: [] }
p.on('console', (m) => { const t = m.text()
  if (/Context Lost/i.test(t)) consola.contextLost++
  else if (/Context Restored/i.test(t)) consola.contextRestored++
  else if (/startTime/.test(t)) consola.startTime++
  else if (/503/.test(t)) consola.f503++
  else if (/Too many active WebGL/i.test(t)) consola.tooMany++
  else if (m.type() === 'error') consola.errores.push(t.slice(0, 200))
  else if (m.type() === 'warning') consola.avisos.push(t.slice(0, 200)) })
p.on('pageerror', (e) => consola.errores.push('pageerror: ' + String(e.message).slice(0, 200)))
const cdp = await p.createCDPSession(); await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable')
const metricas = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); const { metrics } = await cdp.send('Performance.getMetrics'); const g = (n) => metrics.find((x) => x.name === n)?.value ?? 0; return { jsListeners: g('JSEventListeners'), nodos: g('Nodes'), heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(1) } }
const foto = async () => ({ ...(await p.evaluate(() => window.__foto())), ...(await metricas()) })
const filas = []
const marca = async (nombre, espera = 900) => { await dormir(espera); const f = await foto(); filas.push({ paso: nombre, ...f, ctxLost: consola.contextLost }); }
const clic = async (selector) => { const h = await p.waitForSelector(selector, { timeout: 15000 }); await h.dispose(); await p.click(selector) }
const clicTexto = async (texto) => { await p.waitForFunction((t) => [...document.querySelectorAll('button')].some((x) => x.textContent.trim() === t), { timeout: 15000 }, texto); await p.evaluate((t) => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t).click(), texto) }
const hayCanvas = () => p.evaluate(() => !!document.querySelector('canvas'))
const esperarCanvas = async () => { const h = await p.waitForSelector('canvas', { timeout: 20000 }); await h.dispose(); await dormir(1200) }

await p.goto(DIRECCION, { waitUntil: 'networkidle0' })
await marca('0. cargado (2D)')
// Prueba 1: entrar al 3D
await clicTexto('Vista anatómica 3D'); await esperarCanvas(); await marca('1. entra al 3D', 400)
// Prueba 2/3: salir y volver
await clicTexto('Vista clínica 2D'); await marca('2. sale al 2D', 1500)
await clicTexto('Vista anatómica 3D'); await esperarCanvas(); await marca('3. vuelve al 3D', 400)
// Prueba 4: 3D → 2D → 3D × 6
for (let i = 1; i <= 6; i++) { await clicTexto('Vista clínica 2D'); await dormir(250); await clicTexto('Vista anatómica 3D'); await esperarCanvas() }
await marca('4. tras 6 ciclos 2D↔3D', 1500)
// Prueba 5: cambiar de paciente estando en 3D
await clic('#pac-B'); await esperarCanvas(); await marca('5a. paciente B (3D)', 1200)
await clic('#pac-A'); await esperarCanvas(); await marca('5b. paciente A (3D)', 1200)
// Prueba 6: abrir y cerrar (desmontar / montar) el odontograma completo ×4
for (let i = 1; i <= 4; i++) { await clic('#alternar-montaje'); await dormir(700); await clic('#alternar-montaje'); await esperarCanvas() }
await marca('6. tras 4 montajes/desmontajes', 1500)
// pestaña "otra" ×3
for (let i = 1; i <= 3; i++) { await clic('#otra-pestana'); await dormir(600); await clic('#otra-pestana'); await esperarCanvas() }
await marca('6b. tras 3 cambios de pestaña', 1500)
// Desmontar del todo: todo debe liberarse
await clic('#alternar-montaje'); await marca('7. odontograma desmontado (todo liberado)', 2000)
// Prueba 7: recarga estando en el odontograma
await p.reload({ waitUntil: 'networkidle0' }); await clicTexto('Vista anatómica 3D').catch(() => {}); await esperarCanvas(); await marca('8. tras recargar la página', 600)

// Pérdida REAL de contexto + restauración (simulada con la extensión oficial WEBGL_lose_context)
const antes = consola.contextLost
const r1 = await p.evaluate(async () => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const ext = gl.getExtension('WEBGL_lose_context'); window.__ext = ext; window.__canvasPerdido = c; ext.loseContext(); await new Promise((r) => setTimeout(r, 700)); return { perdido: gl.isContextLost(), hayAviso: /gráfic|3D|contexto|recuper/i.test(document.body.innerText.slice(0, 5000)) } })
const fPerdido = await foto()
const rafAntes = await p.evaluate(() => window.__m.rafTotal); await dormir(600); const rafDespues = await p.evaluate(() => window.__m.rafTotal)
const r2 = await p.evaluate(async () => { const c = window.__canvasPerdido; const gl = c.getContext('webgl2') || c.getContext('webgl'); window.__ext.restoreContext(); await new Promise((r) => setTimeout(r, 1800)); return { perdido: gl.isContextLost() } })
const fRestaurado = await foto()
const rafR1 = await p.evaluate(() => window.__m.rafTotal); await dormir(600); const rafR2 = await p.evaluate(() => window.__m.rafTotal)
const cabe = await p.evaluate(() => { const c = document.querySelector('canvas'); return !!c && c.width > 0 })

console.log(`\n##### ${ETIQUETA} — ${DIRECCION}`)
console.table(filas.map((f) => ({ paso: f.paso, 'ctx creados': f.ctxCreados, 'ctx VIVOS': f.vivos, 'ctx perdidos': f.perdidos, 'rAF pend.': f.rafPendientes, 'JS listeners (tras GC)': f.jsListeners, 'nodos DOM': f.nodos, 'heap MB': f.heapMB, 'RO': f.resizeObservers, 'canvas DOM': f.canvasEnDom, 'logs "Context Lost"': f.ctxLost })))
console.log('--- pérdida real de contexto (loseContext) ---')
console.log(JSON.stringify({ tras_perder: r1, vivos_tras_perder: fPerdido.vivos, ctx_creados_tras_perder: fPerdido.ctxCreados, frames_en_600ms_mientras_perdido: rafDespues - rafAntes, logs_ContextLost_por_perdida_real: consola.contextLost - antes }))
console.log('--- restauración ---')
console.log(JSON.stringify({ tras_restaurar: r2, restaurados: fRestaurado.restaurados, ctx_creados: fRestaurado.ctxCreados, vivos: fRestaurado.vivos, frames_en_600ms_tras_restaurar: rafR2 - rafR1, canvas_con_tamano: cabe }))
console.log('--- consola ---'); console.log(JSON.stringify({ contextLost: consola.contextLost, contextRestored: consola.contextRestored, startTime: consola.startTime, f503: consola.f503, tooManyContexts: consola.tooMany }))
if (consola.errores.length) console.log('errores:', [...new Set(consola.errores)].slice(0, 6))
if (consola.avisos.length) console.log('avisos:', [...new Set(consola.avisos)].slice(0, 6))
await b.close()
