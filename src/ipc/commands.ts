import { invoke } from "@tauri-apps/api/core";
import type { AppInfo } from "./types";

// One typed wrapper per Rust command. Views call these, never `invoke` directly,
// so the command names and argument shapes live in exactly one place.

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}
