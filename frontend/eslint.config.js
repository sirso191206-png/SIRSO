import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// Reglas que cazan errores REALES son "error" (variable no definida, hooks mal usados, JSX con componente
// inexistente). Las de estilo o de limpieza (variables sin usar, dependencias de efectos) son "warn": se ven, se
// van corrigiendo, y no bloquean. Lo recomendado por ESLint se deja como viene.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'eslint.tmp.config.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 }
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // ignoreRestSiblings: desestructurar para OMITIR campos (const { a, ...resto } = x) es un patrón válido.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }]
    }
  },
  // Las pruebas corren en Node (vitest): process, Buffer, etc.
  { files: ['src/**/__tests__/**', 'src/**/*.test.js'], languageOptions: { globals: { ...globals.node } } },
  { files: ['vite.config.js', 'vitest.config.ts', 'vite-plugin-*.js', 'eslint.config.js'], languageOptions: { globals: { ...globals.node } } }
]
