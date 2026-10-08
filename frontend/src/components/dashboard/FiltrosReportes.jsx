import { ESTADOS_TRATAMIENTO, OPCIONES_SEMANAS, PERIODOS_RANKING, PERIODOS_SERIE } from '../../lib/reportes'

const CAMPO = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm'

// Filtros de los reportes: período, odontólogo, sucursal y estado. Solo acotan lo que la base ya entrega a esta
// clínica; no hay forma de pedir datos de otra.
export function FiltrosReportes({ filtros, onCambiar, onLimpiar, dentistas = [], sucursales = [], puedeElegirDentista, errorRango }) {
  const cambiar = (campo) => (e) => onCambiar({ ...filtros, [campo]: campo === 'semanas' ? Number(e.target.value) : e.target.value })
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Filtros de reportes">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-slate-500">Período (ingresos y pacientes)
          <select value={filtros.periodo} onChange={cambiar('periodo')} className={CAMPO}>
            {PERIODOS_SERIE.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
          </select>
        </label>
        {filtros.periodo === 'rango' && (
          <>
            <label className="text-xs text-slate-500">Desde
              <input type="date" value={filtros.desde} onChange={cambiar('desde')} className={CAMPO} />
            </label>
            <label className="text-xs text-slate-500">Hasta
              <input type="date" value={filtros.hasta} onChange={cambiar('hasta')} className={CAMPO} />
            </label>
          </>
        )}
        <label className="text-xs text-slate-500">Semanas (citas)
          <select value={filtros.semanas} onChange={cambiar('semanas')} className={CAMPO}>
            {OPCIONES_SEMANAS.map((n) => <option key={n} value={n}>Últimas {n} semanas</option>)}
          </select>
        </label>
        {puedeElegirDentista && (
          <label className="text-xs text-slate-500">Odontólogo
            <select value={filtros.dentistaId} onChange={cambiar('dentistaId')} className={CAMPO}>
              <option value="">Todos</option>
              {dentistas.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
        )}
        {sucursales.length > 1 && (
          <label className="text-xs text-slate-500">Sucursal
            <select value={filtros.sucursalId} onChange={cambiar('sucursalId')} className={CAMPO}>
              <option value="">Todas</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs text-slate-500">Tratamientos: período
          <select value={filtros.periodoRanking} onChange={cambiar('periodoRanking')} className={CAMPO}>
            {PERIODOS_RANKING.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Tratamientos: estado
          <select value={filtros.estadoTratamiento} onChange={cambiar('estadoTratamiento')} className={CAMPO}>
            <option value="">Todos</option>
            {ESTADOS_TRATAMIENTO.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
          </select>
        </label>
      </div>
      {errorRango && <p className="mt-3 text-sm text-clinico-rojo" role="alert">{errorRango}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <button onClick={onLimpiar} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50">Limpiar filtros</button>
        <span>El filtro de odontólogo no aplica a ingresos (los cobra recepción) y el de sucursal no aplica a pacientes nuevos.</span>
      </div>
    </div>
  )
}
