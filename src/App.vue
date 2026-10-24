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
import SettingsView from "@/views/SettingsView.vue";
import HelpView from "@/views/HelpView.vue";
import ReportView from "@/views/ReportView.vue";
import UpdateBanner from "@/components/UpdateBanner.vue";
import UpdateLaunchScreen from "@/components/UpdateLaunchScreen.vue";
import { UPDATER_KEY } from "@/update/updater";

const info = ref<AppInfo | null>(null);
const error = ref<string | null>(null);
const gameData = inject(GAME_DATA_KEY, null);
const updater = inject(UPDATER_KEY, null);
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
    <!-- `relative` keeps absolutely positioned bits (screen-reader-only labels) inside the
         scrolling area, so they can't make the whole window scroll as well. -->
    <main
      class="relative min-w-0 flex-1 overflow-y-auto"
      :class="mini ? 'p-3' : 'p-6 lg:p-8'"
    >
      <UpdateBanner
        v-if="updater && !mini"
        :updater="updater"
      />
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
        :game-data="gameData"
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
      <SettingsView v-else-if="navigation.view === 'settings'" />
      <HelpView
        v-else-if="navigation.view === 'help'"
        :info="info"
        :game-data="gameData"
        :updater="updater"
      />
      <ReportView
        v-else-if="navigation.view === 'report'"
        :info="info"
        :game-data="gameData"
      />
    </main>
    <UpdateLaunchScreen
      v-if="updater"
      :updater="updater"
    />
  </div>
</template>
