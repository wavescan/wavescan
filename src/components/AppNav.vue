<script setup lang="ts">
import { computed } from "vue";
import type { AppInfo } from "@/ipc/types";
import { useScanStore } from "@/review/scanStore";
import { summarize } from "@/review/list";
import { go, navigation, type View } from "@/ui/navigation";
import AppIcon, { type IconName } from "@/components/AppIcon.vue";

// The sidebar: every screen, how many echoes still need a look, and which build this is.

defineProps<{ info: AppInfo | null }>();

const store = useScanStore();
const summary = computed(() => summarize(store.state.candidates));

const ITEMS: { view: View; label: string; icon: IconName }[] = [
  { view: "home", label: "Home", icon: "home" },
  { view: "scan", label: "Scan", icon: "scan" },
  { view: "review", label: "Review & export", icon: "review" },
  { view: "diagnostics", label: "Diagnostics", icon: "diagnostics" },
  { view: "help", label: "Help & feedback", icon: "help" },
];

const isCurrent = (view: View) => navigation.view === view || (view === "help" && navigation.view === "report");
</script>

<template>
  <nav
    aria-label="Main"
    class="flex w-52 shrink-0 flex-col gap-1 border-r border-base-300 bg-base-100 px-3 py-4"
  >
    <div class="flex items-center gap-2 px-2 pb-4 text-primary">
      <AppIcon
        name="logo"
        :size="24"
      />
      <span class="text-lg font-bold text-base-content">Wavescan</span>
    </div>
    <button
      v-for="item in ITEMS"
      :key="item.view"
      type="button"
      class="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors"
      :class="isCurrent(item.view) ? 'bg-base-200 font-semibold' : 'opacity-80 hover:bg-base-200 hover:opacity-100'"
      :aria-current="isCurrent(item.view) ? 'page' : undefined"
      :disabled="navigation.busy && item.view !== 'scan'"
      @click="go(item.view)"
    >
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
        class="status status-primary animate-pulse"
        aria-label="scanning"
      />
    </button>
    <div class="flex-1" />
    <div class="px-2 text-xs opacity-70">
      <template v-if="info">
        v{{ info.version }}<template v-if="info.build">
          · build <span class="font-mono">{{ info.build }}</span>
        </template>
      </template>
    </div>
  </nav>
</template>
