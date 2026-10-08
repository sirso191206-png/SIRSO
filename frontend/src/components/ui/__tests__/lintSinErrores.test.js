// ESLint forma parte de "todos los tests": si aparece un ERROR de lint (hook usado en condicional, variable no
// definida, JSX con un componente inexistente…), esta prueba falla. Los avisos no bloquean.
import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'

describe('ESLint', () => {
  it('el código no tiene errores de lint (hooks en orden, nada sin definir)', async () => {
    const eslint = new ESLint({ // fileURLToPath (no .pathname): en Windows .pathname da "/C:/Users/…", una ruta inválida. Apunta a frontend/ en ambos sistemas.
    cwd: fileURLToPath(new URL('../../../../', import.meta.url)) })
    const resultados = await eslint.lintFiles(['src/**/*.{js,jsx}'])
    const errores = resultados.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath.split('/src/')[1]}:${m.line} ${m.ruleId} — ${m.message}`))
    expect(errores).toEqual([])
  }, 180000)
})
