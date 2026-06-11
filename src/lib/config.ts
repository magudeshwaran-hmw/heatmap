import { shouldUseGatewayProxies } from './tunnelHosts';

export const OLLAMA_BASE = shouldUseGatewayProxies()
  ? '/ollama'
  : (import.meta.env.VITE_OLLAMA_URL || 'http://127.0.0.1:11434');
