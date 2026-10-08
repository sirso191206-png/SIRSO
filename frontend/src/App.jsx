import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { Login } from './pages/Login'
import { MiDia } from './pages/MiDia'
import { RutaConFuncionalidad } from './components/planes/RutaConFuncionalidad'
import { RutaSucursales } from './components/planes/RutaSucursales'
import { ToastContainer } from './components/ui/Toast'
import { BannerCookies } from './components/legal/BannerCookies'
import { BannerSinConexion } from './components/layout/BannerSinConexion'
import { ErrorDeCarga } from './components/layout/ErrorDeCarga'


// Cada pantalla (salvo el login y "Mi día", que son lo primero que se ve) se descarga cuando se entra a ella, no todas
// juntas al abrir SIRO. El service worker precachea TODO dist/ (incluidos estos archivos), así que también funcionan sin
// conexión. Una guardia (codigoPorRutas.test.js) impide volver a importar pantallas de golpe.
const pagina = (cargar, nombre) => lazy(() => cargar().then((m) => ({ default: m[nombre] })))
const Contacto = pagina(() => import('./pages/Contacto'), 'Contacto')
const RestablecerPassword = pagina(() => import('./pages/RestablecerPassword'), 'RestablecerPassword')
const Legal = pagina(() => import('./pages/Legal'), 'Legal')
const AvisoPrivacidad = pagina(() => import('./pages/legal/AvisoPrivacidad'), 'AvisoPrivacidad')
const Terminos = pagina(() => import('./pages/legal/Terminos'), 'Terminos')
const Dashboard = pagina(() => import('./pages/Dashboard'), 'Dashboard')
const Pacientes = pagina(() => import('./pages/Pacientes'), 'Pacientes')
const PacienteDetalle = pagina(() => import('./pages/PacienteDetalle'), 'PacienteDetalle')
const Agenda = pagina(() => import('./pages/Agenda'), 'Agenda')
const Usuarios = pagina(() => import('./pages/Usuarios'), 'Usuarios')
const Administracion = pagina(() => import('./pages/Administracion'), 'Administracion')
const AdministracionClinica = pagina(() => import('./pages/AdministracionClinica'), 'AdministracionClinica')
const SuperAdminPlanes = pagina(() => import('./pages/SuperAdminPlanes'), 'SuperAdminPlanes')
const CatalogoTratamientos = pagina(() => import('./pages/CatalogoTratamientos'), 'CatalogoTratamientos')
const CorteDeCaja = pagina(() => import('./pages/CorteDeCaja'), 'CorteDeCaja')
const ConfiguracionClinica = pagina(() => import('./pages/ConfiguracionClinica'), 'ConfiguracionClinica')
const ConfiguracionSeguridad = pagina(() => import('./pages/ConfiguracionSeguridad'), 'ConfiguracionSeguridad')
const Sucursales = pagina(() => import('./pages/Sucursales'), 'Sucursales')
const Auditoria = pagina(() => import('./pages/Auditoria'), 'Auditoria')
const Ayuda = pagina(() => import('./pages/Ayuda'), 'Ayuda')
const ConsultaUnificada = pagina(() => import('./pages/ConsultaUnificada'), 'ConsultaUnificada')
const Cookies = pagina(() => import('./pages/legal/Cookies'), 'Cookies')
const PreferenciasCookies = pagina(() => import('./pages/legal/cookies/Preferencias'), 'PreferenciasCookies')
const Arco = pagina(() => import('./pages/legal/Arco'), 'Arco')
const Seguridad = pagina(() => import('./pages/legal/Seguridad'), 'Seguridad')
const Retencion = pagina(() => import('./pages/legal/Retencion'), 'Retencion')
const Proveedores = pagina(() => import('./pages/legal/Proveedores'), 'Proveedores')
const AcuerdoTratamientoDatos = pagina(() => import('./pages/legal/AcuerdoTratamientoDatos'), 'AcuerdoTratamientoDatos')
const AdministracionArco = pagina(() => import('./pages/AdministracionArco'), 'AdministracionArco')
const AdministracionIncidentes = pagina(() => import('./pages/AdministracionIncidentes'), 'AdministracionIncidentes')
const AdminLegal = pagina(() => import('./pages/AdminLegal'), 'AdminLegal')

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <BrowserRouter>
      <ToastContainer />
      <BannerCookies />
      <BannerSinConexion />
      <ErrorDeCarga>
        <Suspense fallback={<div className="flex h-screen items-center justify-center text-slate-400">Cargando…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/contacto" element={<Contacto />} />
        <Route path="/restablecer-password" element={<RestablecerPassword />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/legal/privacidad" element={<AvisoPrivacidad />} />
        <Route path="/legal/terminos" element={<Terminos />} />
        <Route path="/legal/cookies" element={<Cookies />} />
        <Route path="/legal/cookies/preferencias" element={<PreferenciasCookies />} />
        <Route path="/legal/arco" element={<Arco />} />
        <Route path="/legal/seguridad" element={<Seguridad />} />
        <Route path="/legal/retencion" element={<Retencion />} />
        <Route path="/legal/proveedores" element={<Proveedores />} />
        <Route path="/legal/acuerdo-tratamiento-datos" element={<AcuerdoTratamientoDatos />} />
        <Route path="/" element={<ProtectedRoute><MiDia /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute><RutaConFuncionalidad funcionalidad="estadisticas"><Dashboard /></RutaConFuncionalidad></ProtectedRoute>} />
        <Route path="/pacientes" element={<ProtectedRoute><Pacientes /></ProtectedRoute>} />
        <Route path="/pacientes/:id" element={<ProtectedRoute><PacienteDetalle /></ProtectedRoute>} />
        <Route path="/agenda" element={<ProtectedRoute><RutaConFuncionalidad funcionalidad="agenda"><Agenda /></RutaConFuncionalidad></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
        <Route path="/catalogo" element={<ProtectedRoute><RutaConFuncionalidad funcionalidad="tratamientos"><CatalogoTratamientos /></RutaConFuncionalidad></ProtectedRoute>} />
        <Route path="/corte-de-caja" element={<ProtectedRoute><RutaConFuncionalidad funcionalidad="caja"><CorteDeCaja /></RutaConFuncionalidad></ProtectedRoute>} />
        <Route path="/configuracion" element={<ProtectedRoute><ConfiguracionClinica /></ProtectedRoute>} />
        <Route path="/configuracion/seguridad" element={<ProtectedRoute><ConfiguracionSeguridad /></ProtectedRoute>} />
        <Route path="/ayuda" element={<ProtectedRoute><Ayuda /></ProtectedRoute>} />
        <Route path="/auditoria" element={<ProtectedRoute><RutaConFuncionalidad funcionalidad="auditoria"><Auditoria /></RutaConFuncionalidad></ProtectedRoute>} />
        <Route path="/sucursales" element={<ProtectedRoute><RutaSucursales><Sucursales /></RutaSucursales></ProtectedRoute>} />
        <Route path="/consulta/:citaId" element={<ProtectedRoute><ConsultaUnificada /></ProtectedRoute>} />
        <Route path="/administracion" element={<ProtectedRoute><Administracion /></ProtectedRoute>} />
        <Route path="/superadmin/planes" element={<ProtectedRoute><SuperAdminPlanes /></ProtectedRoute>} />
        <Route path="/administracion/arco" element={<ProtectedRoute><AdministracionArco /></ProtectedRoute>} />
        <Route path="/administracion/incidentes" element={<ProtectedRoute><AdministracionIncidentes /></ProtectedRoute>} />
        <Route path="/admin/legal" element={<ProtectedRoute><AdminLegal /></ProtectedRoute>} />
        <Route path="/administracion/:clinicaId" element={<ProtectedRoute><AdministracionClinica /></ProtectedRoute>} />
      </Routes>
        </Suspense>
      </ErrorDeCarga>
    </BrowserRouter>
  )
}
