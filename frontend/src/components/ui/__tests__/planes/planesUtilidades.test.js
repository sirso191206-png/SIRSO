import { describe, it, expect } from 'vitest'
import {
  esIlimitado, formatearLimite, formatearPrecio, etiquetaPeriodo, precioDePlan, modalidadesPermitidas,
  porcentajeUso, nivelUso, mensajeExceso, tipoErrorDePlan, esErrorDePlan, mensajeErrorDePlan,
  funcionalidadDisponible, agruparFuncionalidades, formularioDesdePlan, validarFormularioPlan,
  planDesdeFormulario, elegirVistaDisponible, etiquetaAccionPlan, resumirCambios
} from '../../../../lib/planes.js'

describe('formato: ilimitado, precios, periodos', () => {
  it('null/undefined = ilimitado (así lo define la base); 0 NO es ilimitado', () => {
    expect(esIlimitado(null)).toBe(true)
    expect(esIlimitado(undefined)).toBe(true)
    expect(esIlimitado(0)).toBe(false)
    expect(formatearLimite(null)).toBe('Ilimitado')
    expect(formatearLimite(0)).toBe('0')
    expect(formatearLimite(7500)).toBe('7,500')
  })
  it('precios con separador de miles, moneda y guion si no hay precio', () => {
    expect(formatearPrecio(17990)).toBe('$17,990 MXN')
    expect(formatearPrecio(599.5)).toBe('$599.5 MXN')
    expect(formatearPrecio(null)).toBe('—')
    expect(formatearPrecio(10, 'USD')).toBe('$10 USD')
  })
  it('periodo y precio según modalidad', () => {
    expect(etiquetaPeriodo('anual')).toBe('año')
    expect(etiquetaPeriodo('mensual')).toBe('mes')
    const plan = { precio_mensual: 999, precio_anual: 9990 }
    expect(precioDePlan(plan, 'mensual')).toBe(999)
    expect(precioDePlan(plan, 'anual')).toBe(9990)
    expect(precioDePlan(null, 'anual')).toBeNull()
  })
  it('modalidades permitidas respetan permite_mensual / permite_anual', () => {
    expect(modalidadesPermitidas({ permite_mensual: true, permite_anual: true })).toEqual(['mensual', 'anual'])
    expect(modalidadesPermitidas({ permite_mensual: true, permite_anual: false })).toEqual(['mensual'])
    expect(modalidadesPermitidas({ permite_mensual: false, permite_anual: true })).toEqual(['anual'])
    expect(modalidadesPermitidas(null)).toEqual([])
  })
})

describe('uso y barras de progreso', () => {
  it('423 / 2,000 pacientes = 21 %', () => {
    expect(porcentajeUso(423, 2000)).toBe(21)
  })
  it('ilimitado no tiene barra; nunca pasa de 100 aunque haya excedente (clínica que bajó de plan)', () => {
    expect(porcentajeUso(5000, null)).toBeNull()
    expect(porcentajeUso(2300, 2000)).toBe(100)
  })
  it('límite 0: sin uso = 0 %, con uso = 100 % (sin dividir entre cero)', () => {
    expect(porcentajeUso(0, 0)).toBe(0)
    expect(porcentajeUso(3, 0)).toBe(100)
  })
  it('nivel: normal < 80 %, alto desde 80 %, lleno desde 100 %, null si es ilimitado', () => {
    expect(nivelUso(79, 100)).toBe('normal')
    expect(nivelUso(80, 100)).toBe('alto')
    expect(nivelUso(99, 100)).toBe('alto')
    expect(nivelUso(100, 100)).toBe('lleno')
    expect(nivelUso(2300, 2000)).toBe('lleno')
    expect(nivelUso(1, null)).toBeNull()
  })
})

describe('aviso al bajar de plan (nunca se borra nada)', () => {
  it('usa el texto pedido para pacientes: 2,300 con un plan de 2,000', () => {
    expect(mensajeExceso({ tipo: 'pacientes', usado: 2300, limite: 2000 })).toBe(
      'Tu clínica actualmente tiene 2,300 pacientes y el plan permite 2,000. Puedes seguir consultando tus registros, ' +
      'pero necesitas actualizar tu plan para registrar nuevos pacientes.')
  })
  it('se adapta a usuarios y sucursales', () => {
    expect(mensajeExceso({ tipo: 'usuarios', usado: 5, limite: 3 })).toContain('agregar nuevos usuarios')
    expect(mensajeExceso({ tipo: 'sucursales', usado: 4, limite: 3 })).toContain('activar nuevas sucursales')
  })
})

