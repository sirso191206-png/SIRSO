/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        clinico: {
          azul: '#1E5F8C',
          azulClaro: '#E8F1F8',
          ambar: '#D97706',
          verde: '#15803D',
          rojo: '#DC2626'
        }
      }
    }
  },
  plugins: []
}
