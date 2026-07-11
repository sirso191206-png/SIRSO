import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useExpediente } from '../../hooks/useExpediente'
import { useTratamientos } from '../../hooks/useTratamientos'
import { usePagos } from '../../hooks/usePagos'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'

// Próxima cita y última consulta completada — datos puntuales que no
// tienen hook propio todavía, se piden directo aquí (mismo patrón que
// ya usan Historial y Mi día).
function useCitasResumen(pacienteId) {
  const [proximaCita, setProximaCita] = useState(null)
  const [ultimaConsulta, setUltimaConsulta] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    Promise.all([
      supabase
        .from('citas')
        .select('inicio, motivo_consulta, tipo_consulta')
        .eq('paciente_id', pacienteId)
        .gte('inicio', new Date().toISOString())
        .not('estado', 'in', '(cancelada,completada,no_asistio)')
        .order('inicio')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('citas')
        .select('inicio, motivo_consulta')
        .eq('paciente_id', pacienteId)
        .eq('estado', 'completada')
        .order('inicio', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]).then(([proxima, ultima]) => {
      if (!activo) return
      setProximaCita(proxima.data ?? null)
      setUltimaConsulta(ultima.data ?? null)
      setCargando(false)
    })
    return () => { activo = false }
  }, [pacienteId])

  return { proximaCita, ultimaConsulta, cargando }
}

export function TabResumen({ pacienteId, onIrA, onNuevaConsulta, iniciandoConsulta }) {
  const navigate = useNavigate()
  const { expediente, notas, cargando: cargandoExp } = useExpediente(pacienteId)
  const { tratamientos, cargando: cargandoTrat } = useTratamientos(pacienteId)
  const { saldo, cargando: cargandoSaldo } = usePagos(pacienteId)
  const { proximaCita, ultimaConsulta, cargando: cargandoCitas } = useCitasResumen(pacienteId)

  if (cargandoExp || cargandoTrat || cargandoSaldo || cargandoCitas || !expediente) {
    return <p className="text-slate-400">Cargando…</p>
  }

  const tratamientoActivo = tratamientos.find((t) => ['planeado', 'aceptado', 'en_progreso', 'pausado'].includes(t.estado))
  const ultimaNota = notas[0]
  const alergias = expediente.alergias ?? []
  const enfermedades = expediente.enfermedades ?? []
  const medicamentos = expediente.medicamentos_actuales ?? []

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {(alergias.length > 0 || enfermedades.length > 0 || medicamentos.length > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 lg:col-span-2">
          <div className="mb-2 text-sm font-semibold text-clinico-rojo">Información médica</div>
          <div className="space-y-1 text-sm text-red-800">
            {alergias.map((a, i) => <div key={`a-${i}`}>⚠ Alergia: {a.sustancia} ({a.severidad})</div>)}
            {enfermedades.map((e, i) => <div key={`e-${i}`}>{e}</div>)}
            {medicamentos.length > 0 && <div>Medicamentos actuales: {medicamentos.join(', ')}</div>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">Última consulta</div>
        {ultimaConsulta ? (
          <div className="text-sm text-slate-600">
            <div>{new Date(ultimaConsulta.inicio).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            {ultimaConsulta.motivo_consulta && <div className="text-xs text-slate-400">Motivo: {ultimaConsulta.motivo_consulta}</div>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin consultas completadas todavía.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">Próxima cita</div>
        {proximaCita ? (
          <div className="text-sm text-slate-600">
            <div>
              {new Date(proximaCita.inicio).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
              {' · '}
              {new Date(proximaCita.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {proximaCita.motivo_consulta && <div className="text-xs text-slate-400">{proximaCita.motivo_consulta}</div>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin cita programada.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">Tratamiento activo</div>
        {tratamientoActivo ? (
          <div className="text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{tratamientoActivo.descripcion}</span>
              <Badge estado={tratamientoActivo.estado} />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Sesiones: {tratamientoActivo.sesiones_completadas} de {tratamientoActivo.numero_sesiones} · ${Number(tratamientoActivo.costo).toFixed(2)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin tratamiento activo.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-700">Saldo</div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-400">Costo</div>
            <div className="font-medium text-slate-700">${Number(saldo.total_tratamientos).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Pagado</div>
            <div className="font-medium text-clinico-verde">${Number(saldo.total_pagado).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Pendiente</div>
            <div className={`font-medium ${saldo.saldo > 0 ? 'text-clinico-ambar' : 'text-slate-400'}`}>${Number(saldo.saldo).toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
        <div className="mb-2 text-sm font-semibold text-slate-700">Última nota</div>
        {ultimaNota ? (
          <div className="text-sm text-slate-600">
            <p>"{ultimaNota.contenido}"</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(ultimaNota.creado_en).toLocaleDateString('es-MX')}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin notas todavía.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
        <div className="mb-3 text-sm font-semibold text-slate-700">Acciones rápidas</div>
        <div className="flex flex-wrap gap-2">
          {onNuevaConsulta && (
            <Button onClick={onNuevaConsulta} disabled={iniciandoConsulta}>
              {iniciandoConsulta ? 'Iniciando…' : 'Nueva consulta'}
            </Button>
          )}
          <Button variante="secundario" onClick={() => onIrA('Historial')}>Ver historial</Button>
          <Button variante="secundario" onClick={() => onIrA('Plan')}>Registrar pago</Button>
          <Button variante="secundario" onClick={() => navigate('/agenda')}>Programar cita</Button>
        </div>
      </div>
    </div>
  )
}
