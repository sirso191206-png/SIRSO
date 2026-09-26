import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useExpediente } from '../../hooks/useExpediente'
import { useTratamientos } from '../../hooks/useTratamientos'
import { usePagos } from '../../hooks/usePagos'
import { useAuthStore } from '../../store/useAuthStore'
import { toastError } from '../../store/useToastStore'
import { imprimirRecibo } from '../tratamientos/imprimirRecibo'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Icon } from '../ui/Icon'

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

export function TabResumen({ pacienteId, paciente, onIrA, onNuevaConsulta, iniciandoConsulta }) {
  const navigate = useNavigate()
  const perfil = useAuthStore((s) => s.perfil)
  const { expediente, notas, cargando: cargandoExp } = useExpediente(pacienteId)
  const { tratamientos, cargando: cargandoTrat } = useTratamientos(pacienteId)
  const { pagos, saldo, cargando: cargandoSaldo } = usePagos(pacienteId)
  const { proximaCita, ultimaConsulta, cargando: cargandoCitas } = useCitasResumen(pacienteId)
  const [imprimiendoComprobante, setImprimiendoComprobante] = useState(false)

  if (cargandoExp || cargandoTrat || cargandoSaldo || cargandoCitas || !expediente) {
    return <p className="text-slate-400">Cargando…</p>
  }

  const tratamientoActivo = tratamientos.find((t) => ['planeado', 'aceptado', 'en_progreso', 'pausado'].includes(t.estado))
  const ultimaNota = notas[0]
  const alergias = expediente.alergias ?? []
  const enfermedades = expediente.enfermedades ?? []
  const medicamentos = expediente.medicamentos_actuales ?? []
  const ultimoPago = pagos[0] ?? null
  const estadoPago = saldo.saldo > 0 ? 'Pendiente' : Number(saldo.total_tratamientos) > 0 ? 'Al corriente' : 'Sin cargos'

  const handleGenerarComprobante = async () => {
    if (!ultimoPago) return
    setImprimiendoComprobante(true)
    try {
      await imprimirRecibo({ pago: ultimoPago, paciente, clinicaId: perfil?.clinica_id })
    } catch (err) {
      toastError('No se pudo generar el comprobante: ' + err.message)
    } finally {
      setImprimiendoComprobante(false)
    }
  }

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

      <div className="rounded-xl border-2 border-clinico-azul bg-white p-4 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Icon.dollar /> Saldo</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              estadoPago === 'Pendiente' ? 'bg-amber-100 text-amber-800'
                : estadoPago === 'Al corriente' ? 'bg-green-100 text-green-800'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {estadoPago}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-400">Total</div>
            <div className="text-2xl font-bold text-slate-800">${Number(saldo.total_tratamientos).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Pagado</div>
            <div className="text-2xl font-bold text-clinico-verde">${Number(saldo.total_pagado).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Pendiente</div>
            <div className={`text-2xl font-bold ${saldo.saldo > 0 ? 'text-clinico-ambar' : 'text-slate-300'}`}>
              ${Number(saldo.saldo).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Último pago</div>
            {ultimoPago ? (
              <div>
                <div className="text-lg font-semibold text-slate-700">${Number(ultimoPago.monto).toFixed(2)}</div>
                <div className="text-xs text-slate-400">
                  {new Date(ultimoPago.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  {ultimoPago.tipo !== 'pago' && ` · ${ultimoPago.tipo}`}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-300">—</div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Button variante="secundario" onClick={() => onIrA('Plan')} className="inline-flex items-center gap-1.5">
            <Icon.dollar /> Registrar pago
          </Button>
          <Button variante="secundario" onClick={() => onIrA('Historial', 'pago')} className="inline-flex items-center gap-1.5">
            <Icon.clipboard /> Ver historial de pagos
          </Button>
          <Button variante="secundario" onClick={handleGenerarComprobante} disabled={!ultimoPago || imprimiendoComprobante} className="inline-flex items-center gap-1.5">
            {imprimiendoComprobante ? 'Generando…' : (<><Icon.printer /> Generar comprobante</>)}
          </Button>
        </div>
      </div>

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

      <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
        <div className="mb-2 text-sm font-semibold text-slate-700">Última nota</div>
        {ultimaNota ? (
          <div className="text-sm text-slate-600">
            <p>"{ultimaNota.contenido}"</p>
            {ultimaNota.diagnostico_cie10_codigo && (
              <p className="mt-1 inline-block rounded bg-clinico-azulClaro px-1.5 py-0.5 text-xs font-medium text-clinico-azul">
                {ultimaNota.diagnostico_cie10_codigo} — {ultimaNota.diagnostico_cie10_descripcion}
              </p>
            )}
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
          <Button variante="secundario" onClick={() => navigate('/agenda')}>Programar cita</Button>
        </div>
      </div>
    </div>
  )
}
