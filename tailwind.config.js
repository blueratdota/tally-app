/** @type {import('tailwindcss').Config} */
// Theme tokens are defined in src/index.css.
const v = name => `hsl(var(--${name}))`;
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: v('background'),
        foreground: v('foreground'),
        card: { DEFAULT: v('card'), foreground: v('card-foreground') },
        popover: { DEFAULT: v('popover'), foreground: v('popover-foreground') },
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
        secondary: { DEFAULT: v('secondary'), foreground: v('secondary-foreground') },
        muted: { DEFAULT: v('muted'), foreground: v('muted-foreground') },
        accent: { DEFAULT: v('accent'), foreground: v('accent-foreground') },
        destructive: { DEFAULT: v('destructive'), foreground: v('destructive-foreground') },
        border: v('border'),
        input: v('input'),
        ring: v('ring')
      },
      fontFamily: {
        sans: ['Manrope', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Manrope', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
