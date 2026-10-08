(() => {
  const m = (window.__m = { ctxCreados: 0, vivos: new Set(), perdidos: 0, restaurados: 0, rafPend: new Set(), rafTotal: 0, observadores: new Set(), claves: new Set(), ids: new WeakMap(), sig: 1 })
  const id = (o) => { if (!o) return 0; if (!m.ids.has(o)) m.ids.set(o, m.sig++); return m.ids.get(o) }
  const gc = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (tipo, ...a) {
    const c = gc.call(this, tipo, ...a)
    if (c && /webgl/.test(tipo) && !this.__visto) {
      this.__visto = true; m.ctxCreados++; m.vivos.add(this)
      this.addEventListener('webglcontextlost', () => { m.perdidos++; m.vivos.delete(this) })
      this.addEventListener('webglcontextrestored', () => { m.restaurados++; m.vivos.add(this) })
    }
    return c
  }
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => { m.rafTotal++; const h = raf((t) => { m.rafPend.delete(h); cb(t) }); m.rafPend.add(h); return h }
  window.cancelAnimationFrame = (h) => { m.rafPend.delete(h); caf(h) }
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener
  const clave = (t, tipo, f, o) => `${id(t)}|${tipo}|${id(f)}|${typeof o === 'boolean' ? o : !!o?.capture}`
  EventTarget.prototype.addEventListener = function (tipo, f, o) { if (f && !/^(webglcontext)/.test(tipo)) m.claves.add(clave(this, tipo, f, o)); return add.call(this, tipo, f, o) }
  EventTarget.prototype.removeEventListener = function (tipo, f, o) { if (f) m.claves.delete(clave(this, tipo, f, o)); return rem.call(this, tipo, f, o) }
  const RO = window.ResizeObserver
  window.ResizeObserver = class extends RO { constructor(cb) { super(cb); m.observadores.add(this) } disconnect() { m.observadores.delete(this); super.disconnect() } }
  window.__foto = () => ({ ctxCreados: m.ctxCreados, vivos: m.vivos.size, perdidos: m.perdidos, restaurados: m.restaurados, rafPendientes: m.rafPend.size, listenersNetos: m.claves.size, resizeObservers: m.observadores.size, canvasEnDom: document.querySelectorAll('canvas').length })
})()
