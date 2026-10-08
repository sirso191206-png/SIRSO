// ============================================================
// OdontogramaGLBScene — la ÚNICA forma de cargar y mostrar la escena
// de odontograma.glb en todo el proyecto.
// ------------------------------------------------------------
// Usado por: EscenaDental3D.jsx (odontograma clínico real).
//
// Antes existían DOS implementaciones separadas de "cargar el glb +
// calcular cámara" — una para una prueba de referencia (ya retirada,
// cumplió su objetivo de validar que el .glb se veía correcto), otra
// para lo clínico. Aunque tuvieran los mismos números, nada
// garantizaba que siguieran iguales para siempre; un cambio futuro en
// una y no en la otra las habría hecho divergir sin que nadie lo
// notara hasta verlo en pantalla. Con un solo componente compartido,
// eso es estructuralmente imposible — por eso se conserva esta
// arquitectura aunque la prueba que la motivó ya no exista.
//
// Este componente NO sabe nada de estados clínicos — solo carga,
// identifica FDI, y expone hooks para que quien lo use (interactivo o
// no) decida qué hacer con cada mesh. La escena SIEMPRE se clona
// (position/rotation/scale/geometry preservados exactos — un clone()
// de Three.js no los altera) para nunca mutar la copia cacheada por
// useGLTF.
// ============================================================
//
// CICLO DE VIDA WEBGL (importa — ver también rendererControlado.js):
//   * UN renderer por <Canvas>. Al desmontar, la destrucción es ordenada y de una sola vez (dispose y luego
//     forceContextLoss), así que una destrucción normal NO imprime "Context Lost" y SÍ se libera la GPU.
//   * Una pérdida REAL de contexto se maneja: se pausa el bucle de render, se avisa, y al restaurarse se reanuda con
//     el MISMO renderer (three vuelve a subir sus recursos solo). Si no se recupera, se ofrece reintentar (un
//     <Canvas> nuevo; el anterior ya está perdido) o usar la vista 2D.
//   * Cada montaje clona geometrías y materiales y los libera al desmontar; la escena cacheada de useGLTF nunca se
//     dibuja ni se toca (ver clonarEscenaGLB).
//   * Ninguna animación usa requestAnimationFrame propio: todo va por useFrame, que se detiene con el bucle.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { identificarNodosPorFdi, getFDIFromObject } from './identificarNodosFdi'
import { calcularVistasCamara } from './calcularEncuadreCamara'
import { controlarDestruccion } from './rendererControlado'
import { registrarLimpiezaModelo } from './modelo3D'
import { CapaEtiquetas, ProyectorEtiquetas } from './CapaEtiquetas3D'
import { clonarEscenaGLB, liberarClonEscena } from './clonEscenaGLB'

// Se reexportan aquí por compatibilidad: quien ya importaba el clonado desde esta escena sigue funcionando.
export { clonarEscenaGLB, liberarClonEscena }

export const RUTA_MODELO_ODONTOGRAMA = '/models/odontograma.glb'
export const FOV_GRADOS_ODONTOGRAMA = 40

useGLTF.preload(RUTA_MODELO_ODONTOGRAMA)
// useGLTF también guarda en su caché las cargas FALLIDAS: "Reintentar" debe poder limpiarla.
registrarLimpiezaModelo(() => { useGLTF.clear(RUTA_MODELO_ODONTOGRAMA); useGLTF.preload(RUTA_MODELO_ODONTOGRAMA) })

function AnimadorCamara({ vistaObjetivo, controlsRef, vistasCamara }) {
  const { camera } = useThree()
  const inicio = useRef({ pos: new Vector3(), target: new Vector3() })
  const fin = useRef({ pos: new Vector3(), target: new Vector3() })
  const progreso = useRef(1)
  const DURACION = 0.3

  useEffect(() => {
    const destino = vistasCamara[vistaObjetivo] ?? vistasCamara.restablecer
    inicio.current.pos.copy(camera.position)
    inicio.current.target.copy(controlsRef.current?.target ?? new Vector3())
    fin.current.pos.set(...destino.posicion)
    fin.current.target.set(...destino.target)
    progreso.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaObjetivo, vistasCamara])

  useFrame((_, delta) => {
    if (progreso.current >= 1) return
    progreso.current = Math.min(1, progreso.current + delta / DURACION)
    const t = 1 - Math.pow(1 - progreso.current, 3)
    camera.position.lerpVectors(inicio.current.pos, fin.current.pos, t)
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(inicio.current.target, fin.current.target, t)
      controlsRef.current.update()
    }
  })

  return null
}

