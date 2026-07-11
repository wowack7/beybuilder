import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 站台位於自訂子網域根 https://beybuilder.5-seven.dog/，故 base 一律 '/'
  // （單一來源見 src/lib/site.ts 的 BASE_PATH；site.test.ts 會比對此值）。
  base: '/',
  plugins: [react()],
})
