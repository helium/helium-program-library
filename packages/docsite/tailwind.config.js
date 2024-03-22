const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.5rem' }],
      base: ['1rem', { lineHeight: '2rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '2rem' }],
      '2xl': ['1.5rem', { lineHeight: '2.5rem' }],
      '3xl': ['2rem', { lineHeight: '2.5rem' }],
      '4xl': ['2.5rem', { lineHeight: '3rem' }],
      '5xl': ['3rem', { lineHeight: '3.5rem' }],
      '6xl': ['3.75rem', { lineHeight: '1' }],
      '7xl': ['4.5rem', { lineHeight: '1' }],
      '8xl': ['6rem', { lineHeight: '1' }],
      '9xl': ['8rem', { lineHeight: '1' }],
    },
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['Lexend', ...defaultTheme.fontFamily.sans],
      },
      maxWidth: {
        '8xl': '88rem',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)', stroke: 'rgba(83, 230, 194, 0.0)' },
          '50%': { transform: 'scale(.9)', stroke: 'rgba(83, 230, 194, 0.10)' },
        },
        breatheInverted: {
          '0%, 100%': { transform: 'scale(1)', stroke: 2000 },
          '50%': { transform: 'scale(0.9)', stroke: 0 },
        },
        slowBounce: {
          '0%, 100%': { transform: 'translateY(-10px)' },
          '50%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'breathe': 'breathe 5s ease-in-out infinite',
        'breathe-reverse': 'breatheInverted 5s ease-in-out infinite reverse',
        'slow-bounce': 'slowBounce 5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
