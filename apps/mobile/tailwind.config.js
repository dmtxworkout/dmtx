/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // DMTX mobile — dark theme (matches the claude_design comp)
        bg: '#0d0d0f',
        surface: '#16161b',
        'surface-2': '#1e1e25',
        'surface-3': '#22222a',
        line: '#26262e',
        'line-2': '#1a1a20',
        ink: '#f2f2f4',
        'ink-2': '#b8b8c0',
        'ink-3': '#8b8b93',
        'ink-4': '#6d6d75',
        accent: '#d1502a',
        'accent-hover': '#bd4522',
        success: '#4c9c6b',
      },
      fontFamily: {
        // Archivo (loaded via @expo-google-fonts/archivo)
        sans: ['Archivo_400Regular'],
        medium: ['Archivo_500Medium'],
        semibold: ['Archivo_600SemiBold'],
        bold: ['Archivo_700Bold'],
        extrabold: ['Archivo_800ExtraBold'],
        // IBM Plex Mono
        mono: ['IBMPlexMono_400Regular'],
        'mono-medium': ['IBMPlexMono_500Medium'],
        'mono-semibold': ['IBMPlexMono_600SemiBold'],
      },
    },
  },
  plugins: [],
};
