import { Odontograma3DDirectoGLB } from '../components/odontograma/Odontograma3DDirectoGLB'

export function PruebaOdontogramaGlb() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-800">Prueba: odontograma directo desde GLB</h1>
      <p className="mb-4 text-sm text-slate-500">
        Escena completa del <code>.glb</code> de Blender, mostrada sin ninguna reconstrucción por
        diente — para comprobar si el modelo real ya coincide con Blender tal cual sale exportado.
      </p>
      <Odontograma3DDirectoGLB />
    </div>
  )
}
