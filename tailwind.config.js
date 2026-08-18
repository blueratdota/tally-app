/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#14202B',
        surface: '#1C2C3A',
        raised: '#223547',
        paper: '#F5F1E8',
        muted: '#8FA0AE',
        gold: '#F2B84B',
        coral: '#FF6F59',
        mint: '#4ECDC4',
        violet: '#A08BFB',
        sky: '#6FB8E8'
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
