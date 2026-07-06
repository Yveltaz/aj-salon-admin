import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Port 5175 so the admin app can run alongside the staff app (5174) in dev.
  server: { host: true, port: 5175 },
})
