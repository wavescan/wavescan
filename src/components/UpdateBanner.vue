<script setup lang="ts">
import { computed, ref } from "vue";
import { releaseUrl } from "@/feedback/links";
import { errorMessage, openUrl } from "@/ipc/commands";
import { navigation } from "@/ui/navigation";
import type { Updater } from "@/update/updater";
import AppIcon from "@/components/AppIcon.vue";

// "Wavescan 0.2.1 is ready: Restart to update" (ADR 0035). Shown once an update has
// downloaded. Restarting waits while a scan runs, so a scan is never cut off. Also the
// warning when a required update failed and the user carried on without it.

const props = defineProps<{ updater: Updater }>();

const state = computed(() => props.updater.state);
const message = ref<string | null>(null);

async function whatsNew() {
  if (!state.value.version) return;
  try {
    await openUrl(releaseUrl(state.value.version));
  } catch (error) {
    message.value = errorMessage(error);
  }
}
</script>

<template>
  <div
    v-if="state.required && state.status === 'failed' && !state.atLaunch"
    role="alert"
    class="alert alert-error mb-5 flex flex-wrap items-center gap-3 text-sm"
  >
    <span class="flex-1">
      <strong>This version has a known problem</strong> and needs Wavescan {{ state.version }}, but the update
      didn't install: {{ state.problem }}
    </span>
    <button
      type="button"
      class="btn btn-sm"
      :disabled="navigation.busy"
      @click="updater.retry()"
    >
      Try again
    </button>
  </div>
  <div
    v-else-if="state.status === 'ready' || (state.status === 'installing' && !state.atLaunch)"
    role="status"
    class="alert alert-info mb-5 flex flex-wrap items-center gap-3 text-sm"
  >
    <span class="flex-1">
      <template v-if="state.status === 'installing'">Installing Wavescan {{ state.version }}…</template>
      <template v-else>
        <strong>Wavescan {{ state.version }}</strong> is ready.
        <template v-if="navigation.busy">It installs when this scan ends and you restart.</template>
        <template v-else>Restart to update, or it installs the next time you open Wavescan.</template>
      </template>
      <span
        v-if="message"
        class="block text-xs"
      >{{ message }}</span>
    </span>
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      @click="whatsNew"
    >
      What's new <AppIcon
        name="external"
        :size="12"
      />
    </button>
    <button
      type="button"
      class="btn btn-primary btn-sm"
      :disabled="navigation.busy || state.status === 'installing'"
      @click="updater.install()"
    >
      Restart to update
    </button>
  </div>
</template>
