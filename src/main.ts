import { createApp } from "vue";
import App from "./App.vue";
import { GAME_DATA_KEY } from "./data/scannerData";
import { refreshGameData, startGameData, whenNotScanning } from "./data/gameData";
import { browserFetchText } from "./data/gameDataDownload";
import type { KeyValueStorage } from "./review/scanStore";
import "./style.css";

function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked: the download is used for this session only
  }
}

async function start() {
  const storage = browserStorage();
  // Game data must be set before any scanning code runs (ADR 0019): the bundled or saved
  // copy first, then the newest from Wuthering Tools in the background (ADR 0034).
  const gameData = await startGameData({ storage });
  createApp(App).provide(GAME_DATA_KEY, gameData).mount("#app");
  void refreshGameData(gameData, {
    storage,
    fetchText: browserFetchText,
    now: () => new Date(),
    whenIdle: whenNotScanning,
  });
}

void start();
