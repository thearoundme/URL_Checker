import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    // Browser calls same-origin /api/* → proxied to FastAPI. Avoids CORS and "Failed to fetch"
    // when the UI is opened on localhost:5173 but the API is only reachable on 127.0.0.1:8000.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
