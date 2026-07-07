/** True when the app is opened via a public tunnel URL (not plain localhost). */
export function isTunnelHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname.toLowerCase();
  return (
    h.endsWith('.loca.lt') ||
    h.endsWith('.loca.lt.com') ||
    h.includes('ngrok') ||
    h.endsWith('.trycloudflare.com')
  );
}

export function shouldUseGatewayProxies(): boolean {
  if (isTunnelHost()) return true;
  if (import.meta.env.VITE_SINGLE_PORT === 'true') return true;
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const gatewayPort = String(import.meta.env.VITE_GATEWAY_PORT || '7000');
    if (window.location.port === gatewayPort) return true;
  }
  return false;
}
