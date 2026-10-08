import { lanzar } from './lanzar.mjs'
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await lanzar(); const p = await b.newPage()
const cdp = await p.createCDPSession(); await cdp.send('HeapProfiler.enable'); await cdp.send('Performance.enable')
const clic = (t) => p.evaluate((x) => [...document.querySelectorAll('button')].find((y) => y.textContent.trim() === x)?.click(), t)
await p.goto('http://localhost:5198/', { waitUntil: 'networkidle0' }); await dormir(800)
for (let i = 0; i < Number(process.env.CICLOS ?? 6); i++) { await clic('Vista anatómica 3D'); const hh = await p.waitForSelector('canvas'); await hh.dispose(); await dormir(1500); await clic('Vista clínica 2D'); await dormir(1500) }
await p.click('#alternar-montaje'); await dormir(2500)
for (let k = 0; k < 4; k++) { await cdp.send('HeapProfiler.collectGarbage'); await dormir(400) }
const { metrics } = await cdp.send('Performance.getMetrics'); console.log('Nodes (métrica):', metrics.find((x) => x.name === 'Nodes').value, '| listeners:', metrics.find((x) => x.name === 'JSEventListeners').value)
let trozos = []; cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => trozos.push(e.chunk))
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
const snap = JSON.parse(trozos.join('')); await b.close()
const m = snap.snapshot.meta, NF = m.node_fields.length, iName = m.node_fields.indexOf('name'), iT = m.node_fields.indexOf('type'), N = snap.nodes.length / NF

const EF = m.edge_fields.length, eT = m.edge_fields.indexOf('type'), eN = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node'), iEC = m.node_fields.indexOf('edge_count'), tipoE = m.edge_types[0]
const nombre = (i) => snap.strings[snap.nodes[i * NF + iName]]
const primera = new Uint32Array(N + 1); for (let i = 0; i < N; i++) primera[i + 1] = primera[i] + snap.nodes[i * NF + iEC]
const padre = new Int32Array(N).fill(-1), via = new Array(N), cola = [0]; padre[0] = 0
for (let h = 0; h < cola.length; h++) { const u = cola[h]; for (let e = primera[u]; e < primera[u + 1]; e++) { const tn = tipoE[snap.edges[e * EF + eT]]; if (tn === 'weak' || tn === 'shortcut') continue; const v = snap.edges[e * EF + eTo] / NF; if (padre[v] === -1) { padre[v] = u; via[v] = { tn, nombre: (tn === 'element' || tn === 'hidden') ? snap.edges[e * EF + eN] : snap.strings[snap.edges[e * EF + eN]] }; cola.push(v) } } }
const objetivos = []; for (let i = 0; i < N; i++) { const n = nombre(i); if (/^<span class="pointer-events-none select-none rounded/.test(n) || /^<div data-etiqueta=/.test(n)) objetivos.push(i) }
console.log('objetivos:', objetivos.length, '| alcanzables desde la raíz:', objetivos.filter((i) => padre[i] !== -1).length)

const o = objetivos.find((i) => /^<div class="pointer-events-none absolute/.test(nombre(i)) && padre[i] !== -1) ?? objetivos[0]
const ruta = []; for (let v = o, k = 0; v !== 0 && k < 60; v = padre[v], k++) ruta.push(`${nombre(v).slice(0, 70)}   ⟵ ${via[v].tn}: ${String(via[v].nombre).slice(0, 40)}`)
console.log('--- ruta COMPLETA (desde la capa de etiquetas hacia la raíz) ---'); console.log(ruta.join('\n'))
