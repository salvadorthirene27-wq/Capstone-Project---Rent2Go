export function pooledHostname(hostname: string) {
  const [endpoint, ...domain] = hostname.split(".");
  if (!endpoint.startsWith("ep-") || !domain.length)
    throw Error("Expected a Neon endpoint hostname.");
  return `${endpoint.replace(/(?:-pooler)+$/, "")}-pooler.${domain.join(".")}`;
}
