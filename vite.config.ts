import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gatewayPort = Number(env.GATEWAY_PORT || process.env.GATEWAY_PORT) || 8080;
  const backendPort = Number(env.PORT || process.env.PORT) || 3001;
  const backendTarget = `http://127.0.0.1:${backendPort}`;
  const ollamaTarget = env.VITE_OLLAMA_URL || process.env.VITE_OLLAMA_URL || 'http://127.0.0.1:11434';

  const tunnelHosts = [
    'localhost',
    '127.0.0.1',
    '.ngrok.io',
    '.ngrok-free.app',
    '.ngrok-free.dev',
    '.trycloudflare.com',
    '.loca.lt',
    '.loca.lt.com',
  ];

  const proxyConfig = {
    '/api': {
      target: backendTarget,
      changeOrigin: true,
    },
    '/ollama': {
      target: ollamaTarget,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/ollama/, ''),
    },
  };

  return {
  server: {
    host: "::",
    port: gatewayPort,
    strictPort: false,
    allowedHosts: tunnelHosts,
    // HMR breaks through tunnels → blank page; preview mode used for sharing
    hmr: env.VITE_TUNNEL === 'true' ? false : { overlay: false },
    proxy: proxyConfig,
  },
  preview: {
    host: true,
    port: gatewayPort,
    strictPort: true,
    allowedHosts: tunnelHosts,
    proxy: proxyConfig,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
