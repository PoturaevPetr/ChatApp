"use strict";

/**
 * libsignal loads msrcrypto via require() even when Web Crypto exists (webpack always bundles it).
 * The stock msrcrypto UMD uses `this`, which is undefined in strict ESM bundles → Safari crash.
 * Alias this file in next.config instead of msrcrypto.js.
 */
if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle) {
  module.exports = globalThis.crypto;
} else {
  module.exports = globalThis.crypto;
}
