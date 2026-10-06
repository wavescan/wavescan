import { createApp } from "vue";
import App from "./App.vue";
import { GAME_DATA_KEY, loadBundledScannerData } from "./data/scannerData";
import "./style.css";

// Game data must be set before any scanning code runs (ADR 0019).
const gameData = loadBundledScannerData();

createApp(App).provide(GAME_DATA_KEY, gameData).mount("#app");
