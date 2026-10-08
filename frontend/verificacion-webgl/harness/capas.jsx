import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { OdontogramaGLBScene } from '../../src/components/odontograma/OdontogramaGLBScene.jsx'

const modo = new URLSearchParams(location.search).get('modo') ?? 'vacio'
const N = 64
function Html64() { return <>{Array.from({ length: N }, (_, i) => <Html key={i} position={[i * 0.1, 0, 0]} center distanceFactor={10}><span>{i}</span></Html>)}</> }
function Contenido() {
  if (modo === 'vacio') return <Canvas><mesh><boxGeometry /><meshBasicMaterial /></mesh></Canvas>
  if (modo === 'vacio_html') return <Canvas><mesh><boxGeometry /><meshBasicMaterial /></mesh><Html64 /></Canvas>
  if (modo === 'glb') return <OdontogramaGLBScene />
  if (modo === 'glb_etiq') return <OdontogramaGLBScene renderEtiquetas={() => Array.from({ length: 64 }, (_, i) => ({ clave: `e${i}`, posicion: [i * 0.05, 0, 0], distanceFactor: 10, children: <span>{i}</span> }))} />
  if (modo === 'glb_html') return <OdontogramaGLBScene renderOverlays={() => <Html64 />} />
}
function App() { const [on, setOn] = useState(true); return <div><button id="alternar" onClick={() => setOn((o) => !o)}>{on ? 'off' : 'on'}</button><div style={{ height: 300 }}>{on && <Contenido />}</div></div> }
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
