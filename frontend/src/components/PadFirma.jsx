import { useRef, useState } from 'react'

export function PadFirma({ onCambiar }) {
  const canvasRef = useRef(null)
  const dibujando = useRef(false)
  const [tieneTrazo, setTieneTrazo] = useState(false)

  const obtenerPosicion = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const punto = e.touches ? e.touches[0] : e
    return {
      x: (punto.clientX - rect.left) * (canvas.width / rect.width),
      y: (punto.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  const iniciarTrazo = (e) => {
    e.preventDefault()
    dibujando.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = obtenerPosicion(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const dibujar = (e) => {
    if (!dibujando.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = obtenerPosicion(e)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1E293B'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
    if (!tieneTrazo) setTieneTrazo(true)
  }

  const terminarTrazo = () => {
    if (!dibujando.current) return
    dibujando.current = false
    const canvas = canvasRef.current
    onCambiar(canvas.toDataURL('image/png'))
  }

  const limpiar = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setTieneTrazo(false)
    onCambiar(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        className="w-full touch-none rounded-lg border border-slate-300 bg-white"
        onMouseDown={iniciarTrazo}
        onMouseMove={dibujar}
        onMouseUp={terminarTrazo}
        onMouseLeave={terminarTrazo}
        onTouchStart={iniciarTrazo}
        onTouchMove={dibujar}
        onTouchEnd={terminarTrazo}
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">Firma aquí con el dedo o el mouse</span>
        {tieneTrazo && (
          <button type="button" onClick={limpiar} className="text-xs text-clinico-rojo hover:underline">
            Borrar firma
          </button>
        )}
      </div>
    </div>
  )
}
