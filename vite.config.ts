import { defineConfig } from 'vite'
import { writeFileSync } from 'fs'
const d = new Date(Date.now() + 3600e3), BUILD = 'v' + d.toISOString().slice(5, 16).replace(/[-T:]/g, '').replace(/^(\d{4})(\d{4})$/, '$1.$2')
export default defineConfig({ base: './', define: { __BUILD__: JSON.stringify(BUILD) }, build: { chunkSizeWarningLimit: 3000 },
  plugins: [{ name: 'ver', closeBundle() { writeFileSync('dist/version.json', JSON.stringify({ v: BUILD })) } }] })
