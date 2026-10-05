<script setup lang="ts">
import { onMounted, ref } from "vue";
import { errorMessage, getAppInfo } from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import HomeView from "@/views/HomeView.vue";
import DiagnosticsView from "@/views/DiagnosticsView.vue";

type View = "home" | "diagnostics";

const view = ref<View>("home");
const info = ref<AppInfo | null>(null);
const error = ref<string | null>(null);

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
      @diagnostics="view = 'diagnostics'"
    />
    <DiagnosticsView
      v-else
      :info="info"
      @back="view = 'home'"
    />
  </main>
</template>
