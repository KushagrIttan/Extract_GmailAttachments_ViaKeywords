import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT || '5173'),
    proxy: {
      '/api': {
        target: process.env.services__api__https__0 || process.env.services__api__http__0,
        changeOrigin: true,
        secure: false,
      },
      '/hangfire': {
        target: process.env.services__api__https__0 || process.env.services__api__http__0,
        changeOrigin: true,
        secure: false,
      },
      '/hub': {
        target: process.env.services__api__https__0 || process.env.services__api__http__0,
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
})
