import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { toastError, toastExito } from '../store/useToastStore'

import {
  obtenerCitasCompletadasPeriodo,
  obtenerSignosVitalesPorPacientes,
  signosVitalesMasCercanos,
  obtenerClinicaPropia,
} from '../services/sisReportes'
import { mapearRegistroSis } from '../features/interoperabilidad/sis/sis-mapper'
import { validarRegistroSis } from '../features/interoperabilidad/sis/sis-validator'
import { construirTxt, construirTxtBytes, construirNombreArchivo } from '../features/interoperabilidad/sis/sis-exporter'
import { cargarCatalogoDiagnosticos } from '../features/interoperabilidad/sis/sis-catalogs'
import { cargarEstablecimientoPorClues } from '../features/interoperabilidad/sis/sis-catalogos-supabase'
import { cifrarReporteSis } from '../features/interoperabilidad/sis/sis-cifrado-cliente'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function descargarArchivo(datos, nombreArchivo, tipoMime) {
  const blob = new Blob([datos], { type: tipoMime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

export function ReporteSis() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1) // mes actual, 1-12
  const [entidad, setEntidad] = useState('')
  const [institucion, setInstitucion] = useState('')
  const [generando, setGenerando] = useState(false)
  const [resultado, setResultado] = useState(null) // { filas, registrosValidos, nombreBase }

  const handleGenerar = async (e) => {
    e.preventDefault()
    setGenerando(true)
    setResultado(null)
    try {
      const clinica = await obtenerClinicaPropia()
      if (!clinica.clave_unidad_medica) {
        throw new Error('La clínica no tiene CLUES configurada — ve a Configuración de la clínica primero.')
      }

      const citas = await obtenerCitasCompletadasPeriodo(anio, mes)
      if (citas.length === 0) {
        toastExito('No hay citas completadas en ese periodo — nada que generar.')
        setGenerando(false)
        return
      }

      const pacienteIds = [...new Set(citas.map((c) => c.paciente.id))]
      const [todosLosSignos, diagnosticos, catalogoEstablecimiento] = await Promise.all([
        obtenerSignosVitalesPorPacientes(pacienteIds),
        cargarCatalogoDiagnosticos(),
        cargarEstablecimientoPorClues(clinica.clave_unidad_medica),
      ])

      const filas = citas.map((cita) => {
        const signosVitales = signosVitalesMasCercanos(todosLosSignos, cita.paciente.id, cita.inicio)

        const entrada = {
          clinica: { clave_unidad_medica: clinica.clave_unidad_medica, nombre: clinica.nombre },
          prestador: {
            nombre: cita.dentista.nombre,
            cedula_profesional: cita.dentista.cedula_profesional,
            curp: cita.dentista.curp,
            primer_apellido: cita.dentista.primer_apellido,
            segundo_apellido: cita.dentista.segundo_apellido,
            tipo_personal_sis: cita.dentista.tipo_personal_sis,
            pais_nacimiento: cita.dentista.pais_nacimiento,
            programa_smym_g: cita.dentista.programa_smym_g,
          },
          paciente: {
            nombre_completo: cita.paciente.nombre_completo,
            curp: cita.paciente.curp,
            sexo: cita.paciente.sexo,
            fecha_nacimiento: cita.paciente.fecha_nacimiento,
            primer_apellido: cita.paciente.primer_apellido,
            segundo_apellido: cita.paciente.segundo_apellido,
            pais_nacimiento: cita.paciente.pais_nacimiento,
            entidad_nacimiento: cita.paciente.entidad_nacimiento,
            sexo_biologico: cita.paciente.sexo_biologico,
            genero: cita.paciente.genero,
            se_autodenomina_afromexicano: cita.paciente.se_autodenomina_afromexicano,
            se_considera_indigena: cita.paciente.se_considera_indigena,
            migrante: cita.paciente.migrante,
            pais_procedencia: cita.paciente.pais_procedencia,
            derechohabiencia: cita.paciente.derechohabiencia,
          },
          cita: { inicio: cita.inicio, motivo_consulta: cita.motivo_consulta },
          notaClinica: cita.notaClinica
            ? {
                diagnostico_cie10_codigo: cita.notaClinica.diagnostico_cie10_codigo,
                hallazgos: cita.notaClinica.hallazgos,
                accion_salud_bucal: cita.notaClinica.accion_salud_bucal,
              }
            : null,
          signosVitales: signosVitales
            ? {
                presion_arterial: signosVitales.presion_arterial,
                presion_sistolica: signosVitales.presion_sistolica,
                presion_diastolica: signosVitales.presion_diastolica,
                peso: signosVitales.peso,
                estatura: signosVitales.estatura,
                temperatura: signosVitales.temperatura,
                frecuencia_cardiaca: signosVitales.frecuencia_cardiaca,
              }
            : null,
          primeraVezEnAnio: false, // sin historial año-a-año todavía — ver README (pendiente)
          catalogos: { establecimientos: catalogoEstablecimiento.establecimientos },
        }

        const { registro, advertencias } = mapearRegistroSis(entrada)
        const errores = validarRegistroSis(registro, { diagnosticos })
        const bloqueantes = advertencias.filter((a) => a.severidad === 'bloqueante')

        return {
          citaId: cita.id,
          paciente: cita.paciente.nombre_completo,
          fecha: cita.inicio,
          registro,
          advertencias,
          errores,
          listo: bloqueantes.length === 0 && errores.length === 0,
        }
      })

      const registrosValidos = filas.filter((f) => f.listo).map((f) => f.registro)
      const nombreBase = entidad && institucion
        ? construirNombreArchivo({ entidad: entidad.toUpperCase(), institucion: institucion.toUpperCase(), anio, mes }).replace(/\.TXT$/, '')
        : null

      setResultado({ filas, registrosValidos, nombreBase })
    } catch (err) {
      toastError('No se pudo generar el reporte: ' + err.message)
    } finally {
      setGenerando(false)
    }
  }

  const handleDescargarTxt = () => {
    if (!resultado?.nombreBase) {
      toastError('Completa Entidad e Institución para nombrar el archivo.')
      return
    }
    const txt = construirTxt(resultado.registrosValidos)
    descargarArchivo(txt, `${resultado.nombreBase}.TXT`, 'text/plain;charset=windows-1252')
    toastExito('Archivo .TXT descargado.')
  }

  const handleDescargarCif = async () => {
    if (!resultado?.nombreBase) {
      toastError('Completa Entidad e Institución para nombrar el archivo.')
      return
    }
    try {
      const bytes = construirTxtBytes(resultado.registrosValidos)
      const { archivo, nombreArchivo } = await cifrarReporteSis(bytes, resultado.nombreBase)
      descargarArchivo(archivo, nombreArchivo, 'application/octet-stream')
      toastExito('Archivo .CIF descargado — listo para subir a SINBA.')
    } catch (err) {
      toastError('No se pudo cifrar: ' + err.message)
    }
  }

  const totalListos = resultado?.filas.filter((f) => f.listo).length ?? 0
  const totalConProblemas = resultado ? resultado.filas.length - totalListos : 0

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-800">Generar reporte SIS — Salud Bucal</h1>
      <p className="mb-6 text-sm text-slate-500">
        Arma el archivo oficial de intercambio (GIIS-B016-04-08) a partir de las citas completadas de un periodo.
        Este módulo no implica que SIRO esté certificado ante la DGIS.
      </p>

      <form onSubmit={handleGenerar} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Mes</span>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Año</span>
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <Input label="Entidad (2 letras, ej. MC)" value={entidad} onChange={(e) => setEntidad(e.target.value)} maxLength={2} className="w-28 uppercase" />
        <Input label="Institución (3 letras, ej. SSA)" value={institucion} onChange={(e) => setInstitucion(e.target.value)} maxLength={3} className="w-32 uppercase" />
        <Button type="submit" disabled={generando}>
          {generando ? 'Generando…' : 'Generar reporte'}
        </Button>
      </form>

      {resultado && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
              {totalListos} listos para enviar
            </span>
            {totalConProblemas > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                {totalConProblemas} con problemas — no se incluyen en el archivo
              </span>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={handleDescargarTxt} disabled={totalListos === 0} variante="secundario">
              Descargar .TXT
            </Button>
            <Button onClick={handleDescargarCif} disabled={totalListos === 0}>
              Descargar .CIF (cifrado, listo para SINBA)
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Paciente</th>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {resultado.filas.map((f) => (
                  <tr key={f.citaId} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2 font-medium text-slate-800">{f.paciente}</td>
                    <td className="px-4 py-2 text-slate-500">{new Date(f.fecha).toLocaleDateString('es-MX')}</td>
                    <td className="px-4 py-2">
                      {f.listo ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Listo</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Revisar</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {f.errores.map((er, i) => (
                        <p key={`e${i}`} className="text-clinico-rojo">⛔ {er.campo}: {er.mensaje}</p>
                      ))}
                      {f.advertencias.filter((a) => a.severidad !== 'oficial').map((a, i) => (
                        <p key={`a${i}`} className={a.severidad === 'bloqueante' ? 'text-clinico-rojo' : 'text-amber-700'}>
                          {a.severidad === 'bloqueante' ? '⛔' : '⚠️'} {a.campo}: {a.mensaje}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
