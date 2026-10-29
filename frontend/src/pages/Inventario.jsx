import { useMemo, useState } from 'react'
import { useInventario } from '../hooks/useInventario'
import { useSucursales } from '../hooks/useSucursales'
import { useCatalogoTratamientos } from '../hooks/useCatalogoTratamientos'
import { useAuthStore } from '../store/useAuthStore'
import { useSucursalStore } from '../store/useSucursalStore'
import { toastError, toastExito, toastAviso } from '../store/useToastStore'
import { agregarAReceta, actualizarCantidadReceta, quitarDeReceta, obtenerMovimientos } from '../services/inventario'
import { imprimirInventario } from '../components/inventario/imprimirInventario'
import {
  TIPOS_MOVIMIENTO, ETIQUETA_TIPO, ETIQUETA_ORIGEN, ETIQUETA_ESTADO, estadoStock, formatearCantidad, validarMovimiento,
  columnasCsvMateriales, columnasCsvMovimientos
} from '../lib/inventario'
import { aCsv, descargarCsv } from '../lib/csv'
import { fechaInputLocal } from '../lib/fechas'
import { fechaLocal } from '../lib/reportes'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Icon } from '../components/ui/Icon'

const CLASE_ESTADO = {
  agotado: 'bg-red-100 text-red-700',
  bajo: 'bg-amber-100 text-amber-800',
  ok: 'bg-emerald-100 text-emerald-700'
}

// "AAAA-MM-DD" como día LOCAL (ver CorteDeCaja: new Date('AAAA-MM-DD') sería el día anterior en México).
function limiteDelDia(fecha, fin) {
  const d = fechaLocal(fecha) || new Date(fecha)
  if (fin) d.setHours(23, 59, 59, 999)
  else d.setHours(0, 0, 0, 0)
  return d
}

