import { reactive, type InjectionKey } from "vue";
import type { KeyValueStorage } from "@/review/scanStore";
import { channelOf, compareVersions, isVersion, type UpdateChannel } from "./version";

// App updates (ADR 0035). On launch Wavescan asks its channel's update file on GitHub
// whether there's a newer version. If there is:
// - first time it's seen: download it in the background and offer "Restart to update"
// - it was already offered on an earlier launch and not installed: install it now, at launch
//   (the user can put it off for this session)
// - the update file says this version is too old (`minimumVersion`): install it now, with
//   no "not now"
// An install never starts while a scan is running. Signature checks happen in Rust
// (tauri-plugin-updater): an update that isn't signed with the key built into the app is
// refused there. Everything here is decisions and state, so it's tested with fakes.

/** How screens get the app's updater (provided in main.ts). */
export const UPDATER_KEY: InjectionKey<Updater> = Symbol("updater");

/** Remembers which version was offered, so the next launch installs it. */
export const OFFERED_KEY = "wavescan.updateOffered";

/** A newer version, as the update file announces it. */
export interface AvailableUpdate {
  version: string;
  /** Release notes from the update file. */
  notes: string | null;
  /** Versions older than this must update before scanning (from the update file). */
  minimumVersion: string | null;
  /** Downloads the update and checks its signature. Reports bytes done and the total. */
  download(onProgress: (done: number, total: number | null) => void): Promise<void>;
  /** Installs the downloaded update. On Windows the installer closes and reopens the app. */
  install(): Promise<void>;
}

export interface UpdaterDeps {
  /** This copy's version. */
  installed: string;
  /** False for local builds: they never update themselves. */
  enabled: boolean;
  /** Asks the update file for a newer version; null when this one is the newest. */
  check(): Promise<AvailableUpdate | null>;
  /** Restarts the app after an install (macOS; Windows' installer reopens it itself). */
  relaunch(): Promise<void>;
  storage: KeyValueStorage | null;
  now(): Date;
  /** True while a scan is running: installs wait. */
  isBusy(): boolean;
}

export type UpdateStatus =
  | "off" // local build
  | "idle"
  | "checking"
  | "current"
  | "downloading"
  | "ready"
  | "installing"
  | "failed";

export interface UpdateState {
  status: UpdateStatus;
  channel: UpdateChannel;
  installed: string;
  /** The newer version, once one is found. */
  version: string | null;
  notes: string | null;
  /** Download progress, 0 to 1, when the size is known. */
  progress: number | null;
  /** When the last check finished (ISO). */
  checkedAt: string | null;
  /** Why the last check, download or install failed. */
  problem: string | null;
  /** Installing at launch: the full-screen "Updating Wavescan" view. */
  atLaunch: boolean;
  /** This version is older than the update file's minimum: the update can't be put off. */
  required: boolean;
}

export type LaunchDecision = "none" | "offer" | "installNow";

/**
 * What to do with an update found at launch. `offeredBefore` is the version an earlier
 * launch offered (saved under OFFERED_KEY), if any.
 */
