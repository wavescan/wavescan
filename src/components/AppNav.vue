<script setup lang="ts">
import { computed, ref } from "vue";
import { errorMessage, openUrl } from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import { DISCORD_URL } from "@/feedback/links";
import { useScanStore } from "@/review/scanStore";
import { summarize } from "@/review/list";
import { go, navigation, type View } from "@/ui/navigation";
import AppIcon, { type IconName } from "@/components/AppIcon.vue";
import DiscordIcon from "@/components/DiscordIcon.vue";
import WavescanMark from "@/components/WavescanMark.vue";

// The sidebar: every screen, how many echoes still need a look, a link to Wavescan's Discord
// and which build this is.
// While a scan runs, the mark at the top reacts to each echo read (WavescanMark's `beat`).

defineProps<{ info: AppInfo | null }>();

const store = useScanStore();
const summary = computed(() => summarize(store.state.candidates));

const ITEMS: { view: View; label: string; icon: IconName }[] = [
  { view: "home", label: "Home", icon: "home" },
  { view: "scan", label: "Scan", icon: "scan" },
  { view: "review", label: "Review & export", icon: "review" },
  { view: "diagnostics", label: "Diagnostics", icon: "diagnostics" },
  { view: "settings", label: "Settings", icon: "settings" },
  { view: "help", label: "Help & feedback", icon: "help" },
];

const markBeat = computed(() => (navigation.busy ? summary.value.total : 0));

/** Why the Discord link didn't open, with the address to type in instead. */
const discordError = ref<string | null>(null);

async function openDiscord() {
  try {
    discordError.value = null;
    await openUrl(DISCORD_URL);
  } catch (error) {
    discordError.value = `Couldn't open your browser: ${errorMessage(error)}. The address is ${DISCORD_URL}`;
  }
}

const isCurrent = (view: View) => navigation.view === view || (view === "help" && navigation.view === "report");
</script>

<template>
  <nav
    aria-label="Main"
    class="flex w-60 shrink-0 flex-col gap-1 bg-base-100 px-3 py-4"
  >
    <div class="flex items-center gap-2.5 px-2 pb-4">
      <WavescanMark
        :size="24"
        :beat="markBeat"
      />
      <span class="font-title text-lg text-base-content">Wavescan</span>
    </div>
    <button
      v-for="item in ITEMS"
      :key="item.view"
      type="button"
      class="relative flex min-h-11 items-center gap-3 rounded-sm px-3 text-left text-sm transition-colors"
      :class="isCurrent(item.view) ? 'bg-base-200 font-semibold' : 'opacity-80 hover:bg-base-200 hover:opacity-100'"
      :aria-current="isCurrent(item.view) ? 'page' : undefined"
      :disabled="navigation.busy && item.view !== 'scan'"
      @click="go(item.view)"
    >
      <span
        v-if="isCurrent(item.view)"
        class="absolute inset-y-3 left-1.5 w-1 skew-x-24 bg-primary"
        aria-hidden="true"
      />
      <AppIcon :name="item.icon" />
      <span class="flex-1">{{ item.label }}</span>
      <span
        v-if="item.view === 'review' && summary.toCheck > 0"
        class="badge badge-warning badge-sm"
        :aria-label="`${summary.toCheck} to check`"
      >{{ summary.toCheck }}</span>
      <span
        v-else-if="item.view === 'review' && summary.total > 0"
        class="badge badge-ghost badge-sm"
      >{{ summary.total }}</span>
      <span
        v-if="item.view === 'scan' && navigation.busy"
        class="badge badge-primary badge-outline badge-sm"
      >live</span>
    </button>
    <div class="flex-1" />
    <button
      type="button"
      class="flex min-h-11 items-center gap-3 rounded-sm px-3 text-left text-sm opacity-80 transition-colors hover:bg-base-200 hover:opacity-100"
      aria-label="Join the Wavescan Discord (opens in your browser)"
      @click="openDiscord"
    >
      <DiscordIcon />
      <span class="flex-1">Discord</span>
    </button>
    <p
      v-if="discordError"
      role="alert"
      class="px-2 pb-2 text-xs break-words text-error"
    >
      {{ discordError }}
    </p>
    <div class="px-2 text-xs opacity-70">
      <template v-if="info">
        v{{ info.version }}<template v-if="info.build">
          · build <span class="font-mono">{{ info.build }}</span>
        </template>
      </template>
    </div>
  </nav>
</template>