/**
 * Vive DENTRO del <Canvas> — carga+clona la escena, calcula cámara e
 * identificación FDI, y delega toda decisión "qué hacer con cada
 * mesh" a quien use el componente, vía props (render prop / callbacks).
 */
function EscenaInterna({
  vistaCamara,
  onSeleccionFdi,
  onHoverFdi,
  renderOverlays,
  aplicarEstadosVisuales,
  onGeometriaLista,
  onListoFocusOnTooth,
  onListoControlesZoom,
}) {
  const { scene } = useGLTF(RUTA_MODELO_ODONTOGRAMA)
  const { camera } = useThree()
  const controlsRef = useRef()

  const escenaClonada = useMemo(() => clonarEscenaGLB(scene), [scene])
  // Al desmontar (salir del 3D, cambiar de paciente…) se libera todo lo que ESTE clon creó (geometrías y materiales).
  useEffect(() => () => liberarClonEscena(escenaClonada), [escenaClonada])
  const nodosPorFdi = useMemo(() => identificarNodosPorFdi(escenaClonada), [escenaClonada])

  // Bounding box mundial de cada pieza — para overlays, nunca para
  // reposicionar nada.
  const bboxPorFdi = useMemo(() => {
    const resultado = {}
    for (const [fdi, mesh] of Object.entries(nodosPorFdi)) {
      mesh.updateWorldMatrix(true, false)
      const caja = new Box3().setFromObject(mesh)
      const centro = new Vector3()
      const tam = new Vector3()
      caja.getCenter(centro)
      caja.getSize(tam)
      resultado[fdi] = { centro: centro.toArray(), tamano: tam.toArray() }
    }
    return resultado
  }, [nodosPorFdi])

  // Quien dibuja las etiquetas (DOM, fuera del Canvas) necesita saber dónde está cada pieza.
  useEffect(() => {
    onGeometriaLista?.({ nodosPorFdi, bboxPorFdi })
    return () => onGeometriaLista?.(null)
  }, [nodosPorFdi, bboxPorFdi, onGeometriaLista])

  // Cámara — SIEMPRE Box3.setFromObject sobre la escena COMPLETA
  // clonada. Ni la prueba ni lo clínico calculan esto de otra forma.
  const { centro, tamano, distanciaModelo } = useMemo(() => {
    const caja = new Box3().setFromObject(escenaClonada)
    const c = new Vector3()
    const t = new Vector3()
    caja.getCenter(c)
    caja.getSize(t)
    return { centro: c.toArray(), tamano: t.toArray(), distanciaModelo: Math.max(t.x, t.y, t.z) }
  }, [escenaClonada])

  const vistasCamara = useMemo(
    () => calcularVistasCamara({ centro, tamano, fovGrados: FOV_GRADOS_ODONTOGRAMA }),
    [centro, tamano]
  )

  // Enfocar una pieza: UNA animación a la vez (una llamada nueva reemplaza a la anterior), avanzada por useFrame — sin
  // requestAnimationFrame propio, así se detiene sola con el bucle (pérdida de contexto, desmontaje) y no puede
  // quedar corriendo ni dos animaciones peleando por la cámara.
  const animacionFoco = useRef(null)
  const focusOnTooth = useMemo(() => {
    return function focusOnTooth(fdi, { margen = 2.5, duracionMs = 400 } = {}) {
      const bbox = bboxPorFdi[String(fdi)]
      if (!bbox) return
      const tamanoMax = Math.max(...bbox.tamano)
      const distancia = (tamanoMax / 2 / Math.tan((FOV_GRADOS_ODONTOGRAMA * Math.PI) / 360)) * margen
      const objetivoActual = controlsRef.current?.target ?? new Vector3()
      const dirActual = camera.position.clone().sub(objetivoActual).normalize()
      const centroVec = new Vector3(...bbox.centro)
      animacionFoco.current = {
        inicioPos: camera.position.clone(),
        inicioTarget: objetivoActual.clone(),
        finPos: centroVec.clone().addScaledVector(dirActual, distancia),
        finTarget: centroVec,
        t0: performance.now(),
        duracionMs
      }
    }
  }, [bboxPorFdi, camera])

  useFrame(() => {
    const a = animacionFoco.current
    if (!a) return
    const t = Math.min(1, (performance.now() - a.t0) / a.duracionMs)
    const suave = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(a.inicioPos, a.finPos, suave)
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(a.inicioTarget, a.finTarget, suave)
      controlsRef.current.update()
    }
    if (t >= 1) animacionFoco.current = null
  })

  useEffect(() => { onListoFocusOnTooth?.(focusOnTooth) }, [focusOnTooth, onListoFocusOnTooth])

  const controlesZoom = useMemo(() => {
    const zoomPorFactor = (factor) => {
      if (!controlsRef.current) return
      const target = controlsRef.current.target
      const offset = camera.position.clone().sub(target)
      const min = distanciaModelo * 0.1
      const max = distanciaModelo * 5
      const nuevaDistancia = Math.min(max, Math.max(min, offset.length() * factor))
      offset.setLength(nuevaDistancia)
      camera.position.copy(target).add(offset)
      controlsRef.current.update()
    }
    return { zoomIn: () => zoomPorFactor(0.8), zoomOut: () => zoomPorFactor(1.25) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanciaModelo])

  useEffect(() => { onListoControlesZoom?.(controlesZoom) }, [controlesZoom, onListoControlesZoom])

  // Estados clínicos: si se provee la función, se llama una vez que
  // la identificación FDI está lista. Este componente NO sabe qué
  // hace esa función — solo le entrega los meshes reales.
  useEffect(() => {
    aplicarEstadosVisuales?.(nodosPorFdi)
  }, [nodosPorFdi, aplicarEstadosVisuales])

  const handleClick = onSeleccionFdi
    ? (e) => { e.stopPropagation(); const fdi = getFDIFromObject(e.object); if (fdi) onSeleccionFdi(fdi) }
    : undefined
  const handleOver = onHoverFdi
    ? (e) => { e.stopPropagation(); const fdi = getFDIFromObject(e.object); if (fdi) onHoverFdi(fdi) }
    : undefined
  const handleOut = onHoverFdi ? () => onHoverFdi(null) : undefined

  return (
    <>
      <primitive object={escenaClonada} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut} />

      {renderOverlays?.(nodosPorFdi, bboxPorFdi)}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.15}
        enablePan={false}
        minDistance={distanciaModelo * 0.1}
        maxDistance={distanciaModelo * 5}
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.95}
        target={vistasCamara.restablecer.target}
      />
      <AnimadorCamara vistaObjetivo={vistaCamara} controlsRef={controlsRef} vistasCamara={vistasCamara} />
    </>
  )
}

