// TypeScript mirrors of the Rust IPC types in `src-tauri/src/commands.rs`
// and `src-tauri/src/error.rs`. Change both sides together (CLAUDE.md).

/** Basic facts about the running app, shown on the home and diagnostics screens. */
export interface AppInfo {
  name: string;
  version: string;
  /** Operating system the app was built for. */
  platform: "windows" | "macos" | "linux";
}

/** Every error a Rust command can return, serialized as `{ kind, message }`. */
export interface IpcError {
  kind: string;
  message: string;
}
