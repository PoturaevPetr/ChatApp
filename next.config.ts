import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8")) as { version: string };

const isProdBuild = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  /** Только `next build`: статический `out/` для Capacitor. В `next dev` без export — работают rewrites (обход CORS к llm). */
  ...(isProdBuild ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  ...(!isProdBuild
    ? {
        async rewrites() {
          const target = (process.env.NEXT_PUBLIC_OLLAMA_BASE_URL ?? "https://llm.oclinica.ru").replace(
            /\/+$/,
            "",
          );
          return [{ source: "/api/ollama-proxy/:path*", destination: `${target}/:path*` }];
        },
      }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "microphone=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
