import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api/warsaw": {
        target: "https://api.um.warszawa.pl",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/warsaw/, ""),
      },
    },
  },
});
