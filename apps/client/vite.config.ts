import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __NATIVE__: JSON.stringify(mode === "native") },
  build: { outDir: mode === "native" ? "dist-native" : "dist", sourcemap: false, target: "es2022" },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
}));
