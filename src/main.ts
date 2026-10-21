import { createApp } from "vue";
import App from "./App.vue";
import { GAME_DATA_KEY } from "./data/scannerData";
import { refreshGameData, startGameData, whenNotScanning } from "./data/gameData";
import { browserFetchText } from "./data/gameDataDownload";
import { getAppInfo } from "./ipc/commands";
import type { KeyValueStorage } from "./review/scanStore";
import { startTheme } from "./settings/theme";
import { navigation } from "./ui/navigation";
import { checkWithTauri, relaunch } from "./update/tauriUpdater";
import { createUpdater, UPDATER_KEY } from "./update/updater";
import "./style.css";

function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked: the download is used for this session only
  }
}

async function start() {
  // The saved colour scheme first, so the window never flashes the wrong one (ADR 0036).
  startTheme();
  const storage = browserStorage();
  // Game data must be set before any scanning code runs (ADR 0019): the bundled or saved
  // copy first, then the newest from Wuthering Tools in the background (ADR 0034).
  const gameData = await startGameData({ storage });
  const info = await getAppInfo().catch(() => null);
  // App updates (ADR 0035). Local builds (no WAVESCAN_BUILD) never update themselves.
  const updater = createUpdater({
    installed: info?.version ?? "0.0.0",
    enabled: Boolean(info?.build),
    check: checkWithTauri,
    relaunch,
    storage,
    now: () => new Date(),
    isBusy: () => navigation.busy,
  });
  createApp(App).provide(GAME_DATA_KEY, gameData).provide(UPDATER_KEY, updater).mount("#app");
  void refreshGameData(gameData, {
    storage,
    fetchText: browserFetchText,
    now: () => new Date(),
    whenIdle: whenNotScanning,
  });
  void updater.check();
}

void start();
