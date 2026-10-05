<script setup lang="ts">
import type { AppInfo } from "@/ipc/types";

defineProps<{ info: AppInfo | null; error: string | null }>();
defineEmits<{ diagnostics: [] }>();
</script>

<template>
  <div class="card bg-base-100 shadow-md w-full max-w-xl">
    <div class="card-body gap-4">
      <h1 class="card-title text-2xl">
        Wavescan
      </h1>
      <p class="text-sm opacity-80">
        Reads your echoes from the Wuthering Waves window and exports them for Wuthering Tools.
        Scanning isn't available yet. For now you can check that Wavescan can see and read your
        game.
      </p>
      <div
        v-if="info"
        class="text-sm"
      >
        <span class="badge badge-neutral mr-2">v{{ info.version }}</span>
        <span class="badge badge-outline">{{ info.platform }}</span>
        <span
          v-if="info.build"
          class="badge badge-ghost ml-2"
        >build {{ info.build }}</span>
      </div>
      <div
        v-else-if="error"
        role="alert"
        class="alert alert-error text-sm"
      >
        {{ error }}
      </div>
      <div class="card-actions justify-end">
        <button
          class="btn btn-primary"
          @click="$emit('diagnostics')"
        >
          Run diagnostics
        </button>
      </div>
    </div>
  </div>
</template>
