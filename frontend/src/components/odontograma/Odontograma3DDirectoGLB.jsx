// ============================================================
// PRUEBA AISLADA E INDEPENDIENTE — Odontograma 3D directo desde GLB
// ------------------------------------------------------------
// A propósito NO importa nada de OdontogramaGLBScene.jsx,
// EscenaDental3D.jsx, identificarNodosFdi.js, ni configuracionDental.js
// — es una verificación de cero, independiente de la arquitectura
// clínica que estamos validando, para no heredar un bug compartido.
//
// Literalmente: Blender → odontograma.glb → GLTFLoader (useGLTF) →
// Three.js → pantalla. Nada intermedio.
//
// NO hace, en ningún punto de este archivo:
//   - configuracionDental.js
//   - posicionAnatomicaReal.js
//   - Math.atan2 / Math.sin / Math.cos para posicionar u orientar
//   - geometry.center()
//   - escala por tipo de diente
//   - transformación individual por FDI
//
// La ÚNICA transformación es la del propio nodo glTF (quaternion ya
// horneado por el exportador — Three.js lo aplica automáticamente al
// renderizar <primitive object={scene} />, no se toca nada a mano).
// ============================================================

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'

const RUTA_MODELO = '/models/odontograma.glb'

function calcularVistaDesde(centro, tamano, direccion, fovGrados, aspect, margen) {
  const fovV = (fovGrados * Math.PI) / 180
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect)
  const largo = Math.sqrt(direccion[0] ** 2 + direccion[1] ** 2 + direccion[2] ** 2) || 1
  const dir = direccion.map((c) => c / largo)
  const ejePrincipal = dir.map(Math.abs)
  const idxPrincipal = ejePrincipal.indexOf(Math.max(...ejePrincipal))
  const [idxA, idxB] = [0, 1, 2].filter((i) => i !== idxPrincipal)
  const distanciaPorAltura = tamano[idxB] / 2 / Math.tan(fovV / 2)
  const distanciaPorAncho = tamano[idxA] / 2 / Math.tan(fovH / 2)
  const distancia = Math.max(distanciaPorAltura, distanciaPorAncho) * margen
  return {
    posicion: [centro[0] + dir[0] * distancia, centro[1] + dir[1] * distancia, centro[2] + dir[2] * distancia],
    target: [...centro],
  }
}

function EscenaDirectaIndependiente({ vista }) {
  // useGLTF SIN clonar — la escena tal cual la entrega el GLTFLoader,
  // literalmente como Blender la exportó.
  const { scene } = useGLTF(RUTA_MODELO)
  const { camera } = useThree()
  const controlsRef = useRef()

  const { centro, tamano, distanciaModelo } = useMemo(() => {
    const caja = new Box3().setFromObject(scene)
    const c = new Vector3()
    const t = new Vector3()
    caja.getCenter(c)
    caja.getSize(t)
    return { centro: c.toArray(), tamano: t.toArray(), distanciaModelo: Math.max(t.x, t.y, t.z) }
  }, [scene])

  const vistas = useMemo(() => ({
    restablecer: calcularVistaDesde(centro, tamano, [0, 0, 1], 40, 1.4, 1.3),
    frontal: calcularVistaDesde(centro, tamano, [0, 0, 1], 40, 1.4, 1.3),
    oclusal: calcularVistaDesde(centro, tamano, [0, 1, 0.001], 40, 1.4, 1.25),
    lateral: calcularVistaDesde(centro, tamano, [1, 0, 0], 40, 1.4, 1.3),
  }), [centro, tamano])

  useEffect(() => {
    const destino = vistas[vista] ?? vistas.restablecer
    camera.position.set(...destino.posicion)
    if (controlsRef.current) {
      controlsRef.current.target.set(...destino.target)
      controlsRef.current.update()
    }
  }, [vista, vistas, camera])

  return (
    <>
      {/* La escena completa, exactamente como la exportó Blender — sin
          clonar, sin centrar, sin recalcular nada. */}
      <primitive object={scene} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.15}
        enablePan
        minDistance={distanciaModelo * 0.08}
        maxDistance={distanciaModelo * 6}
      />
    </>
  )
}

export function Odontograma3DDirectoGLB() {
  const [vista, setVista] = useState('restablecer')
  const [claveReset, setClaveReset] = useState(0)

  return (
    <div>
      <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠ Prueba aislada e independiente — carga el .glb directo, sin ninguna dependencia de
        OdontogramaGLBScene.jsx ni de la arquitectura clínica. Solo para verificación visual.
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {[
          { id: 'restablecer', etiqueta: 'Restablecer' },
          { id: 'frontal', etiqueta: 'Frontal' },
          { id: 'oclusal', etiqueta: 'Oclusal' },
          { id: 'lateral', etiqueta: 'Lateral' },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => { setVista(v.id); setClaveReset((k) => k + 1) }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              vista === v.id ? 'border-clinico-azul bg-clinico-azul text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200" style={{ height: '640px' }}>
        <Canvas shadows={false} camera={{ position: [0, 0, 10], fov: 40 }} dpr={[1, 1.5]}>
          <color attach="background" args={['#F8FAFC']} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[2.5, 4, 3]} intensity={0.6} />
          <directionalLight position={[-2.5, -1.5, 2]} intensity={0.25} />
          <Suspense fallback={null}>
            <EscenaDirectaIndependiente key={claveReset} vista={vista} />
          </Suspense>
        </Canvas>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Arrastra para rotar, rueda del mouse para zoom, clic derecho para desplazar (pan). Los botones
        reencuadran sobre el centro real de la escena, calculado con Box3.
      </p>
    </div>
  )
}
