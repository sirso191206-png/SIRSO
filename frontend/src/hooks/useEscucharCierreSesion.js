import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Sin esto, "Cerrar todas mis sesiones" desde otro dispositivo revoca
// el refresh token de verdad, pero el access token que ESTE
// dispositivo ya tiene en memoria sigue funcionando hasta que expira
// por su cuenta (normalmente hasta 1 hora) — un JWT ya emitido no se
// invalida instantáneamente solo porque se revocó el refresh token.
// Con Realtime, este dispositivo se entera en segundos de que su
// propia fila en sesiones_usuario fue marcada como finalizada, y
// cierra sesión local de inmediato.
export function useEscucharCierreSesion(sesionActualId, onSesionCerradaRemota) {
  useEffect(() => {
    if (!sesionActualId) return

    const canal = supabase
      .channel(`sesion-${sesionActualId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sesiones_usuario', filter: `id=eq.${sesionActualId}` },
        (payload) => {
          if (payload.new?.finalizada_en) onSesionCerradaRemota()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [sesionActualId, onSesionCerradaRemota])
}
