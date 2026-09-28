import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { precacheManifest } from '../../../../vite-plugin-precache-manifest.js'

describe('precacheManifest (plugin de Vite)', () => {
  let dirTemporal
  let dirTrabajoOriginal

  beforeEach(() => {
    dirTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'siro-precache-test-'))
    dirTrabajoOriginal = process.cwd()
    process.chdir(dirTemporal)
  })

  afterEach(() => {
    process.chdir(dirTrabajoOriginal)
    fs.rmSync(dirTemporal, { recursive: true, force: true })
  })

  function crearDistDeMentira() {
    const dist = path.join(dirTemporal, 'dist')
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>')
    fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)')
    fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js.map'), '{}')
    fs.writeFileSync(path.join(dist, 'assets', 'index-xyz789.css'), 'body{}')
    fs.writeFileSync(path.join(dist, 'sw.js'), '// service worker')
    return dist
  }

  it('lista los archivos reales generados, con su hash tal cual quedó', () => {
    crearDistDeMentira()
    const plugin = precacheManifest()
    plugin.closeBundle()

    const manifiesto = JSON.parse(fs.readFileSync(path.join(dirTemporal, 'dist', 'precache-manifest.json'), 'utf8'))
    expect(manifiesto.archivos).toContain('/index.html')
    expect(manifiesto.archivos).toContain('/assets/index-abc123.js')
    expect(manifiesto.archivos).toContain('/assets/index-xyz789.css')
  })

  it('excluye archivos .map, sw.js, y el propio manifiesto — nunca se precachean a sí mismos ni mapas de depuración', () => {
    crearDistDeMentira()
    const plugin = precacheManifest()
    plugin.closeBundle()

    const manifiesto = JSON.parse(fs.readFileSync(path.join(dirTemporal, 'dist', 'precache-manifest.json'), 'utf8'))
    expect(manifiesto.archivos.some((a) => a.endsWith('.map'))).toBe(false)
    expect(manifiesto.archivos).not.toContain('/sw.js')
    expect(manifiesto.archivos).not.toContain('/precache-manifest.json')
  })

  it('la version cambia entre dos ejecuciones (para que el service worker sepa que hay una build nueva)', async () => {
    crearDistDeMentira()
    const plugin = precacheManifest()
    plugin.closeBundle()
    const v1 = JSON.parse(fs.readFileSync(path.join(dirTemporal, 'dist', 'precache-manifest.json'), 'utf8')).version

    await new Promise((r) => setTimeout(r, 5))
    plugin.closeBundle()
    const v2 = JSON.parse(fs.readFileSync(path.join(dirTemporal, 'dist', 'precache-manifest.json'), 'utf8')).version

    expect(v1).not.toBe(v2)
  })

  it('no truena si dist/ todavía no existe (p. ej. el plugin corriendo antes de que Vite escriba algo)', () => {
    const plugin = precacheManifest()
    expect(() => plugin.closeBundle()).not.toThrow()
  })
  // Un navegador solo actualiza un service worker si los BYTES de sw.js
  // cambian. Si sw.js fuera idéntico entre builds, un deploy nuevo NUNCA
  // dispararía la actualización y la gente quedaría con la versión vieja
  // para siempre — sin ningún error visible.
  describe('sellado de sw.js por build (para que el navegador detecte la actualización)', () => {
    const SW_FUENTE = "const BUILD_ID = '__SIRO_BUILD__'\nself.addEventListener('install', () => {})\n"

    function buildConSw() {
      const dist = crearDistDeMentira()
      fs.writeFileSync(path.join(dist, 'sw.js'), SW_FUENTE) // como lo copia Vite desde public/
      precacheManifest().closeBundle()
      return {
        sw: fs.readFileSync(path.join(dist, 'sw.js'), 'utf8'),
        manifiesto: JSON.parse(fs.readFileSync(path.join(dist, 'precache-manifest.json'), 'utf8'))
      }
    }

    it('reemplaza el marcador por la versión real de la build', () => {
      const { sw, manifiesto } = buildConSw()
      expect(sw).not.toContain('__SIRO_BUILD__')
      expect(sw).toContain(`'${manifiesto.version}'`)
    })

    it('dos builds distintas producen sw.js con bytes distintos', async () => {
      const a = buildConSw().sw
      await new Promise((r) => setTimeout(r, 5))
      fs.rmSync(path.join(dirTemporal, 'dist'), { recursive: true, force: true })
      const b = buildConSw().sw
      expect(a).not.toBe(b)
    })

    it('no falla si sw.js no existe en dist/', () => {
      crearDistDeMentira()
      fs.rmSync(path.join(dirTemporal, 'dist', 'sw.js'))
      expect(() => precacheManifest().closeBundle()).not.toThrow()
    })
  })
})
