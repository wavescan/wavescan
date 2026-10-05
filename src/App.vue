<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getAppInfo } from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";

const info = ref<AppInfo | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    info.value = await getAppInfo();
  } catch (e) {
    error.value = String(e);
  }
});
</script>

<template>
  <main class="min-h-screen bg-base-200 text-base-content flex items-center justify-center p-6">
    <div class="card bg-base-100 shadow-md w-full max-w-md">
      <div class="card-body gap-4">
        <h1 class="card-title text-2xl">
          Wavescan
        </h1>
        <p class="text-sm opacity-80">
          Reads your echoes from the Wuthering Waves window and exports them for Wuthering Tools.
          Scanning isn't available yet. This build checks that the app runs on your computer.
        </p>
        <div
          v-if="info"
          class="text-sm"
        >
          <span class="badge badge-neutral mr-2">v{{ info.version }}</span>
          <span class="badge badge-outline">{{ info.platform }}</span>
        </div>
        <div
          v-else-if="error"
          role="alert"
          class="alert alert-error text-sm"
        >
          {{ error }}
        </div>
        <span
          v-else
          class="loading loading-dots loading-sm"
        />
      </div>
    </div>
  </main>
</template>
