import { useEffect, useState } from 'react'
import { obtenerMiClinica, actualizarMiClinica, subirLogoClinica } from '../services/clinicas'
import { useAuthStore } from '../store/useAuthStore'
import { toastExito, toastError } from '../store/useToastStore'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

const TIPOS_ESTABLECIMIENTO = [
  'Consultorio dental',
  'Clínica dental',
  'Clínica multidisciplinaria',
  'Hospital',
  'Otro'
]

export function ConfiguracionClinica() {
  const perfil = useAuthStore((s) => s.perfil)
  const [form, setForm] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)

  useEffect(() => {
    if (!perfil?.clinica_id) return
    obtenerMiClinica(perfil.clinica_id)
      .then(setForm)
      .catch((err) => toastError('No se pudo cargar: ' + err.message))
      .finally(() => setCargando(false))
  }, [perfil?.clinica_id])

  if (!['owner'].includes(perfil?.rol)) {
    return <p className="text-slate-400">Esta sección solo está disponible para el owner de la clínica.</p>
  }

  if (cargando || !form) return <p className="text-slate-400">Cargando…</p>

  const handleChange = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

  const handleLogo = async (e) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setSubiendoLogo(true)
    try {
      const actualizado = await subirLogoClinica(perfil.clinica_id, archivo)
      setForm((f) => ({ ...f, logo_url: actualizado.logo_url }))
      toastExito('Logo actualizado — ya aparece en las recetas nuevas.')
    } catch (err) {
      toastError('No se pudo subir el logo: ' + err.message)
    } finally {
      setSubiendoLogo(false)
      e.target.value = ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await actualizarMiClinica(perfil.clinica_id, {
        nombre: form.nombre,
        tipo_establecimiento: form.tipo_establecimiento || null,
        clave_unidad_medica: form.clave_unidad_medica || null,
        direccion: form.direccion || null,
        telefono: form.telefono || null,
        correo: form.correo || null,
        responsable_sanitario: form.responsable_sanitario || null
      })
      toastExito('Datos del establecimiento actualizados.')
    } catch (err) {
      toastError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Datos del establecimiento</h1>
        <p className="text-sm text-slate-500">
          Identificación del consultorio o clínica — aparece en recibos, recetas y documentos impresos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo de la clínica" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] text-slate-400">Sin logo</span>
            )}
          </div>
          <div>
            <label className="inline-block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {subiendoLogo ? 'Subiendo…' : form.logo_url ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogo} disabled={subiendoLogo} />
            </label>
            <p className="mt-1 text-xs text-slate-400">Aparece en recetas y documentos impresos.</p>
          </div>
        </div>

        <Input label="Nombre del establecimiento" required value={form.nombre} onChange={handleChange('nombre')} />

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tipo de establecimiento</span>
          <select
            value={form.tipo_establecimiento ?? ''}
            onChange={handleChange('tipo_establecimiento')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin especificar</option>
            {TIPOS_ESTABLECIMIENTO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <Input
          label="Clave o número de unidad médica (opcional)"
          value={form.clave_unidad_medica ?? ''}
          onChange={handleChange('clave_unidad_medica')}
        />

        <Input label="Domicilio" value={form.direccion ?? ''} onChange={handleChange('direccion')} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Teléfono" value={form.telefono ?? ''} onChange={handleChange('telefono')} />
          <Input label="Correo electrónico" type="email" value={form.correo ?? ''} onChange={handleChange('correo')} />
        </div>

        <Input
          label="Responsable sanitario"
          value={form.responsable_sanitario ?? ''}
          onChange={handleChange('responsable_sanitario')}
          placeholder="Nombre completo"
        />

        <Button type="submit" disabled={guardando} className="w-full">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>
    </div>
  )
}
