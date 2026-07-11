import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { Login } from './pages/Login'
import { MiDia } from './pages/MiDia'
import { Dashboard } from './pages/Dashboard'
import { Pacientes } from './pages/Pacientes'
import { PacienteDetalle } from './pages/PacienteDetalle'
import { Agenda } from './pages/Agenda'
import { Usuarios } from './pages/Usuarios'
import { Administracion } from './pages/Administracion'
import { AdministracionClinica } from './pages/AdministracionClinica'
import { CatalogoTratamientos } from './pages/CatalogoTratamientos'
import { ConsultaUnificada } from './pages/ConsultaUnificada'
import { ToastContainer } from './components/ui/Toast'

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
        <Route path="/" element={<ProtectedRoute><MiDia /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pacientes" element={<ProtectedRoute><Pacientes /></ProtectedRoute>} />
        <Route path="/pacientes/:id" element={<ProtectedRoute><PacienteDetalle /></ProtectedRoute>} />
        <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
        <Route path="/catalogo" element={<ProtectedRoute><CatalogoTratamientos /></ProtectedRoute>} />
        <Route path="/consulta/:citaId" element={<ProtectedRoute><ConsultaUnificada /></ProtectedRoute>} />
        <Route path="/administracion" element={<ProtectedRoute><Administracion /></ProtectedRoute>} />
        <Route path="/administracion/:clinicaId" element={<ProtectedRoute><AdministracionClinica /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
