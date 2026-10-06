<script setup lang="ts">
import { inject, onMounted, ref } from "vue";
import { errorMessage, getAppInfo } from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import { GAME_DATA_KEY } from "@/data/scannerData";
import HomeView from "@/views/HomeView.vue";
import DiagnosticsView from "@/views/DiagnosticsView.vue";
import ScanView from "@/views/ScanView.vue";

type View = "home" | "diagnostics" | "scan";

const view = ref<View>("home");
const info = ref<AppInfo | null>(null);
const error = ref<string | null>(null);
const gameData = inject(GAME_DATA_KEY, null);

onMounted(async () => {
  try {
    info.value = await getAppInfo();
  } catch (e) {
    error.value = errorMessage(e);
  }
});
</script>

<template>
  <main class="min-h-screen bg-base-200 text-base-content flex items-start justify-center p-6">
    <HomeView
      v-if="view === 'home'"
      :info="info"
      :error="error"
      :game-data="gameData"
      @diagnostics="view = 'diagnostics'"
      @scan="view = 'scan'"
    />
    <ScanView
      v-else-if="view === 'scan'"
      :info="info"
      @back="view = 'home'"
    />
    <DiagnosticsView
      v-else
      :info="info"
      :game-data="gameData"
      @back="view = 'home'"
    />
  </main>
</template>
