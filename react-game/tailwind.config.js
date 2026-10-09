/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-deep': '#0d1114',
        'bg-mid': '#151b1e',
        'accent-gold': '#e9bc73',
        'accent-crimson': '#ef8c67',
        'accent-pink': '#ff3d68',
        ring: '#303a3e',
        'text-soft': '#edf0e9',
      },
      fontFamily: {
        head: ['Barlow Condensed', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
