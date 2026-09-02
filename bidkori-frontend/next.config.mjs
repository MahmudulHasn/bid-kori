/** @type {import('next').NextConfig} */

function parseOrigin(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function buildRemotePatterns() {
  const patterns = [
    { protocol: 'http', hostname: '127.0.0.1', port: '8000' },
    { protocol: 'http', hostname: 'localhost', port: '8000' },
  ];

  const candidates = [
    process.env.NEXT_PUBLIC_MEDIA_ORIGIN,
    process.env.NEXT_PUBLIC_API_BASE_URL,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const url = parseOrigin(String(candidate));
    if (!url) continue;
    const entry = {
      protocol: url.protocol.replace(':', ''),
      hostname: url.hostname,
    };
    if (url.port) {
      entry.port = url.port;
    }
    const exists = patterns.some(
      (p) =>
        p.protocol === entry.protocol &&
        p.hostname === entry.hostname &&
        (p.port || '') === (entry.port || ''),
    );
    if (!exists) {
      patterns.push(entry);
    }
  }

  return patterns;
}

const nextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
  },
};

export default nextConfig;
