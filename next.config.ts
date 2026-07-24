import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8")) as { version: string };

const isProdBuild = process.env.NODE_ENV === "production";

const libsignalMsrcrypto = join(
  __dirname,
  "node_modules/@privacyresearch/libsignal-protocol-typescript/lib/msrcrypto.js"
);
const libsignalWebCryptoFallback = join(__dirname, "src/lib/libsignalWebCryptoFallback.js");

const nextConfig: NextConfig = {
  /** Только `next build`: статический `out/` для Capacitor. */
  ...(isProdBuild ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@privacyresearch/libsignal-protocol-typescript"],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output = config.output ?? {};
      config.output.globalObject = "self";
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...config.resolve.alias,
        [libsignalMsrcrypto]: libsignalWebCryptoFallback,
      };
    }
    return config;
  },
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