// Tras perder el contexto se espera esto antes de dar por perdida la recuperación y ofrecer alternativas.
const ESPERA_RECUPERACION_MS = 4000

/**
 * El <Canvas> completo, listo para usarse. `vistaCamara` acepta
 * 'restablecer' | 'frontal' | 'oclusal' | 'lateral'. El resto de props
 * son opcionales — sin ellas, se comporta exactamente como la prueba
 * de referencia (solo anatomía, sin interacción ni estados).
 *   renderOverlays(nodos, bbox)  → elementos 3D (anillos de selección…), dentro del Canvas.
 *   renderEtiquetas({nodosPorFdi, bboxPorFdi}) → [{ clave, posicion:[x,y,z], distanceFactor, children }] (DOM).
 *   onUsar2D → alternativa cuando el contexto gráfico no se recupera.
 */
export function OdontogramaGLBScene({
  vistaCamara = 'restablecer',
  onSeleccionFdi,
  onHoverFdi,
  renderOverlays,
  renderEtiquetas,
  aplicarEstadosVisuales,
  onListoFocusOnTooth,
  onListoControlesZoom,
  onUsar2D,
}) {
  const [estadoGL, setEstadoGL] = useState('ok') // 'ok' | 'perdido' | 'sin-recuperar'
  const [intento, setIntento] = useState(0)
  const [gl, setGl] = useState(null)
  const [geometria, setGeometria] = useState(null)
  const itemsRef = useRef([])
  const registroRef = useRef(new Map())

  const items = useMemo(() => (geometria && renderEtiquetas ? renderEtiquetas(geometria) : []), [geometria, renderEtiquetas])
  useEffect(() => { itemsRef.current = items }, [items])

  // Un solo renderer por Canvas: al crearse se le pone la destrucción ordenada.
  const alCrear = useCallback(({ gl: renderer }) => { setGl(controlarDestruccion(renderer)) }, [])

  // Pérdida y restauración REALES del contexto. preventDefault es lo que permite que el navegador lo restaure.
  useEffect(() => {
    if (!gl) return undefined
    const lienzo = gl.domElement
    let temporizador
    const alPerder = (evento) => {
      evento.preventDefault()
      setEstadoGL('perdido')
      clearTimeout(temporizador)
      temporizador = setTimeout(() => setEstadoGL((e) => (e === 'perdido' ? 'sin-recuperar' : e)), ESPERA_RECUPERACION_MS)
    }
    const alRestaurar = () => { clearTimeout(temporizador); setEstadoGL('ok') }
    lienzo.addEventListener('webglcontextlost', alPerder)
    lienzo.addEventListener('webglcontextrestored', alRestaurar)
    return () => {
      clearTimeout(temporizador)
      lienzo.removeEventListener('webglcontextlost', alPerder)
      lienzo.removeEventListener('webglcontextrestored', alRestaurar)
      // Destrucción inmediata del renderer. R3F también lo destruye, pero lo hace de forma diferida (varios segundos
      // después); mientras tanto el contexto de la GPU seguiría ocupado, y con alternancias rápidas 2D↔3D podrían
      // coincidir varios. Se hace en el siguiente turno (setTimeout 0) para que R3F ya haya detenido su bucle de render
      // en este mismo desmontaje — así nunca se pinta sobre un contexto ya soltado. Es idempotente (ver
      // rendererControlado.js): la llamada posterior de R3F no hace nada.
      setTimeout(() => gl.forceContextLoss(), 0)
    }
  }, [gl])

  const reintentar = () => { setEstadoGL('ok'); setGl(null); setGeometria(null); setIntento((n) => n + 1) }

  return (
    <div className="relative h-full w-full">
      <Canvas
        key={intento}
        shadows={false}
        camera={{ position: [0, 0, 10], fov: FOV_GRADOS_ODONTOGRAMA }}
        dpr={[1, 1.5]}
        frameloop={estadoGL === 'ok' ? 'always' : 'never'}
        onCreated={alCrear}
      >
        <color attach="background" args={['#F8FAFC']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[2.5, 4, 3]} intensity={0.6} />
        <directionalLight position={[-2.5, -1.5, 2]} intensity={0.25} />

        {/* Suspense AQUÍ (no en cada consumidor) — así ninguno de los
            dos usos (prueba directa / odontograma clínico) puede
            olvidarse de envolverlo, ni divergir en cómo lo hace. */}
        <Suspense fallback={null}>
          <EscenaInterna
            vistaCamara={vistaCamara}
            onSeleccionFdi={onSeleccionFdi}
            onHoverFdi={onHoverFdi}
            renderOverlays={renderOverlays}
            aplicarEstadosVisuales={aplicarEstadosVisuales}
            onGeometriaLista={setGeometria}
            onListoFocusOnTooth={onListoFocusOnTooth}
            onListoControlesZoom={onListoControlesZoom}
          />
          <ProyectorEtiquetas itemsRef={itemsRef} registroRef={registroRef} />
        </Suspense>
      </Canvas>

      {items.length > 0 && estadoGL === 'ok' && <CapaEtiquetas items={items} registroRef={registroRef} />}

      {estadoGL !== 'ok' && (
        <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-50/90 p-6 text-center text-sm text-slate-600">
          {estadoGL === 'perdido' ? (
            <p>La vista 3D perdió la conexión con la tarjeta gráfica. Intentando recuperarla…</p>
          ) : (
            <>
              <p>No se pudo recuperar la vista 3D (la tarjeta gráfica dejó de responder).</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={reintentar} className="rounded-lg bg-clinico-azul px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Reintentar</button>
                {onUsar2D && <button onClick={onUsar2D} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">Usar vista 2D</button>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
