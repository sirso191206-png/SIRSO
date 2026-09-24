import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { Login } from './pages/Login'
import { Contacto } from './pages/Contacto'
import { RestablecerPassword } from './pages/RestablecerPassword'
import { Legal } from './pages/Legal'
import { AvisoPrivacidad } from './pages/legal/AvisoPrivacidad'
import { Terminos } from './pages/legal/Terminos'
import { MiDia } from './pages/MiDia'
import { Dashboard } from './pages/Dashboard'
import { Pacientes } from './pages/Pacientes'
import { PacienteDetalle } from './pages/PacienteDetalle'
import { Agenda } from './pages/Agenda'
import { Usuarios } from './pages/Usuarios'
import { Administracion } from './pages/Administracion'
import { AdministracionClinica } from './pages/AdministracionClinica'
import { CatalogoTratamientos } from './pages/CatalogoTratamientos'
import { CorteDeCaja } from './pages/CorteDeCaja'
import { ConfiguracionClinica } from './pages/ConfiguracionClinica'
import { ConfiguracionSeguridad } from './pages/ConfiguracionSeguridad'
import { Sucursales } from './pages/Sucursales'
import { ConsultaUnificada } from './pages/ConsultaUnificada'
import { Cookies } from './pages/legal/Cookies'
import { PreferenciasCookies } from './pages/legal/cookies/Preferencias'
import { Arco } from './pages/legal/Arco'
import { Seguridad } from './pages/legal/Seguridad'
import { Retencion } from './pages/legal/Retencion'
import { Proveedores } from './pages/legal/Proveedores'
import { AcuerdoTratamientoDatos } from './pages/legal/AcuerdoTratamientoDatos'
import { AdministracionArco } from './pages/AdministracionArco'
import { AdministracionIncidentes } from './pages/AdministracionIncidentes'
import { AdminLegal } from './pages/AdminLegal'
import { ToastContainer } from './components/ui/Toast'
import { BannerCookies } from './components/legal/BannerCookies'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <BrowserRouter>
      <ToastContainer />
      <BannerCookies />
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
        <Route path="/reportes" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pacientes" element={<ProtectedRoute><Pacientes /></ProtectedRoute>} />
        <Route path="/pacientes/:id" element={<ProtectedRoute><PacienteDetalle /></ProtectedRoute>} />
        <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
        <Route path="/catalogo" element={<ProtectedRoute><CatalogoTratamientos /></ProtectedRoute>} />
        <Route path="/corte-de-caja" element={<ProtectedRoute><CorteDeCaja /></ProtectedRoute>} />
        <Route path="/configuracion" element={<ProtectedRoute><ConfiguracionClinica /></ProtectedRoute>} />
        <Route path="/configuracion/seguridad" element={<ProtectedRoute><ConfiguracionSeguridad /></ProtectedRoute>} />
        <Route path="/sucursales" element={<ProtectedRoute><Sucursales /></ProtectedRoute>} />
        <Route path="/consulta/:citaId" element={<ProtectedRoute><ConsultaUnificada /></ProtectedRoute>} />
        <Route path="/administracion" element={<ProtectedRoute><Administracion /></ProtectedRoute>} />
        <Route path="/administracion/arco" element={<ProtectedRoute><AdministracionArco /></ProtectedRoute>} />
        <Route path="/administracion/incidentes" element={<ProtectedRoute><AdministracionIncidentes /></ProtectedRoute>} />
        <Route path="/admin/legal" element={<ProtectedRoute><AdminLegal /></ProtectedRoute>} />
        <Route path="/administracion/:clinicaId" element={<ProtectedRoute><AdministracionClinica /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
