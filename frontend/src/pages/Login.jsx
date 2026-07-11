import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export function Login() {
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      await login(correo, password)
      navigate('/')
    } catch (err) {
      setError('Correo o contraseña incorrectos.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-clinico-azulClaro">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-clinico-azul">
          Sistema de Gestión Odontológica
        </h1>
        <div className="space-y-4">
          <Input
            label="Correo"
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-clinico-rojo">{error}</p>}
          <Button type="submit" disabled={cargando} className="w-full">
            {cargando ? 'Entrando…' : 'Entrar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
