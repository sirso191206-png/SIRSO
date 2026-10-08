import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { useAuthStore } from '../store/useAuthStore'
import { useDashboard } from '../hooks/useDashboard'
import { useReportesSeries } from '../hooks/useReportesSeries'
import { useSucursales } from '../hooks/useSucursales'
import { useFuncionalidad } from '../hooks/useFuncionalidad'
import { listarDentistas } from '../services/usuarios'
import { registrarExportacion } from '../services/auditoria'
import { aCsv, descargarCsv } from '../lib/csv'
import { EXPORTACIONES, FILTROS_INICIALES, resumenFiltros } from '../lib/reportes'
import { toastError, toastExito } from '../store/useToastStore'
import { Icon } from '../components/ui/Icon'
import { FiltrosReportes } from '../components/dashboard/FiltrosReportes'
import { infoEstado } from '../components/agenda/constantes'
import { etiquetaAccion, etiquetaModulo } from '../lib/auditoria'
import { TarjetaEstadistica } from '../components/dashboard/TarjetaEstadistica'
import { SeccionLista } from '../components/dashboard/SeccionLista'

function formatoMoneda(n) {
  return `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatoHora(fecha) {
  return new Date(fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export function Dashboard() {
  const perfil = useAuthStore((s) => s.perfil)
  const navigate = useNavigate()
  const { datos, cargando, error, puedeVerFinanzas, esOwner } = useDashboard()
  // Filtros y series de las gráficas (los hooks van antes de cualquier return).
  const [filtros, setFiltros] = useState(FILTROS_INICIALES)
  const [dentistas, setDentistas] = useState([])
  const { sucursales } = useSucursales()
  const puedeExportar = useFuncionalidad('reportes')
  const { series, cargando: cargandoSeries, error: errorSeries, errorRango } = useReportesSeries(filtros, { puedeVerFinanzas })
  useEffect(() => {
    if (esOwner) listarDentistas().then(setDentistas).catch(() => setDentistas([]))
  }, [esOwner])

  // Exportar deja constancia en la auditoría ANTES de entregar el archivo.
  const exportar = async (clave, filas) => {
    const { archivo, columnas } = EXPORTACIONES[clave]
    try {
      await registrarExportacion({ usuarioId: perfil.id, entidad: 'reportes', filas: filas.length, filtros: { reporte: archivo, ...resumenFiltros(filtros) } })
      descargarCsv(aCsv(columnas, filas), `${archivo}-${new Date().toISOString().slice(0, 10)}`)
      toastExito('Reporte exportado.')
    } catch (err) {
      toastError('No se pudo exportar el reporte. Intenta de nuevo.')
      console.error(err)
    }
  }

  if (cargando || !datos) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-slate-800">Hola, {perfil?.nombre?.split(' ')[0]}</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (error) return <p className="text-clinico-rojo">No se pudo cargar el panel: {error}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Hola, {perfil?.nombre?.split(' ')[0]}</h1>

      {/* Tarjetas */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TarjetaEstadistica etiqueta="Citas de hoy" valor={datos.citasHoy.length} />
        <TarjetaEstadistica etiqueta="Pacientes atendidos hoy" valor={datos.pacientesAtendidosHoy} acento="verde" />
        <TarjetaEstadistica etiqueta="Pacientes en espera" valor={datos.pacientesEnEspera} acento="ambar" />
        <TarjetaEstadistica etiqueta="Citas sin confirmar" valor={datos.citasPendientesConfirmar} acento="rojo" />
        {puedeVerFinanzas && (
          <>
            <TarjetaEstadistica etiqueta="Ingresos del día" valor={formatoMoneda(datos.ingresosHoy)} acento="verde" />
            <TarjetaEstadistica etiqueta="Ingresos del mes" valor={formatoMoneda(datos.ingresosMes)} acento="verde" />
            <TarjetaEstadistica etiqueta="Saldos pendientes" valor={formatoMoneda(datos.saldosPendientes)} acento="ambar" />
          </>
        )}
        <TarjetaEstadistica etiqueta="Tratamientos activos" valor={datos.tratamientosActivos} />
      </div>

      {/* Listas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SeccionLista
          titulo="Agenda de hoy"
          items={datos.citasHoy}
          vacio="No hay citas hoy."
          render={(c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-slate-700">{formatoHora(c.inicio)}</span>{' '}
                <span className="text-slate-600">{c.paciente?.nombre_completo}</span>
              </div>
              <EtiquetaEstado estado={c.estado} />
            </div>
          )}
        />

        <SeccionLista
          titulo="Próximas citas"
          items={datos.proximasCitas}
          vacio="No hay citas próximas."
          render={(c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="text-slate-600">{c.paciente?.nombre_completo}</span>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(c.inicio).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {formatoHora(c.inicio)}
              </span>
            </div>
          )}
        />

        <SeccionLista
          titulo="Citas sin confirmar"
          items={datos.citasSinConfirmar}
          vacio="Todo confirmado."
          render={(c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{c.paciente?.nombre_completo}</span>
              <span className="text-xs text-slate-400">
                {new Date(c.inicio).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {formatoHora(c.inicio)}
              </span>
            </div>
          )}
        />

        <SeccionLista
          titulo="Tratamientos pendientes"
          items={datos.tratamientosPendientes}
          vacio="Sin tratamientos pendientes."
          render={(t) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <div>
                <div className="text-slate-700">{t.descripcion}</div>
                <div className="text-xs text-slate-400">{t.paciente?.nombre_completo}</div>
              </div>
              <span className="text-xs capitalize text-slate-500">{t.estado.replace('_', ' ')}</span>
            </div>
          )}
        />

        {puedeVerFinanzas && (
          <SeccionLista
            titulo="Pagos recientes"
            items={datos.pagosRecientes}
            vacio="Sin pagos registrados."
            render={(p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{p.paciente?.nombre_completo}</span>
                <span className="font-medium text-clinico-verde">{formatoMoneda(p.monto)}</span>
              </div>
            )}
          />
        )}

        {puedeVerFinanzas && (
          <SeccionLista
            titulo="Pacientes con saldo pendiente"
            items={datos.pacientesConSaldo}
            vacio="Nadie debe saldo."
            render={(s) => (
              <button
                key={s.paciente_id}
                onClick={() => navigate(`/pacientes/${s.paciente_id}`)}
                className="flex w-full items-center justify-between text-left text-sm hover:text-clinico-azul"
              >
                <span className="text-slate-600">{s.nombre_completo}</span>
                <span className="font-medium text-clinico-ambar">{formatoMoneda(s.saldo)}</span>
              </button>
            )}
          />
        )}

        {esOwner && (
          <SeccionLista
            titulo="Actividad reciente"
            items={datos.actividadReciente}
            vacio="Sin actividad reciente."
            render={(a) => (
              <div key={a.id} className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{a.usuario?.nombre ?? 'Usuario eliminado'}</span>
                {' '}{etiquetaAccion(a.accion)}
                <span className="text-slate-400"> · {etiquetaModulo(a.entidad)}</span>
                <span className="ml-1 text-slate-400">· {new Date(a.creado_en).toLocaleString('es-MX')}</span>
              </div>
            )}
          />
        )}
      </div>

      {/* Filtros y gráficas */}
      <FiltrosReportes
        filtros={filtros}
        onCambiar={setFiltros}
        onLimpiar={() => setFiltros(FILTROS_INICIALES)}
        dentistas={dentistas}
        sucursales={sucursales.filter((s) => s.activa)}
        puedeElegirDentista={esOwner}
        errorRango={errorRango}
      />

      {errorSeries && <p className="text-sm text-clinico-rojo" role="alert">{errorSeries}</p>}
      {cargandoSeries && !series && !errorRango && <p className="text-sm text-slate-400">Cargando gráficas…</p>}

      {series && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {puedeVerFinanzas && series.ingresosPorMes && (
            <GraficaTarjeta titulo="Ingresos por mes" onExportar={puedeExportar ? () => exportar('ingresos', series.ingresosPorMes) : null}>
              <BarChart data={series.ingresosPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatoMoneda(v)} />
                <Bar dataKey="ingresos" fill="#1E5F8C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </GraficaTarjeta>
          )}

          <GraficaTarjeta titulo="Citas por semana" onExportar={puedeExportar ? () => exportar('citasPorSemana', series.citasPorSemana) : null}>
            <BarChart data={series.citasPorSemana}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="semana" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="completadas" name="Completadas" stackId="c" fill="#22C55E" />
              <Bar dataKey="pendientes" name="Pendientes" stackId="c" fill="#94A3B8" />
              <Bar dataKey="canceladas" name="Canceladas" stackId="c" fill="#FCA5A5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </GraficaTarjeta>

          <GraficaTarjeta titulo="Citas del mes: completadas, canceladas y pendientes" onExportar={puedeExportar ? () => exportar('citasDelMes', series.citasDelMes) : null}>
            <PieChart>
              <Pie data={series.citasDelMes.filter((d) => d.valor > 0)} dataKey="valor" nameKey="estado" outerRadius={80} label={(e) => `${e.porcentaje}%`}>
                {series.citasDelMes.filter((d) => d.valor > 0).map((d) => (
                  <Cell key={d.estado} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n, p) => [`${v} (${p.payload.porcentaje}%)`, n]} />
              <Legend />
            </PieChart>
          </GraficaTarjeta>

          <GraficaTarjeta titulo="Tratamientos más realizados" onExportar={puedeExportar ? () => exportar('tratamientos', series.tratamientosMasRealizados) : null}>
            <BarChart data={series.tratamientosMasRealizados} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="descripcion" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="cantidad" fill="#7C3AED" radius={[0, 4, 4, 0]} />
            </BarChart>
          </GraficaTarjeta>

          <GraficaTarjeta titulo="Pacientes nuevos por mes" onExportar={puedeExportar ? () => exportar('pacientesNuevos', series.pacientesNuevosPorMes) : null}>
            <LineChart data={series.pacientesNuevosPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="pacientes" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </GraficaTarjeta>
        </div>
      )}
    </div>
  )
}

function GraficaTarjeta({ titulo, children, onExportar }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
        {onExportar && (
          <button onClick={onExportar} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50" aria-label={`Exportar ${titulo} a CSV`}>
            <Icon.download /> CSV
          </button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function EtiquetaEstado({ estado }) {
  const info = infoEstado(estado)
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: info.fondo, color: info.texto }}>
      {info.label}
    </span>
  )
}
