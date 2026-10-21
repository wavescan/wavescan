<script setup lang="ts">
import { computed } from "vue";
import { filledCells, runningCells } from "@/ui/pixelProgress";

// A progress bar drawn as a row of slanted blocks, like the pixels of the Wavescan mark.
// Give it ONE of:
//   - `fraction` (0 to 1) when the end is known, e.g. an update download: blocks fill up.
//   - `count` when it isn't, e.g. echoes read in an auto scan: one block steps along per echo.
// With neither (or a count of 0), the blocks pulse in a sweep to show it's working.
// Screen readers hear `label`, plus the percentage when there is one.

const props = withDefaults(
  defineProps<{ label: string; fraction?: number | null; count?: number; cells?: number; tone?: "primary" | "warning" }>(),
  { fraction: null, count: 0, cells: 24, tone: "primary" },
);

const mode = computed(() => (props.fraction !== null ? "filled" : props.count > 0 ? "running" : "waiting"));
const cells = computed(() => {
  if (mode.value === "filled") return filledCells(props.cells, props.fraction ?? 0);
  if (mode.value === "running") return runningCells(props.cells, props.count);
  return Array.from({ length: props.cells }, () => "off" as const);
});
const percent = computed(() => (props.fraction === null ? undefined : Math.round(Math.min(1, Math.max(0, props.fraction)) * 100)));
</script>

<template>
  <div
    role="progressbar"
    :aria-label="props.label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    class="pixels flex h-3 w-full gap-[3px] px-1"
    :class="[props.tone === 'warning' ? 'text-warning' : 'text-primary', { waiting: mode === 'waiting' }]"
  >
    <i
      v-for="(cell, i) in cells"
      :key="i"
      class="flex-1 skew-x-24"
      :class="cell"
      :style="mode === 'waiting' ? { animationDelay: `${i * 60}ms` } : undefined"
    />
  </div>
</template>

<style scoped>
i {
  background-color: color-mix(in oklab, var(--color-base-content) 12%, transparent);
  transition: background-color 200ms;
}
i.on {
  background-color: currentColor;
}
i.trail {
  background-color: color-mix(in oklab, currentColor 45%, transparent);
}

.waiting i {
  animation: sweep 1.5s ease-in-out infinite;
}
@keyframes sweep {
  0%, 30%, 100% { background-color: color-mix(in oklab, var(--color-base-content) 12%, transparent); }
  12% { background-color: color-mix(in oklab, currentColor 60%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  i { transition: none; }
  .waiting i {
    animation: none;
    background-color: color-mix(in oklab, currentColor 30%, transparent);
  }
}
</style>
