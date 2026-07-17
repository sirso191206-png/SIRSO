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
      },
      keyframes: {
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-1.5rem)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(1.5rem)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        'slide-in-left': 'slide-in-left 600ms ease both',
        'slide-in-right': 'slide-in-right 600ms ease both',
        'fade-in': 'fade-in 350ms ease both'
      }
    }
  },
  plugins: []
}
