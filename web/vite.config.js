import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: the API runs on CONFLAB_PORT (default 4901, npm start) and Vite on VITE_PORT (default 4900). /api is proxied, so the browser
// only ever talks to one origin. Ports stay inside 4900-4949.
const api = { target: `http://127.0.0.1:${Number(process.env.CONFLAB_PORT) || 4901}` };

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: Number(process.env.VITE_PORT) || 4900, strictPort: true, proxy: { "/api": api } },
  test: { environment: "jsdom", globals: true, setupFiles: "./src/testSetup.js", testTimeout: 30000, server: { deps: { external: [/\/server\/src\//] } } },
});
