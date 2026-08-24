import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { Login } from './pages/Login'
import { Contacto } from './pages/Contacto'
import { RestablecerPassword } from './pages/RestablecerPassword'
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
import { ConsultaUnificada } from './pages/ConsultaUnificada'
// Reporte SIS: import comentado a propósito, junto con su ruta más abajo
// y su link en Sidebar.jsx — el producto se enfoca en clínicas privadas.
// import { ReporteSis } from './pages/ReporteSis'
import { ToastContainer } from './components/ui/Toast'

// Prueba temporal — perezosa a propósito: arrastra Three.js/R3F/drei
// completo, y a diferencia del odontograma clínico (lazy más adentro,
// solo cuando se activa esa vista), esta página los importa directo.
// Sin esto, el bundle PRINCIPAL crecería ~900KB para todos los
// usuarios, visiten o no esta prueba.
const PruebaOdontogramaGlb = lazy(() => import('./pages/PruebaOdontogramaGlb').then((m) => ({ default: m.PruebaOdontogramaGlb })))

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/contacto" element={<Contacto />} />
        <Route path="/restablecer-password" element={<RestablecerPassword />} />
        <Route path="/" element={<ProtectedRoute><MiDia /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pacientes" element={<ProtectedRoute><Pacientes /></ProtectedRoute>} />
        <Route path="/pacientes/:id" element={<ProtectedRoute><PacienteDetalle /></ProtectedRoute>} />
        <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
        <Route path="/catalogo" element={<ProtectedRoute><CatalogoTratamientos /></ProtectedRoute>} />
        <Route path="/corte-de-caja" element={<ProtectedRoute><CorteDeCaja /></ProtectedRoute>} />
        <Route path="/configuracion" element={<ProtectedRoute><ConfiguracionClinica /></ProtectedRoute>} />
        {/* <Route path="/reporte-sis" element={<ProtectedRoute><ReporteSis /></ProtectedRoute>} /> */}
        {/* Prueba temporal de arquitectura — sin link en el menú, solo por URL directa. */}
        <Route
          path="/prueba-odontograma-glb"
          element={
            <ProtectedRoute>
              <Suspense fallback={<div className="p-8 text-sm text-slate-400">Cargando…</div>}>
                <PruebaOdontogramaGlb />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/consulta/:citaId" element={<ProtectedRoute><ConsultaUnificada /></ProtectedRoute>} />
        <Route path="/administracion" element={<ProtectedRoute><Administracion /></ProtectedRoute>} />
        <Route path="/administracion/:clinicaId" element={<ProtectedRoute><AdministracionClinica /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
