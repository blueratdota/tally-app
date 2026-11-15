/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#EDF0F5',
        surface: '#FFFFFF',
        ink: '#0F1B33',
        muted: '#5B6679',
        line: '#D3D9E3',
        blue: '#0038A8',
        red: '#C8102E'
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        display: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', 'sans-serif']
      }
    }
  },
  plugins: []
};
