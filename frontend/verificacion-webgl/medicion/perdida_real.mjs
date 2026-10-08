import fs from 'node:fs'
import { lanzar } from './lanzar.mjs'
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await lanzar(); const p = await b.newPage()
await p.evaluateOnNewDocument(fs.readFileSync('./instrumento.js', 'utf8'))
const logs = []; p.on('console', (m) => logs.push(m.text().slice(0, 120)))
await p.goto('http://localhost:5198/', { waitUntil: 'networkidle0' }); await dormir(800)
await p.evaluate(() => [...document.querySelectorAll('button')].find((y) => y.textContent.trim() === 'Vista anatómica 3D').click())
await p.waitForSelector('canvas').then((h) => h.dispose()); await dormir(3000)
const pixeles = async () => { const el = await p.$('canvas'); const caja = await el.boundingBox(); await el.dispose(); const png = await p.screenshot({ clip: caja, encoding: 'binary' }); return png.length }
const frames = async (ms) => { const a = await p.evaluate(() => window.__m.rafTotal); await dormir(ms); return (await p.evaluate(() => window.__m.rafTotal)) - a }
const texto = () => p.evaluate(() => document.body.innerText)
const R = {}
R.dibujo_inicial_bytes = await pixeles(); R.frames_1s_antes = await frames(1000)
// 1) pérdida REAL
await p.evaluate(() => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); window.__ext = gl.getExtension('WEBGL_lose_context'); window.__c = c; window.__ext.loseContext() })
await dormir(900)
R.aviso_perdido_visible = /perdió la conexión con la tarjeta gráfica/.test(await texto())
R.frames_1s_perdido = await frames(1000)
// 2) restauración
await p.evaluate(() => window.__ext.restoreContext()); await dormir(6000)
const t2 = await texto()
R.aviso_desaparece_al_restaurar = !/perdió la conexión|No se pudo recuperar/.test(t2)
R.frames_1s_tras_restaurar = await frames(1000)
R.dibujo_tras_restaurar_bytes = await pixeles()
R.contextos_creados_total = await p.evaluate(() => window.__m.ctxCreados); R.contextos_vivos = await p.evaluate(() => window.__m.vivos.size)
// 3) pérdida SIN restauración → tras 4 s se ofrece Reintentar / Usar 2D
await p.evaluate(() => { const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); window.__ext2 = gl.getExtension('WEBGL_lose_context'); window.__ext2.loseContext() })
await dormir(5500); const t3 = await texto()
R.sin_recuperar_muestra_opciones = /No se pudo recuperar la vista 3D/.test(t3) && /Reintentar/.test(t3) && /Usar vista 2D/.test(t3)
await p.evaluate(() => [...document.querySelectorAll('button')].find((y) => y.textContent.trim() === 'Reintentar')?.click()); await dormir(5000)
R.tras_reintentar = { canvas: await p.evaluate(() => document.querySelectorAll('canvas').length), contextos_vivos: await p.evaluate(() => window.__m.vivos.size), contextos_creados_total: await p.evaluate(() => window.__m.ctxCreados), aviso_gone: !/No se pudo recuperar/.test(await texto()), frames_1s: await frames(1000), dibujo_bytes: await pixeles() }
R.mensajes_ContextLost_en_consola = logs.filter((l) => /Context Lost/i.test(l)).length
R.errores_en_consola = logs.filter((l) => /error|invalid_operation|warning/i.test(l)).slice(0, 4)
console.log(JSON.stringify(R, null, 1)); await b.close()
