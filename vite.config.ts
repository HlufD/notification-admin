import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, /v1.0/... is forwarded to the notification service, so the
// browser never makes a cross-origin call (the service has no CORS setup).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1.0": {
        target: process.env.NOTIFICATION_API_TARGET ?? "http://localhost:3005",
        changeOrigin: true,
      },
    },
  },
});
