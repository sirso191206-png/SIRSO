import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
export async function lanzar() {
  const exe = await chromium.executablePath()
  const args = [...chromium.args.filter((a) => !/--use-gl|--headless|--single-process/.test(a)), '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage', '--window-size=1280,900']
  return puppeteer.launch({ executablePath: exe, args, headless: 'shell', defaultViewport: { width: 1280, height: 900 } })
}
