import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',     // Allow LAN access
    port: 5173,           // Optional: match your chosen port
  },
});
