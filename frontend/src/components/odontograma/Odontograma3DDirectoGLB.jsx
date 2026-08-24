// ============================================================
// PRUEBA AISLADA — Odontograma 3D directo desde el GLB
// ------------------------------------------------------------
// Objetivo: comprobar si la escena completa del .glb, cargada y
// mostrada TAL CUAL (sin reconstruir nada), ya se ve como Blender.
//
// NO usa:
//   - configuracionDental.js (ninguna posición/rotación manual)
//   - posicionAnatomicaReal.js (ningún cálculo de centro por pieza)
//   - geometry.center()
//   - Math.atan2 / rotación por tangente
//   - escala por tipo de diente
//   - estados clínicos / useOdontograma / Supabase
//   - overlays, símbolos, etiquetas, selección
//
// SÍ usa: calcularVistasCamara (utilidad de cámara genérica y pura,
// sin ningún acoplamiento a dientes/clínica — es la misma matemática
// de "encuadrar una caja" que usaría cualquier visor 3D) para que las
// 3 vistas y el reset funcionen, y para que la cámara inicial
// encuadre TODO el modelo automáticamente.
//
// Flujo literal: Blender → odontograma.glb → GLTFLoader → <primitive
// object={scene} /> → pantalla. Nada intermedio.
// ============================================================

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { calcularVistasCamara } from './calcularEncuadreCamara'

const RUTA_MODELO = '/models/odontograma.glb'
const VISTAS = [
  { id: 'restablecer', etiqueta: 'Restablecer' },
  { id: 'frontal', etiqueta: 'Frontal' },
  { id: 'oclusal', etiqueta: 'Oclusal' },
  { id: 'lateral', etiqueta: 'Lateral' },
]

function EscenaDirecta({ vista }) {
  const { scene } = useGLTF(RUTA_MODELO)
  const { camera } = useThree()
  const controlsRef = useRef()

  // Box3 sobre `scene` tal cual la entrega el GLTFLoader — sin ningún
  // ajuste manual. Ya incluye automáticamente la orientación propia
  // de cada nodo (el quaternion horneado por el exportador), porque
  // <primitive object={scene} /> renderiza el árbol de objetos real,
  // no geometría extraída a mano.
  const { centro, tamano, distanciaModelo } = useMemo(() => {
    const caja = new Box3().setFromObject(scene)
    const c = new Vector3()
    const t = new Vector3()
    caja.getCenter(c)
    caja.getSize(t)
    return { centro: c.toArray(), tamano: t.toArray(), distanciaModelo: Math.max(t.x, t.y, t.z) }
  }, [scene])

  const vistasCamara = useMemo(
    () => calcularVistasCamara({ centro, tamano, fovGrados: 40 }),
    [centro, tamano]
  )

  useEffect(() => {
    const destino = vistasCamara[vista] ?? vistasCamara.restablecer
    camera.position.set(...destino.posicion)
    camera.updateProjectionMatrix()
    if (controlsRef.current) {
      controlsRef.current.target.set(...destino.target)
      controlsRef.current.update()
    }
  }, [vista, vistasCamara, camera])

  return (
    <>
      {/* La escena completa, sin tocar nada — ni posición, ni rotación,
          ni escala, ni geometry.center(). Literalmente lo que exportó Blender. */}
      <primitive object={scene} />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.15}
        minDistance={distanciaModelo * 0.1}
        maxDistance={distanciaModelo * 6}
      />
    </>
  )
}

function CargandoModeloDirecto() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Cargando modelo…
    </div>
  )
}

export function Odontograma3DDirectoGLB() {
  const [vista, setVista] = useState('restablecer')
  const [claveReset, setClaveReset] = useState(0)

  return (
    <div>
      <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠ Prueba de arquitectura — escena del <code>.glb</code> mostrada tal cual, sin ninguna
        reconstrucción por diente. No usa datos clínicos ni reemplaza el odontograma actual.
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {VISTAS.map((v) => (
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
            <EscenaDirecta key={claveReset} vista={vista} />
          </Suspense>
        </Canvas>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Arrastra para rotar, rueda del mouse para zoom. Los botones de arriba reencuadran sobre el
        centro real de toda la escena, calculado con Box3 — nada de posiciones fijas.
      </p>
    </div>
  )
}
