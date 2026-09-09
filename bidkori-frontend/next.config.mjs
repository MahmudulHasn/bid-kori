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
    {
      protocol: 'http',
      hostname: '127.0.0.1',
      port: '8000',
      pathname: '/media/**',
    },
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '8000',
      pathname: '/media/**',
    },
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
      pathname: '/media/**',
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
    // Local Compose/dev media is served from 127.0.0.1:8000 — Next 16 blocks
    // private IPs unless explicitly allowed (showcase / lab stack).
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
