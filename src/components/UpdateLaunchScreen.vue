<script setup lang="ts">
import { computed } from "vue";
import type { Updater } from "@/update/updater";

// Covers the app while an update installs at launch (ADR 0035): one that was offered last
// time and not installed, or one this version must have (the update file's
// `minimumVersion`). "Not now" puts it off for this session; a required update can only be
// put off if it failed.

const props = defineProps<{ updater: Updater }>();

const state = computed(() => props.updater.state);
const failed = computed(() => state.value.status === "failed");
const percent = computed(() => (state.value.progress === null ? null : Math.round(state.value.progress * 100)));
</script>

<template>
  <div
    v-if="state.atLaunch"
    role="dialog"
    aria-modal="true"
    aria-labelledby="update-h"
    class="fixed inset-0 z-50 flex items-center justify-center bg-base-200/95 p-6"
  >
    <div class="flex w-full max-w-md flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-6 shadow-lg">
      <h2
        id="update-h"
        class="text-xl font-bold"
      >
        Updating Wavescan to {{ state.version }}
      </h2>
      <p
        v-if="state.required"
        class="text-sm"
      >
        This version ({{ state.installed }}) has a known problem, so it has to update before scanning.
      </p>
      <p
        v-else
        class="text-sm opacity-80"
      >
        This update was ready last time. It takes a few seconds, then Wavescan opens again.
      </p>
      <template v-if="!failed">
        <progress
          class="progress progress-primary w-full"
          :value="percent ?? undefined"
          max="100"
        />
        <p class="text-xs opacity-70">
          {{ state.status === "installing" ? "Installing…" : percent === null ? "Downloading…" : `Downloading… ${percent}%` }}
        </p>
      </template>
      <p
        v-else
        role="alert"
        class="alert alert-warning text-sm"
      >
        {{ state.problem }}
      </p>
      <div class="flex justify-end gap-2">
        <button
          v-if="!state.required || failed"
          type="button"
          class="btn btn-ghost btn-sm"
          @click="updater.postpone()"
        >
          {{ failed ? "Continue without updating" : "Not now" }}
        </button>
        <button
          v-if="failed"
          type="button"
          class="btn btn-primary btn-sm"
          @click="updater.retry()"
        >
          Try again
        </button>
      </div>
    </div>
  </div>
</template>
