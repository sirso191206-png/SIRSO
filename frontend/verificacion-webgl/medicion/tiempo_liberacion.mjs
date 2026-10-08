import fs from 'node:fs'
import { lanzar } from './lanzar.mjs'
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await lanzar(); const p = await b.newPage()
await p.evaluateOnNewDocument(fs.readFileSync('./instrumento.js', 'utf8'))
let logs = 0; p.on('console', (m) => { if (/Context Lost/i.test(m.text())) logs++ })
await p.goto(process.argv[2] ?? 'http://localhost:5199/', { waitUntil: 'networkidle0' }); await dormir(800)
await p.evaluate(() => [...document.querySelectorAll('button')].find((y) => y.textContent.trim() === 'Vista anatómica 3D').click())
await p.waitForSelector('canvas'); await dormir(1500)
console.log('en 3D:', JSON.stringify(await p.evaluate(() => window.__foto())))
await p.click('#alternar-montaje'); const t0 = Date.now()
for (let i = 0; i < 16; i++) { await dormir(500); const f = await p.evaluate(() => window.__foto()); if (i % 2 === 1 || f.vivos === 0) console.log(`+${Date.now() - t0}ms vivos=${f.vivos} perdidos=${f.perdidos} canvasDOM=${f.canvasEnDom} rAF=${f.rafPendientes} logsContextLost=${logs}`); if (f.vivos === 0) break }
await b.close()
