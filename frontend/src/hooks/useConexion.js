import { useEffect, useState } from 'react'

// Detecta cuándo el navegador pierde/recupera la conexión — es la
// señal del propio navegador (navigator.onLine + eventos
// online/offline), no un ping real a Supabase. Confirmar que Supabase
// específicamente responde sería un alcance mayor (pings periódicos);
// esto es solo el Nivel 1 de "offline": avisar, no verificar a fondo.
export function useConexion() {
  const [conectado, setConectado] = useState(navigator.onLine)

  useEffect(() => {
    const alConectar = () => setConectado(true)
    const alDesconectar = () => setConectado(false)
    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)
    return () => {
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alDesconectar)
    }
  }, [])

  return conectado
}
