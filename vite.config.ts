import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages 專案站台路徑（https://wowack7.github.io/beybuilder/）；dev 維持根路徑。
  // `vite preview` 的 command 也是 'serve'，少判 isPreview 的話 preview 會用 base '/' 起站，
  // /beybuilder/* 全被 SPA fallback 吃掉（HTML 200 但 assets 404），無法忠實模擬正式站。
  base: command === 'build' || isPreview ? '/beybuilder/' : '/',
  plugins: [react()],
}))