export function Inventario() {
  const perfil = useAuthStore((s) => s.perfil)
  const sucursalActualId = useSucursalStore((s) => s.sucursalActualId)
  const { sucursales } = useSucursales()
  const { catalogo } = useCatalogoTratamientos()
  const inv = useInventario()
  const [verInactivos, setVerInactivos] = useState(false)
  const [modalMaterial, setModalMaterial] = useState(null) // null | 'nuevo' | material
  const [modalMovimiento, setModalMovimiento] = useState(null) // material
  const hoy = new Date()
  const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate())
  const [desde, setDesde] = useState(fechaInputLocal(haceUnMes))
  const [hasta, setHasta] = useState(fechaInputLocal(hoy))
  const [ocupado, setOcupado] = useState(false)

  const nombreSucursal = (id) => (id ? sucursales.find((s) => s.id === id)?.nombre ?? 'Sucursal' : 'General')
  const sucursalElegida = sucursales.find((s) => s.id === sucursalActualId)

  // Con una sucursal elegida arriba se ven sus materiales y los del almacén general; sin elegir, todos.
  const materialesVisibles = useMemo(() => inv.materiales
    .filter((m) => verInactivos || m.activo)
    .filter((m) => !sucursalActualId || !m.sucursal_id || m.sucursal_id === sucursalActualId), [inv.materiales, verInactivos, sucursalActualId])
  const idsVisibles = new Set(materialesVisibles.map((m) => m.id))
  const movimientosDelPeriodo = inv.movimientos.filter((v) => idsVisibles.has(v.material_id)
    && new Date(v.creado_en) >= limiteDelDia(desde, false) && new Date(v.creado_en) <= limiteDelDia(hasta, true))

  if (!['owner', 'asistente'].includes(perfil?.rol)) {
    return <p className="text-slate-400">Esta sección solo está disponible para el propietario y el asistente.</p>
  }

  // Lo exportado y lo impreso piden los movimientos del periodo al servidor (lo cargado en pantalla son los últimos 500).
  const movimientosParaReporte = async () => {
    const lista = await obtenerMovimientos({ desde: limiteDelDia(desde, false).toISOString(), hasta: limiteDelDia(hasta, true).toISOString(), limite: 5000 })
    return lista.filter((v) => idsVisibles.has(v.material_id))
  }

  const exportarMateriales = () => {
    if (materialesVisibles.length === 0) return toastError('No hay materiales que exportar.')
    descargarCsv(aCsv(columnasCsvMateriales(nombreSucursal), materialesVisibles), `inventario_${fechaInputLocal(new Date())}`)
  }

  const exportarMovimientos = async () => {
    setOcupado(true)
    try {
      const lista = await movimientosParaReporte()
      if (lista.length === 0) return toastError('No hay movimientos en este periodo.')
      descargarCsv(aCsv(columnasCsvMovimientos(), lista), `movimientos_inventario_${desde}_a_${hasta}`)
    } catch (err) {
      toastError('No se pudo exportar: ' + err.message)
    } finally {
      setOcupado(false)
    }
  }

  const imprimir = async () => {
    setOcupado(true)
    try {
      await imprimirInventario({
        clinicaId: perfil.clinica_id,
        materiales: materialesVisibles,
        movimientos: await movimientosParaReporte(),
        nombreSucursal,
        sucursalFiltro: sucursalElegida?.nombre ?? null,
        desde: limiteDelDia(desde, false),
        hasta: limiteDelDia(hasta, true)
      })
    } catch (err) {
      toastError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Inventario</h1>
          <p className="text-sm text-slate-500">Materiales, entradas y ajustes. Al registrar una sesión en la consulta se descuentan solos según la receta de cada tratamiento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" onClick={exportarMateriales} className="inline-flex items-center gap-1.5"><Icon.download /> Existencias CSV</Button>
          <Button variante="secundario" onClick={imprimir} disabled={ocupado} className="inline-flex items-center gap-1.5"><Icon.printer /> Imprimir reporte</Button>
          <Button onClick={() => setModalMaterial('nuevo')}>+ Nuevo material</Button>
        </div>
      </div>

      {inv.error && <p className="text-clinico-rojo">No se pudo cargar el inventario: {inv.error}</p>}
      {inv.pendientes.length > 0 && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {inv.pendientes.length} movimiento(s) guardado(s) sin conexión: se subirán al reconectar y el stock se actualizará entonces.
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Existencias{sucursalElegida ? ` · ${sucursalElegida.nombre} y almacén general` : ''}</h2>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver desactivados
          </label>
        </div>
        {inv.cargando ? <p className="text-slate-400">Cargando…</p> : materialesVisibles.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay materiales. Agrega el primero con «+ Nuevo material».</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2">Material</th><th>Sucursal</th><th className="text-right">Stock</th><th className="text-right">Mínimo</th><th>Estado</th><th />
                </tr>
              </thead>
              <tbody>
                {materialesVisibles.map((m) => {
                  const estado = estadoStock(m)
                  return (
                    <tr key={m.id} className={`border-b border-slate-100 ${m.activo ? '' : 'opacity-50'}`} data-material={m.id}>
                      <td className="py-2">
                        <div className="font-medium text-slate-800">{m.nombre}</div>
                        {m.categoria && <div className="text-xs text-slate-400">{m.categoria}</div>}
                      </td>
                      <td className="text-slate-500">{nombreSucursal(m.sucursal_id)}</td>
                      <td className="text-right font-semibold">{formatearCantidad(m.stock)} <span className="font-normal text-slate-400">{m.unidad}</span></td>
                      <td className="text-right text-slate-500">{formatearCantidad(m.stock_minimo)}</td>
                      <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span></td>
                      <td className="whitespace-nowrap text-right">
                        {m.activo && <Button variante="secundario" onClick={() => setModalMovimiento(m)} className="mr-1">Movimiento</Button>}
                        <Button variante="secundario" onClick={() => setModalMaterial(m)}>Editar</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RecetasPorTratamiento catalogo={catalogo} materiales={inv.materiales.filter((m) => m.activo)} recetas={inv.recetas} onCambio={inv.recargar} />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Movimientos</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs"><span className="mb-1 block text-slate-500">Desde</span>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
            <label className="text-xs"><span className="mb-1 block text-slate-500">Hasta</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></label>
            <Button variante="secundario" onClick={exportarMovimientos} disabled={ocupado} className="inline-flex items-center gap-1.5"><Icon.download /> Movimientos CSV</Button>
          </div>
        </div>
        {movimientosDelPeriodo.length === 0 ? <p className="text-sm text-slate-400">Sin movimientos en el periodo.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2">Fecha</th><th>Material</th><th>Tipo</th><th className="text-right">Cantidad</th><th className="text-right">Stock</th><th>Motivo</th><th>Registró</th>
                </tr>
              </thead>
              <tbody>
                {movimientosDelPeriodo.slice(0, 200).map((v) => (
                  <tr key={v.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap py-2 text-slate-500">{new Date(v.creado_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{v.material?.nombre}</td>
                    <td>{ETIQUETA_TIPO[v.tipo]}<span className="text-xs text-slate-400"> · {ETIQUETA_ORIGEN[v.origen]}</span></td>
                    <td className={`text-right font-medium ${Number(v.cantidad) < 0 ? 'text-clinico-rojo' : 'text-emerald-700'}`}>{Number(v.cantidad) > 0 ? '+' : ''}{formatearCantidad(v.cantidad)}</td>
                    <td className={`text-right ${Number(v.stock_resultante) < 0 ? 'text-clinico-rojo' : ''}`}>{formatearCantidad(v.stock_resultante)}</td>
                    <td className="text-slate-500">{v.motivo}</td>
                    <td className="text-slate-500">{v.usuario_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalMaterial && (
        <ModalMaterial
          material={modalMaterial === 'nuevo' ? null : modalMaterial}
          sucursales={sucursales.filter((s) => s.activa)}
          sucursalPorDefecto={sucursalActualId}
          onCerrar={() => setModalMaterial(null)}
          onCrear={inv.crear}
          onActualizar={inv.actualizar}
          onRegistrar={inv.registrar}
        />
      )}
      {modalMovimiento && (
        <ModalMovimiento material={modalMovimiento} onCerrar={() => setModalMovimiento(null)} onRegistrar={inv.registrar} />
      )}
    </div>
  )
}

function ModalMaterial({ material, sucursales, sucursalPorDefecto, onCerrar, onCrear, onActualizar, onRegistrar }) {
  const [nombre, setNombre] = useState(material?.nombre ?? '')
  const [categoria, setCategoria] = useState(material?.categoria ?? '')
  const [unidad, setUnidad] = useState(material?.unidad ?? 'pieza')
  const [minimo, setMinimo] = useState(material?.stock_minimo ?? 0)
  const [sucursalId, setSucursalId] = useState(material ? material.sucursal_id ?? '' : sucursalPorDefecto ?? '')
  const [inicial, setInicial] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    if (!nombre.trim() || !unidad.trim()) return toastError('Escribe el nombre y la unidad.')
    if (!navigator.onLine) return toastError('Dar de alta o editar materiales necesita conexión.')
    setGuardando(true)
    try {
      const datos = { nombre: nombre.trim(), categoria: categoria.trim() || null, unidad: unidad.trim(), stock_minimo: Number(minimo) || 0, sucursal_id: sucursalId || null }
      if (material) {
        await onActualizar(material.id, datos)
        toastExito('Material actualizado.')
      } else {
        const nuevo = await onCrear(datos)
        if (Number(inicial) > 0) await onRegistrar({ materialId: nuevo.id, tipo: 'entrada', cantidad: Number(inicial), motivo: 'Stock inicial' })
        toastExito('Material agregado.')
      }
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const cambiarActivo = async () => {
    setGuardando(true)
    try {
      await onActualizar(material.id, { activo: !material.activo })
      toastExito(material.activo ? 'Material desactivado: ya no se descuenta ni aparece en las recetas.' : 'Material reactivado.')
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={material ? 'Editar material' : 'Nuevo material'}>
      <form onSubmit={guardar} className="space-y-3">
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Unidad (pieza, caja, jeringa…)" value={unidad} onChange={(e) => setUnidad(e.target.value)} maxLength={30} required />
          <Input label="Categoría (opcional)" value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={60} />
          <Input label="Stock mínimo" type="number" min="0" step="any" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          {!material && <Input label="Stock inicial (opcional)" type="number" min="0" step="any" value={inicial} onChange={(e) => setInicial(e.target.value)} />}
        </div>
        {sucursales.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Sucursal</span>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              <option value="">Almacén general de la clínica</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
        )}
        {material && <p className="text-xs text-slate-500">El stock no se edita aquí: registra una entrada, salida o ajuste para que quede en el historial.</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {material ? <Button type="button" variante="secundario" onClick={cambiarActivo} disabled={guardando}>{material.activo ? 'Desactivar' : 'Reactivar'}</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variante="secundario" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function ModalMovimiento({ material, onCerrar, onRegistrar }) {
  const [tipo, setTipo] = useState('entrada')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmaNegativo, setConfirmaNegativo] = useState(false)
  const ayuda = TIPOS_MOVIMIENTO.find((t) => t.valor === tipo)?.ayuda
  // Una salida mayor a lo que hay se avisa ANTES de registrarla (antes solo se avisaba después, con el stock ya negativo).
  const dejaNegativo = tipo === 'salida' && Number(cantidad) > Number(material.stock ?? 0)

  const guardar = async (e) => {
    e.preventDefault()
    const invalido = validarMovimiento({ tipo, cantidad, motivo })
    if (invalido) return toastError(invalido)
    if (dejaNegativo && !confirmaNegativo) {
      setConfirmaNegativo(true)
      return
    }
    setGuardando(true)
    try {
      const r = await onRegistrar({ materialId: material.id, tipo, cantidad: Number(cantidad), motivo: motivo.trim() || null })
      if (r?.pendiente) toastExito('Movimiento guardado sin conexión: se subirá al reconectar.')
      else if (r?.stock_negativo) toastAviso(`Movimiento registrado, pero el stock de ${material.nombre} quedó en negativo (${formatearCantidad(r.stock)}). Revisa con un ajuste por conteo físico.`)
      else toastExito('Movimiento registrado.')
      onCerrar()
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Movimiento · ${material.nombre}`}>
      <form onSubmit={guardar} className="space-y-3">
        <p className="text-sm text-slate-500">Stock actual: <strong>{formatearCantidad(material.stock)} {material.unidad}</strong></p>
        <div className="flex gap-2">
          {TIPOS_MOVIMIENTO.map((t) => (
            <button key={t.valor} type="button" onClick={() => setTipo(t.valor)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tipo === t.valor ? 'bg-clinico-azul text-white' : 'border border-slate-300 text-slate-600'}`}>
              {t.etiqueta}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{ayuda}</p>
        <Input label={tipo === 'ajuste' ? `Stock contado (${material.unidad})` : `Cantidad (${material.unidad})`} type="number" min="0" step="any" value={cantidad} onChange={(e) => { setCantidad(e.target.value); setConfirmaNegativo(false) }} required />
        {dejaNegativo && (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Sacarías más de lo que hay ({formatearCantidad(material.stock)} {material.unidad}): el stock quedaría en negativo.
            {confirmaNegativo ? ' Vuelve a pulsar el botón para registrarlo de todos modos.' : ' Revisa la cantidad o haz primero un ajuste por conteo físico.'}
          </p>
        )}
        <Input label={tipo === 'entrada' ? 'Nota (opcional: proveedor, factura…)' : 'Motivo'} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : confirmaNegativo ? 'Registrar de todos modos' : 'Registrar'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// Receta: cuánto de cada material consume UNA sesión de cada tratamiento del catálogo.
function RecetasPorTratamiento({ catalogo, materiales, recetas, onCambio }) {
  const [catalogoId, setCatalogoId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [guardando, setGuardando] = useState(false)
  const delTratamiento = recetas.filter((r) => r.catalogo_id === catalogoId)
  const nombreMaterial = (id) => materiales.find((m) => m.id === id)
  const conReceta = new Set(recetas.map((r) => r.catalogo_id))

  const ejecutar = async (accion, exito) => {
    if (!navigator.onLine) return toastError('Editar recetas necesita conexión.')
    setGuardando(true)
    try {
      await accion()
      await onCambio()
      if (exito) toastExito(exito)
    } catch (err) {
      toastError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const agregar = (e) => {
    e.preventDefault()
    if (!materialId || !(Number(cantidad) > 0)) return toastError('Elige el material y una cantidad mayor que cero.')
    ejecutar(() => agregarAReceta({ catalogoId, materialId, cantidad }), 'Material agregado a la receta.').then(() => setMaterialId(''))
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Receta de materiales por tratamiento</h2>
      <p className="mb-3 text-xs text-slate-500">Lo que consume UNA sesión. Se descuenta al registrar la sesión en la consulta o al completar el tratamiento.</p>
      {catalogo.length === 0 ? <p className="text-sm text-slate-400">Primero da de alta tratamientos en el catálogo.</p> : (
        <>
          <select value={catalogoId} onChange={(e) => setCatalogoId(e.target.value)} className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm sm:w-96" aria-label="Tratamiento del catálogo">
            <option value="">Elige un tratamiento…</option>
            {catalogo.map((c) => <option key={c.id} value={c.id}>{c.nombre}{conReceta.has(c.id) ? ' ✓' : ''}</option>)}
          </select>
          {catalogoId && (
            <div className="space-y-2">
              {delTratamiento.length === 0 && <p className="text-sm text-slate-400">Este tratamiento todavía no descuenta materiales.</p>}
              {delTratamiento.map((r) => {
                const m = nombreMaterial(r.material_id)
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                    <span>{m?.nombre ?? 'Material desactivado'}</span>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0.01" step="any" defaultValue={r.cantidad} aria-label="Cantidad por sesión"
                        onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(r.cantidad) && ejecutar(() => actualizarCantidadReceta(r.id, e.target.value), 'Cantidad actualizada.')}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm" />
                      <span className="text-slate-400">{m?.unidad}</span>
                      <Button variante="secundario" onClick={() => ejecutar(() => quitarDeReceta(r.id), 'Material quitado de la receta.')} disabled={guardando}>Quitar</Button>
                    </div>
                  </div>
                )
              })}
              <form onSubmit={agregar} className="flex flex-wrap items-end gap-2 pt-1">
                <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" aria-label="Material">
                  <option value="">Material…</option>
                  {materiales.filter((m) => !delTratamiento.some((r) => r.material_id === m.id)).map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
                </select>
                <input type="number" min="0.01" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label="Cantidad" className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <Button type="submit" variante="secundario" disabled={guardando}>Agregar a la receta</Button>
              </form>
            </div>
          )}
        </>
      )}
    </section>
  )
}
