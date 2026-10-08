import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Odontograma } from '../../src/components/odontograma/Odontograma.jsx'
import '../../src/index.css'

function Simulador() {
  const [paciente, setPaciente] = useState('pac-A')
  const [montado, setMontado] = useState(true)
  const [otraPestana, setOtraPestana] = useState(false)
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button id="pac-A" onClick={() => setPaciente('pac-A')}>Paciente A</button>
        <button id="pac-B" onClick={() => setPaciente('pac-B')}>Paciente B</button>
        <button id="alternar-montaje" onClick={() => setMontado((m) => !m)}>{montado ? 'Desmontar' : 'Montar'} odontograma</button>
        <button id="otra-pestana" onClick={() => setOtraPestana((o) => !o)}>Pestaña {otraPestana ? 'Odontograma' : 'Otra'}</button>
        <span id="estado">{paciente}|{montado ? 'montado' : 'desmontado'}|{otraPestana ? 'otra' : 'odonto'}</span>
      </div>
      {montado && !otraPestana && <Odontograma pacienteId={paciente} />}
    </div>
  )
}
const estricto = new URLSearchParams(location.search).get('strict') !== '0'
const arbol = <BrowserRouter><Simulador /></BrowserRouter>
ReactDOM.createRoot(document.getElementById('root')).render(estricto ? <React.StrictMode>{arbol}</React.StrictMode> : arbol)
