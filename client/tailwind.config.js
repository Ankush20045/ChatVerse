/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dusk: '#0f172a',
        neon: '#8b5cf6',
        aqua: '#22d3ee',
      },
      boxShadow: {
        glass: '0 10px 30px rgba(59,130,246,0.25)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
