import { useState } from 'react'
import { actualizarPaciente } from '../../services/pacientes'
import { toastExito, toastError } from '../../store/useToastStore'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

const ESTADO_CIVIL = [
  { value: '', label: 'Sin especificar' },
  { value: 'soltero', label: 'Soltero(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'union_libre', label: 'Unión libre' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viudo', label: 'Viudo(a)' },
]
const ESCOLARIDAD = [
  { value: '', label: 'Sin especificar' },
  { value: 'sin_escolaridad', label: 'Sin escolaridad' },
  { value: 'basica', label: 'Básica' },
  { value: 'media', label: 'Media' },
  { value: 'superior', label: 'Superior' },
]
const TIPO_PACIENTE = [
  { value: '', label: 'Sin especificar' },
  { value: 'particular', label: 'Particular' },
  { value: 'referido', label: 'Referido' },
  { value: 'aseguradora', label: 'Aseguradora' },
  { value: 'convenio', label: 'Convenio' },
]
const ESTADO_EXPEDIENTE = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'de_alta', label: 'De alta' },
]

const campoVacio = (v) => v ?? ''

function datosIniciales(paciente) {
  const emergencia = paciente.contacto_emergencia || {}
  const seguro = paciente.seguro_medico || {}
  return {
    nombre_completo: campoVacio(paciente.nombre_completo),
    primer_apellido: campoVacio(paciente.primer_apellido),
    segundo_apellido: campoVacio(paciente.segundo_apellido),
    curp: campoVacio(paciente.curp),
    fecha_nacimiento: campoVacio(paciente.fecha_nacimiento),
    sexo: campoVacio(paciente.sexo),
    estado_civil: campoVacio(paciente.estado_civil),
    ocupacion: campoVacio(paciente.ocupacion),
    escolaridad: campoVacio(paciente.escolaridad),
    nacionalidad: campoVacio(paciente.nacionalidad) || 'Mexicana',
    telefono: campoVacio(paciente.telefono),
    telefono_secundario: campoVacio(paciente.telefono_secundario),
    whatsapp: campoVacio(paciente.whatsapp),
    correo: campoVacio(paciente.correo),
    calle: campoVacio(paciente.calle),
    numero_exterior: campoVacio(paciente.numero_exterior),
    numero_interior: campoVacio(paciente.numero_interior),
    colonia: campoVacio(paciente.colonia),
    municipio: campoVacio(paciente.municipio),
    estado_domicilio: campoVacio(paciente.estado_domicilio),
    codigo_postal: campoVacio(paciente.codigo_postal),
    emergencia_nombre: campoVacio(emergencia.nombre),
    emergencia_parentesco: campoVacio(emergencia.parentesco),
    emergencia_telefono: campoVacio(emergencia.telefono),
    emergencia_telefono_alterno: campoVacio(emergencia.telefono_alterno),
    seguro_aseguradora: campoVacio(seguro.aseguradora),
    seguro_numero_poliza: campoVacio(seguro.numero_poliza),
    tipo_paciente: campoVacio(paciente.tipo_paciente),
    estado_expediente: campoVacio(paciente.estado_expediente) || 'activo',
    referido_por: campoVacio(paciente.referido_por),
  }
}

function Seccion({ titulo, children }) {
  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

function Campo({ label, valor }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{valor || <span className="text-slate-300">—</span>}</div>
    </div>
  )
}

