import react from 'eslint-plugin-react';
export default [{
  files: ['src/**/*.{js,jsx}'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: {
      window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
      indexedDB: 'readonly', crypto: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
      setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
      fetch: 'readonly', AbortController: 'readonly', Blob: 'readonly', URL: 'readonly',
      btoa: 'readonly', atob: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
      FormData: 'readonly', Headers: 'readonly', Request: 'readonly', Response: 'readonly',
      Image: 'readonly', FileReader: 'readonly', Worker: 'readonly', WebSocket: 'readonly',
      requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
      caches: 'readonly', self: 'readonly', location: 'readonly', history: 'readonly',
      performance: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly',
      IntersectionObserver: 'readonly', CustomEvent: 'readonly', Event: 'readonly',
      alert: 'readonly', confirm: 'readonly', prompt: 'readonly', structuredClone: 'readonly'
    }
  },
  plugins: { react },
  rules: { 'no-undef': 'error', 'react/jsx-no-undef': 'error', 'no-unused-vars': 'off', 'react-hooks/exhaustive-deps': 'off' }
}];
