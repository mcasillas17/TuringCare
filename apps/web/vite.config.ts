import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = "http://localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/health": { target: API, changeOrigin: true },
      "/me": { target: API, changeOrigin: true },
    },
  },
});
