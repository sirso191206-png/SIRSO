import { lanzar } from './lanzar.mjs'
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await lanzar(); const p = await b.newPage()
const cdp = await p.createCDPSession(); await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable')
const m = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); const { metrics } = await cdp.send('Performance.getMetrics'); const g = (n) => metrics.find((x) => x.name === n)?.value; return { heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(2), listeners: g('JSEventListeners'), nodos: g('Nodes') } }
const clic = (t) => p.evaluate((x) => [...document.querySelectorAll('button')].find((y) => y.textContent.trim() === x)?.click(), t)
await p.goto('http://localhost:5198/', { waitUntil: 'networkidle0' }); await dormir(800)
const filas = []
for (let i = 1; i <= 30; i++) {
  await clic('Vista anatómica 3D'); await p.waitForSelector('canvas').then((h) => h.dispose()); await dormir(900)
  await clic('Vista clínica 2D'); await dormir(700)
  if (i === 1 || i % 5 === 0) filas.push({ ciclo: i, ...(await m()) })
}
console.table(filas); await b.close()