function Select({ label, value, onChange, opciones }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-clinico-azul focus:outline-none"
      >
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

export function TabDatosGenerales({ paciente, alGuardar }) {
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState(() => datosIniciales(paciente))
  const [guardando, setGuardando] = useState(false)

  const campo = (clave) => (e) => setForm((f) => ({ ...f, [clave]: e.target.value }))

  const cancelar = () => {
    setForm(datosIniciales(paciente))
    setEditando(false)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const cambios = {
        nombre_completo: form.nombre_completo,
        primer_apellido: form.primer_apellido || null,
        segundo_apellido: form.segundo_apellido || null,
        curp: form.curp || null,
        fecha_nacimiento: form.fecha_nacimiento || null,
        sexo: form.sexo || null,
        estado_civil: form.estado_civil || null,
        ocupacion: form.ocupacion || null,
        escolaridad: form.escolaridad || null,
        nacionalidad: form.nacionalidad || null,
        telefono: form.telefono || null,
        telefono_secundario: form.telefono_secundario || null,
        whatsapp: form.whatsapp || null,
        correo: form.correo || null,
        calle: form.calle || null,
        numero_exterior: form.numero_exterior || null,
        numero_interior: form.numero_interior || null,
        colonia: form.colonia || null,
        municipio: form.municipio || null,
        estado_domicilio: form.estado_domicilio || null,
        codigo_postal: form.codigo_postal || null,
        contacto_emergencia: (form.emergencia_nombre || form.emergencia_telefono)
          ? {
              nombre: form.emergencia_nombre || null,
              parentesco: form.emergencia_parentesco || null,
              telefono: form.emergencia_telefono || null,
              telefono_alterno: form.emergencia_telefono_alterno || null,
            }
          : null,
        seguro_medico: (form.seguro_aseguradora || form.seguro_numero_poliza)
          ? { aseguradora: form.seguro_aseguradora || null, numero_poliza: form.seguro_numero_poliza || null }
          : null,
        tipo_paciente: form.tipo_paciente || null,
        estado_expediente: form.estado_expediente || 'activo',
        referido_por: form.referido_por || null,
      }
      const actualizado = await actualizarPaciente(paciente.id, cambios)
      alGuardar?.(actualizado)
      setEditando(false)
      toastExito('Datos del paciente actualizados.')
    } catch (err) {
      toastError('No se pudieron guardar los cambios: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!editando) {
    const emergencia = paciente.contacto_emergencia || {}
    const seguro = paciente.seguro_medico || {}
    return (
      <div>
        <div className="mb-4 flex justify-end">
          <Button variante="secundario" onClick={() => setEditando(true)}>Editar datos</Button>
        </div>

        <Seccion titulo="Identificación">
          <Campo label="Nombre completo" valor={paciente.nombre_completo} />
          <Campo label="Primer apellido" valor={paciente.primer_apellido} />
          <Campo label="Segundo apellido" valor={paciente.segundo_apellido} />
          <Campo label="CURP" valor={paciente.curp} />
          <Campo label="Fecha de nacimiento" valor={paciente.fecha_nacimiento} />
          <Campo label="Sexo" valor={{ M: 'Masculino', F: 'Femenino', X: 'Otro' }[paciente.sexo]} />
          <Campo label="Estado civil" valor={ESTADO_CIVIL.find((e) => e.value === paciente.estado_civil)?.label} />
          <Campo label="Ocupación" valor={paciente.ocupacion} />
          <Campo label="Escolaridad" valor={ESCOLARIDAD.find((e) => e.value === paciente.escolaridad)?.label} />
          <Campo label="Nacionalidad" valor={paciente.nacionalidad} />
        </Seccion>

        <Seccion titulo="Contacto">
          <Campo label="Teléfono" valor={paciente.telefono} />
          <Campo label="Teléfono secundario" valor={paciente.telefono_secundario} />
          <Campo label="WhatsApp" valor={paciente.whatsapp} />
          <Campo label="Correo electrónico" valor={paciente.correo} />
        </Seccion>

        <Seccion titulo="Domicilio">
          <Campo label="Calle" valor={paciente.calle} />
          <Campo label="Número exterior" valor={paciente.numero_exterior} />
          <Campo label="Número interior" valor={paciente.numero_interior} />
          <Campo label="Colonia" valor={paciente.colonia} />
          <Campo label="Municipio/Alcaldía" valor={paciente.municipio} />
          <Campo label="Estado" valor={paciente.estado_domicilio} />
          <Campo label="Código postal" valor={paciente.codigo_postal} />
          {!paciente.calle && paciente.direccion && <Campo label="Domicilio (texto libre, sin estructurar)" valor={paciente.direccion} />}
        </Seccion>

        <Seccion titulo="Contacto de emergencia">
          <Campo label="Nombre completo" valor={emergencia.nombre} />
          <Campo label="Parentesco" valor={emergencia.parentesco} />
          <Campo label="Teléfono" valor={emergencia.telefono} />
          <Campo label="Teléfono alterno" valor={emergencia.telefono_alterno} />
        </Seccion>

        <Seccion titulo="Administrativo">
          <Campo label="Número de expediente" valor={paciente.numero_expediente} />
          <Campo label="Fecha de alta" valor={paciente.creado_en ? new Date(paciente.creado_en).toLocaleDateString('es-MX') : null} />
          <Campo label="Tipo de paciente" valor={TIPO_PACIENTE.find((t) => t.value === paciente.tipo_paciente)?.label} />
          <Campo label="Estado del expediente" valor={ESTADO_EXPEDIENTE.find((e) => e.value === paciente.estado_expediente)?.label} />
          <Campo label="Aseguradora" valor={seguro.aseguradora} />
          <Campo label="Número de póliza" valor={seguro.numero_poliza} />
          <Campo label="Referido por" valor={paciente.referido_por} />
        </Seccion>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button variante="secundario" onClick={cancelar} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
      </div>

      <Seccion titulo="Identificación">
        <Input label="Nombre completo" value={form.nombre_completo} onChange={campo('nombre_completo')} />
        <Input label="Primer apellido" value={form.primer_apellido} onChange={campo('primer_apellido')} />
        <Input label="Segundo apellido" value={form.segundo_apellido} onChange={campo('segundo_apellido')} />
        <Input label="CURP" value={form.curp} onChange={campo('curp')} maxLength={18} className="uppercase" />
        <Input label="Fecha de nacimiento" type="date" value={form.fecha_nacimiento} onChange={campo('fecha_nacimiento')} />
        <Select label="Sexo" value={form.sexo} onChange={campo('sexo')} opciones={[{ value: '', label: 'Sin especificar' }, { value: 'M', label: 'Masculino' }, { value: 'F', label: 'Femenino' }, { value: 'X', label: 'Otro' }]} />
        <Select label="Estado civil" value={form.estado_civil} onChange={campo('estado_civil')} opciones={ESTADO_CIVIL} />
        <Input label="Ocupación" value={form.ocupacion} onChange={campo('ocupacion')} />
        <Select label="Escolaridad" value={form.escolaridad} onChange={campo('escolaridad')} opciones={ESCOLARIDAD} />
        <Input label="Nacionalidad" value={form.nacionalidad} onChange={campo('nacionalidad')} />
      </Seccion>

      <Seccion titulo="Contacto">
        <Input label="Teléfono" value={form.telefono} onChange={campo('telefono')} />
        <Input label="Teléfono secundario" value={form.telefono_secundario} onChange={campo('telefono_secundario')} />
        <Input label="WhatsApp" value={form.whatsapp} onChange={campo('whatsapp')} />
        <Input label="Correo electrónico" type="email" value={form.correo} onChange={campo('correo')} />
      </Seccion>

      <Seccion titulo="Domicilio">
        <Input label="Calle" value={form.calle} onChange={campo('calle')} />
        <Input label="Número exterior" value={form.numero_exterior} onChange={campo('numero_exterior')} />
        <Input label="Número interior" value={form.numero_interior} onChange={campo('numero_interior')} />
        <Input label="Colonia" value={form.colonia} onChange={campo('colonia')} />
        <Input label="Municipio/Alcaldía" value={form.municipio} onChange={campo('municipio')} />
        <Input label="Estado" value={form.estado_domicilio} onChange={campo('estado_domicilio')} />
        <Input label="Código postal" value={form.codigo_postal} onChange={campo('codigo_postal')} maxLength={5} />
      </Seccion>

      <Seccion titulo="Contacto de emergencia">
        <Input label="Nombre completo" value={form.emergencia_nombre} onChange={campo('emergencia_nombre')} />
        <Input label="Parentesco" value={form.emergencia_parentesco} onChange={campo('emergencia_parentesco')} />
        <Input label="Teléfono" value={form.emergencia_telefono} onChange={campo('emergencia_telefono')} />
        <Input label="Teléfono alterno" value={form.emergencia_telefono_alterno} onChange={campo('emergencia_telefono_alterno')} />
      </Seccion>

      <Seccion titulo="Administrativo">
        <Select label="Tipo de paciente" value={form.tipo_paciente} onChange={campo('tipo_paciente')} opciones={TIPO_PACIENTE} />
        <Select label="Estado del expediente" value={form.estado_expediente} onChange={campo('estado_expediente')} opciones={ESTADO_EXPEDIENTE} />
        <Input label="Aseguradora" value={form.seguro_aseguradora} onChange={campo('seguro_aseguradora')} />
        <Input label="Número de póliza" value={form.seguro_numero_poliza} onChange={campo('seguro_numero_poliza')} />
        <Input label="Referido por" value={form.referido_por} onChange={campo('referido_por')} />
      </Seccion>
    </div>
  )
}
