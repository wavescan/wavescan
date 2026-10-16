import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { activity } from "@/feedback/activity";
import type { AvailableUpdate } from "./updater";

// The real update check and install, through tauri-plugin-updater (ADR 0035). Rust fetches
// the channel's update file (the endpoint in tauri.conf.json), downloads the installer and
// refuses it unless it's signed with the updater key built into the app. Counted in
// "What Wavescan did this session".

/** Asks GitHub for a newer version. Null when this copy is the newest. */
export async function checkWithTauri(): Promise<AvailableUpdate | null> {
  activity.updateChecks++;
  const update = await check({ timeout: 30_000 });
  if (!update) return null;
  const minimum = update.rawJson.minimumVersion;
  return {
    version: update.version,
    notes: update.body?.trim() || null,
    minimumVersion: typeof minimum === "string" ? minimum : null,
    async download(onProgress) {
      activity.updateDownloads++;
      let done = 0;
      let total: number | null = null;
      await update.download((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? null;
        if (event.event === "Progress") {
          done += event.data.chunkLength;
          onProgress(done, total);
        }
      });
    },
    install: () => update.install(),
  };
}

export { relaunch };
