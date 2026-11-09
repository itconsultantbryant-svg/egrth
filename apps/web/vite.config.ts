import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
 plugins:[react(),tailwindcss()],
 cacheDir:process.env.ECOGROWTH_VITE_CACHE_DIR,
 server:{
  port:5173,
  proxy:{'/api':process.env.API_PROXY_TARGET||'http://localhost:3001'},
  warmup:{clientFiles:['./src/bootstrap.ts','./src/main.tsx','./src/ApplicationShell.tsx']}
 }
});