describe('errores que devuelve la base (PT402 / PT403)', () => {
  const limite = { code: 'PT402', details: 'PLAN_LIMIT_REACHED', hint: 'pacientes', message: 'Has alcanzado el límite de pacientes de tu plan (500). Contacta al administrador para ampliarlo.' }
  const feature = { code: 'PT403', details: 'FEATURE_NOT_AVAILABLE', message: 'x' }
  it('distingue límite de funcionalidad, por código o por detalle', () => {
    expect(tipoErrorDePlan(limite)).toBe('limite')
    expect(tipoErrorDePlan({ details: 'PLAN_LIMIT_REACHED' })).toBe('limite')
    expect(tipoErrorDePlan({ code: 'PT402' })).toBe('limite')
    expect(tipoErrorDePlan(feature)).toBe('funcionalidad')
    expect(tipoErrorDePlan({ code: 'PT403' })).toBe('funcionalidad')
  })
  it('NO confunde otros errores con errores de plan', () => {
    expect(esErrorDePlan({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(esErrorDePlan({ code: '42501' })).toBe(false)
    expect(esErrorDePlan(new Error('TypeError: Failed to fetch'))).toBe(false)
    expect(esErrorDePlan(null)).toBe(false)
    expect(esErrorDePlan(undefined)).toBe(false)
  })
  it('mensaje: el de la base para límites; texto fijo para funcionalidades; el original para el resto', () => {
    expect(mensajeErrorDePlan(limite)).toBe(limite.message)
    expect(mensajeErrorDePlan(feature)).toBe('Esta funcionalidad no está disponible en tu plan.')
    expect(mensajeErrorDePlan(new Error('otra cosa'))).toBe('otra cosa')
    expect(mensajeErrorDePlan(null)).toBe('Error desconocido')
  })
})

describe('funcionalidadDisponible — solo oculta interfaz; ante la duda NO oculta', () => {
  const susc = { funcionalidades: [{ codigo: 'periodontograma', habilitada: false }, { codigo: 'pagos', habilitada: true }] }
  it('habilitada=false se oculta; habilitada=true se muestra', () => {
    expect(funcionalidadDisponible(susc, 'periodontograma')).toBe(false)
    expect(funcionalidadDisponible(susc, 'pagos')).toBe(true)
  })
  it('sin suscripción cargada, clínica anterior a los planes, código desconocido o sin código: se muestra', () => {
    expect(funcionalidadDisponible(null, 'periodontograma')).toBe(true)
    expect(funcionalidadDisponible({ sin_suscripcion: true, funcionalidades: [{ codigo: 'periodontograma', habilitada: false }] }, 'periodontograma')).toBe(true)
    expect(funcionalidadDisponible(susc, 'algo_que_no_existe')).toBe(true)
    expect(funcionalidadDisponible(susc, undefined)).toBe(true)
  })
})

describe('agruparFuncionalidades / elegirVistaDisponible', () => {
  it('agrupa por categoría con su etiqueta', () => {
    const g = agruparFuncionalidades([{ codigo: 'a', categoria: 'clinico' }, { codigo: 'b', categoria: 'agenda' }, { codigo: 'c', categoria: 'clinico' }])
    expect(g.map((x) => x.etiqueta)).toEqual(['Clínico', 'Agenda'])
    expect(g[0].items.map((x) => x.codigo)).toEqual(['a', 'c'])
  })
  it('la vista guardada se respeta si el plan la incluye; si no, cae a la primera disponible; sin ninguna, null', () => {
    expect(elegirVistaDisponible('3d', ['2d', '3d'])).toBe('3d')
    expect(elegirVistaDisponible('3d', ['2d', 'hoja'])).toBe('2d')
    expect(elegirVistaDisponible('3d', [])).toBeNull()
  })
})

describe('formulario de plan: validación (mismas reglas que la base) y conversión', () => {
  const valido = () => formularioDesdePlan({ plan: 'pro_plus', nombre: 'Pro+', precio_mensual: 100, precio_anual: 1000, permite_mensual: true, permite_anual: true })
  it('un formulario correcto no tiene errores', () => {
    expect(validarFormularioPlan(valido(), { esNuevo: true })).toEqual({})
  })
  it('código inválido solo se valida en planes NUEVOS (en edición no se puede cambiar)', () => {
    const f = { ...valido(), plan: 'Plan Raro!' }
    expect(validarFormularioPlan(f, { esNuevo: true }).plan).toBeTruthy()
    expect(validarFormularioPlan(f, { esNuevo: false }).plan).toBeUndefined()
  })
  it('nombre obligatorio; al menos una modalidad; precio obligatorio solo si la modalidad se permite', () => {
    expect(validarFormularioPlan({ ...valido(), nombre: '  ' }).nombre).toBeTruthy()
    expect(validarFormularioPlan({ ...valido(), permite_mensual: false, permite_anual: false }).permite_mensual).toBeTruthy()
    expect(validarFormularioPlan({ ...valido(), precio_mensual: '' }).precio_mensual).toBeTruthy()
    expect(validarFormularioPlan({ ...valido(), permite_anual: false, precio_anual: '' }).precio_anual).toBeUndefined()
  })
  it('precio negativo y límites no enteros/negativos se rechazan; vacío = ilimitado es válido', () => {
    expect(validarFormularioPlan({ ...valido(), precio_mensual: '-5' }).precio_mensual).toBeTruthy()
    expect(validarFormularioPlan({ ...valido(), max_pacientes: '1.5' }).max_pacientes).toBeTruthy()
    expect(validarFormularioPlan({ ...valido(), max_usuarios: '-1' }).max_usuarios).toBeTruthy()
    expect(validarFormularioPlan({ ...valido(), max_pacientes: '' }).max_pacientes).toBeUndefined()
    expect(validarFormularioPlan({ ...valido(), max_pacientes: '0' }).max_pacientes).toBeUndefined()
  })
  it("planDesdeFormulario: '' → null (ilimitado), números como número, código en minúsculas, moneda en mayúsculas", () => {
    const p = planDesdeFormulario({ ...valido(), plan: ' PRO_Plus ', max_pacientes: '', max_usuarios: '10', moneda: 'mxn', descripcion: '  ' })
    expect(p.codigo).toBe('pro_plus')
    expect(p.max_pacientes).toBeNull()
    expect(p.max_usuarios).toBe(10)
    expect(p.moneda).toBe('MXN')
    expect(p.descripcion).toBeNull()
    expect(p.precio_mensual).toBe(100)
  })
  it('un plan existente con NULL (ilimitado) vuelve a NULL al guardar sin tocarlo (no se vuelve 0)', () => {
    const f = formularioDesdePlan({ plan: 'empresarial', nombre: 'E', precio_mensual: 1, precio_anual: 1, permite_mensual: true, permite_anual: true, max_pacientes: null, limite_sucursales: null })
    expect(f.max_pacientes).toBe('')
    expect(planDesdeFormulario(f).max_pacientes).toBeNull()
    expect(planDesdeFormulario(f).limite_sucursales).toBeNull()
  })
})

describe('historial de cambios', () => {
  it('etiqueta acciones conocidas y deja las desconocidas tal cual', () => {
    expect(etiquetaAccionPlan('editar_plan')).toBe('Modificó el plan')
    expect(etiquetaAccionPlan('accion_nueva')).toBe('accion_nueva')
  })
  it('resume antes → después', () => {
    expect(resumirCambios({ cambios: { precio_mensual: { antes: 999, despues: 1099 } } })).toEqual([{ campo: 'precio_mensual', antes: 999, despues: 1099 }])
    expect(resumirCambios(null)).toEqual([])
    expect(resumirCambios({})).toEqual([])
  })
})

import { validarFuncionalidad } from '../../../../lib/planes.js'
describe('validarFuncionalidad (misma regla que la base)', () => {
  it('acepta un código y nombre correctos', () => {
    expect(validarFuncionalidad({ codigo: 'integracion_futura', nombre: 'Futura' })).toEqual({})
  })
  it('rechaza código con mayúsculas/espacios/símbolos o que no empieza con letra; y nombre vacío', () => {
    expect(validarFuncionalidad({ codigo: 'Mi Func!', nombre: 'x' }).codigo).toBeTruthy()
    expect(validarFuncionalidad({ codigo: '1abc', nombre: 'x' }).codigo).toBeTruthy()
    expect(validarFuncionalidad({ codigo: 'a', nombre: 'x' }).codigo).toBeTruthy()
    expect(validarFuncionalidad({ codigo: 'ok_code', nombre: '   ' }).nombre).toBeTruthy()
  })
  it('normaliza mayúsculas del código antes de validar (la base lo guarda en minúsculas)', () => {
    expect(validarFuncionalidad({ codigo: 'OK_CODE', nombre: 'n' })).toEqual({})
  })
})
