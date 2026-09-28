import fs from 'node:fs'
import path from 'node:path'

// Vite genera nombres de archivo con hash (index-Xy8k2f.js) que cambian
// en cada build — un service worker no puede tener esos nombres
// escritos a mano, se desactualizarían en el siguiente deploy. Este
// plugin, al terminar el build, recorre la carpeta dist/ real y
// escribe la lista exacta de lo que se generó, para que el service
// worker la lea y sepa qué precachear sin adivinar nada.
export function precacheManifest() {
  return {
    name: 'siro-precache-manifest',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist')
      if (!fs.existsSync(distDir)) return

      const archivos = []
      function recorrer(dir, base) {
        for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
          const rutaCompleta = path.join(dir, entrada.name)
          const rutaRelativa = base ? `${base}/${entrada.name}` : entrada.name
          if (entrada.isDirectory()) {
            recorrer(rutaCompleta, rutaRelativa)
          } else if (
            !entrada.name.endsWith('.map') &&
            entrada.name !== 'sw.js' &&
            entrada.name !== 'precache-manifest.json'
          ) {
            archivos.push('/' + rutaRelativa)
          }
        }
      }
      recorrer(distDir, '')

      // La versión es la hora del build — cambia en cada deploy.
      const version = `build-${Date.now()}`
      fs.writeFileSync(
        path.join(distDir, 'precache-manifest.json'),
        JSON.stringify({ version, archivos })
      )

      // IMPORTANTE: se sella la misma versión DENTRO de sw.js. Un
      // navegador solo actualiza un service worker cuando los bytes de
      // sw.js cambian; si este archivo fuera idéntico entre builds, un
      // deploy nuevo nunca dispararía la actualización y la gente
      // quedaría con la versión vieja para siempre, sin ningún error
      // visible. Además, sw.js usa este valor para nombrar su caché, así
      // el nombre sale del propio archivo y no de memoria que el
      // navegador puede borrar al reiniciar el worker.
      const swRuta = path.join(distDir, 'sw.js')
      if (fs.existsSync(swRuta)) {
        const codigo = fs.readFileSync(swRuta, 'utf8')
        fs.writeFileSync(swRuta, codigo.replaceAll('__SIRO_BUILD__', version))
      }
    }
  }
}
