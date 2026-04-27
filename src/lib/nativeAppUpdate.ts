"use client";

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

type ProgressHandler = (receivedBytes: number, totalBytes: number) => void;

export async function downloadAndInstallAndroidApk(
  downloadUrl: string,
  onProgress?: ProgressHandler,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    throw new Error("In-app APK install is supported only on Android native app.");
  }
  if (!downloadUrl) {
    throw new Error("Download URL is empty.");
  }

  const updatesDir = "updates";
  await Filesystem.mkdir({
    path: updatesDir,
    directory: Directory.Cache,
    recursive: true,
  }).catch(() => {
    // directory may already exist
  });

  const path = `${updatesDir}/kindred-update-${Date.now()}.apk`;
  const progressListener = await Filesystem.addListener("progress", (event) => {
    if (!onProgress) return;
    const total = typeof event.contentLength === "number" ? event.contentLength : 0;
    const received = typeof event.bytes === "number" ? event.bytes : 0;
    onProgress(received, total);
  });

  let localPath = "";
  let localUri = "";
  try {
    const result = await Filesystem.downloadFile({
      url: downloadUrl,
      path,
      directory: Directory.Cache,
      recursive: true,
      progress: true,
    });
    localPath = result.path || "";
    const uriResult = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    }).catch(() => null);
    localUri = uriResult?.uri || "";
  } finally {
    await progressListener.remove().catch(() => {
      // no-op
    });
  }

  if (!localPath) {
    throw new Error("Failed to resolve downloaded APK path.");
  }

  const { FileOpener } = await import("@capawesome-team/capacitor-file-opener");
  const targetPath = localUri || localPath;
  await FileOpener.openFile({
    path: targetPath,
    mimeType: "application/vnd.android.package-archive",
  });
}

