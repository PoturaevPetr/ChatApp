/**
 * После next build: пишет app-version.json в out/ (и public/ для dev).
 * Нужен MobileShell / CDN для cache-bust и hard-reload после деплоя UI.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));

const payload = {
  name: "kindred-chatapp",
  version: pkg.version,
  builtAt: new Date().toISOString(),
  bridgeVersion: 1,
  minNativeVersion: process.env.NEXT_PUBLIC_WEB_MIN_NATIVE_VERSION || null,
};

function write(path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log("[write-app-version]", path, payload.version);
}

write(join(root, "public", "app-version.json"));
if (existsSync(join(root, "out"))) {
  write(join(root, "out", "app-version.json"));
}
