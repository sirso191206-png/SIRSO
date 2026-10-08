import fs from 'node:fs'
import { lanzar } from './lanzar.mjs'
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
async function correr(modo) {
  const b = await lanzar(); const p = await b.newPage()
  await p.evaluateOnNewDocument(fs.readFileSync('./instrumento.js', 'utf8'))
  const cdp = await p.createCDPSession(); await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable')
  const m = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); const { metrics } = await cdp.send('Performance.getMetrics'); const g = (n) => metrics.find((x) => x.name === n)?.value; return { listeners: g('JSEventListeners'), nodos: g('Nodes'), heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(1) } }
  await p.goto(`http://localhost:5199/capas.html?modo=${modo}`, { waitUntil: 'networkidle0' }); await dormir(1500)
  const base = await m(); const filas = []
  for (let i = 1; i <= 4; i++) { await p.click('#alternar'); await dormir(1200); await p.click('#alternar'); await dormir(1800); const x = await m(); filas.push(x) }
  await p.click('#alternar'); await dormir(1500); const fin = await m()
  await b.close()
  const dL = (filas.at(-1).listeners - base.listeners) / 4
  return { modo, 'listeners/ciclo': Math.round(dL), 'listeners al final (todo desmontado)': fin.listeners, 'base': base.listeners, 'heap base→fin MB': `${base.heapMB}→${fin.heapMB}` }
}
const res = []; for (const modo of ['vacio', 'vacio_html', 'glb', 'glb_html']) res.push(await correr(modo)); console.table(res)
