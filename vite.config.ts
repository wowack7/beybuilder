import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages 專案站台路徑（https://wowack7.github.io/beybuilder/）；dev 維持根路徑
  base: command === 'build' ? '/beybuilder/' : '/',
  plugins: [react()],
}))
