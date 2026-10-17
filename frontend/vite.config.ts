import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const target = process.env.CAN_API_TARGET ?? "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": target,
      "/ws": { target: target.replace("http", "ws"), ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: [
            "echarts/core",
            "echarts/charts",
            "echarts/components",
            "echarts/renderers",
          ],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
