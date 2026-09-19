/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#faf0ff', 100: '#f3ddff', 200: '#e6b8fb', 500: '#b70fd6', 600: '#a20bbd', 700: '#8a0aa2', 800: '#6d0a80' },
        ink: '#151024',
      },
      backgroundImage: {
        'brand-header': 'linear-gradient(110deg,#3a06d0 0%,#c2078e 62%,#f0262c 100%)',
        'brand-button': 'linear-gradient(90deg,#7a0596 0%,#cf0cf0 100%)',
        'brand-nav': 'linear-gradient(100deg,#a20bbd 0%,#7c4dff 60%,#e879f9 100%)',
      },
      boxShadow: {
        card: '0 8px 30px -12px rgba(120,20,160,.25)',
        glow: '0 12px 30px -10px rgba(162,11,189,.55)',
      },
      keyframes: { slideIn: { from: { opacity: 0, transform: 'translateX(24px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { 'slide-in': 'slideIn .25s ease-out' },
    },
  },
  plugins: [],
};