export function decideAtLaunch(
  installed: string,
  update: Pick<AvailableUpdate, "version" | "minimumVersion"> | null,
  offeredBefore: string | null,
): { decision: LaunchDecision; required: boolean } {
  if (!update || compareVersions(update.version, installed) <= 0) return { decision: "none", required: false };
  const required =
    update.minimumVersion !== null && isVersion(update.minimumVersion) && compareVersions(installed, update.minimumVersion) < 0;
  const ignoredBefore = offeredBefore !== null && compareVersions(offeredBefore, installed) > 0;
  return { decision: required || ignoredBefore ? "installNow" : "offer", required };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface Updater {
  state: UpdateState;
  /** Checks for an update and acts on it (see decideAtLaunch). Never throws. */
  check(): Promise<void>;
  /** Installs the downloaded update and restarts. Does nothing while a scan runs. */
  install(): Promise<void>;
  /** "Not now" on the launch screen: keep it as "Restart to update" for this session. */
  postpone(): void;
  /** After a failure: installs again if the download finished, else checks again. */
  retry(): Promise<void>;
}

/** One line for Help: where updates stand. */
export function updateStatusText(state: UpdateState): string {
  const channel = state.channel === "tester" ? "tester builds" : "releases";
  switch (state.status) {
    case "off":
      return "Local build: updates are off.";
    case "idle":
    case "checking":
      return "Checking for updates…";
    case "current":
      return `Up to date (gets ${channel}).`;
    case "downloading":
      return `Downloading ${state.version ?? "the update"}${state.progress === null ? "…" : ` (${Math.round(state.progress * 100)}%)`}`;
    case "ready":
      return `${state.version ?? "An update"} is ready: restart to update.`;
    case "installing":
      return `Installing ${state.version ?? "the update"}…`;
    case "failed":
      return `${state.problem ?? "The update failed."} Wavescan tries again next launch.`;
  }
}

export function createUpdater(deps: UpdaterDeps): Updater {
  const state = reactive<UpdateState>({
    status: deps.enabled ? "idle" : "off",
    channel: channelOf(deps.installed),
    installed: deps.installed,
    version: null,
    notes: null,
    progress: null,
    checkedAt: null,
    problem: null,
    atLaunch: false,
    required: false,
  });
  let pending: AvailableUpdate | null = null;
  let downloaded = false;
  let postponed = false;

  function read(key: string): string | null {
    try {
      return deps.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  function write(key: string, value: string | null) {
    try {
      if (value === null) deps.storage?.removeItem(key);
      else deps.storage?.setItem(key, value);
    } catch {
      // storage blocked: the update is offered again next launch instead of installed
    }
  }
  function fail(problem: string) {
    state.status = "failed";
    state.problem = problem;
  }

  async function install(): Promise<void> {
    if (!pending || !downloaded || deps.isBusy() || state.status === "installing") return;
    state.status = "installing";
    try {
      await pending.install();
      await deps.relaunch();
    } catch (error) {
      fail(`couldn't install the update: ${message(error)}`);
    }
  }

  async function download(update: AvailableUpdate): Promise<boolean> {
    state.status = "downloading";
    state.progress = null;
    try {
      await update.download((done, total) => {
        state.progress = total ? Math.min(1, done / total) : null;
      });
      downloaded = true;
      return true;
    } catch (error) {
      fail(`couldn't download the update: ${message(error)}`);
      return false;
    }
  }

  async function check(): Promise<void> {
    if (state.status === "off" || state.status === "checking" || state.status === "downloading" || state.status === "installing") {
      return;
    }
    if (downloaded) return; // an update is ready: nothing newer is needed this session
    state.status = "checking";
    state.problem = null;
    let update: AvailableUpdate | null;
    try {
      update = await deps.check();
    } catch (error) {
      state.checkedAt = deps.now().toISOString();
      fail(`couldn't check for updates: ${message(error)}`);
      return;
    }
    state.checkedAt = deps.now().toISOString();
    const { decision, required } = decideAtLaunch(deps.installed, update, read(OFFERED_KEY));
    if (!update || decision === "none") {
      write(OFFERED_KEY, null);
      state.status = "current";
      return;
    }
    pending = update;
    state.version = update.version;
    state.notes = update.notes;
    state.required = required;
    state.atLaunch = decision === "installNow" && !deps.isBusy();
    write(OFFERED_KEY, update.version);
    if (!(await download(update))) return;
    if (state.atLaunch && !postponed && !deps.isBusy()) {
      await install();
      return;
    }
    state.atLaunch = false;
    state.status = "ready";
  }

  function postpone() {
    if (state.required && state.status !== "failed") return;
    postponed = true;
    state.atLaunch = false;
    if (downloaded && state.status !== "failed") state.status = "ready";
  }

  async function retry() {
    if (downloaded) await install();
    else await check();
  }

  return { state, check, install, postpone, retry };
}
