// Sustituye `https://deno.land/std@0.168.0/http/server.ts` (no accesible sin red) por el servidor HTTP NATIVO de Deno.
// La Edge Function llama `serve(handler)`; aquí arranca Deno.serve en el puerto de la variable PORT.
export function serve(handler: (req: Request) => Response | Promise<Response>) {
  Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8787), hostname: '127.0.0.1', onListen: () => {} }, handler)
}
