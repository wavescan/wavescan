<script setup lang="ts">
import { inject, onMounted, ref } from "vue";
import { errorMessage, getAppInfo } from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import { GAME_DATA_KEY } from "@/data/scannerData";
import { navigation } from "@/ui/navigation";
import AppNav from "@/components/AppNav.vue";
import HomeView from "@/views/HomeView.vue";
import DiagnosticsView from "@/views/DiagnosticsView.vue";
import ScanView from "@/views/ScanView.vue";
import ReviewView from "@/views/ReviewView.vue";
import HelpView from "@/views/HelpView.vue";
import ReportView from "@/views/ReportView.vue";

const info = ref<AppInfo | null>(null);
const error = ref<string | null>(null);
const gameData = inject(GAME_DATA_KEY, null);
/** The mini window hides the sidebar and shows only the scan counter (ScanView). */
const mini = ref(false);

onMounted(async () => {
  try {
    info.value = await getAppInfo();
  } catch (e) {
    error.value = errorMessage(e);
  }
});
</script>

<template>
  <div class="flex h-screen bg-base-200 text-base-content">
    <AppNav
      v-if="!mini"
      :info="info"
    />
    <main
      class="min-w-0 flex-1 overflow-y-auto"
      :class="mini ? 'p-3' : 'p-6 lg:p-8'"
    >
      <!-- Scan stays mounted while other screens show, so a running scan keeps going. -->
      <ScanView
        v-show="navigation.view === 'scan'"
        :info="info"
        @mini="mini = $event"
      />
      <HomeView
        v-if="navigation.view === 'home'"
        :info="info"
        :error="error"
      />
      <ReviewView
        v-else-if="navigation.view === 'review'"
        :info="info"
      />
      <DiagnosticsView
        v-else-if="navigation.view === 'diagnostics'"
        :info="info"
        :game-data="gameData"
      />
      <HelpView
        v-else-if="navigation.view === 'help'"
        :info="info"
        :game-data="gameData"
      />
      <ReportView
        v-else-if="navigation.view === 'report'"
        :info="info"
        :game-data="gameData"
      />
    </main>
  </div>
</template>
