<script setup lang="ts">
import { computed } from "vue";
import { MODES, SCHEME_INFO, SCHEMES, setTheme, theme, themeName, type Mode } from "@/settings/theme";
import WavescanMark from "@/components/WavescanMark.vue";

// Appearance: the three colour schemes and dark / light / follow the system (ADR 0036).
// Each scheme card is drawn in its own theme (`data-theme` on the card), so what you see is
// exactly what you get. The choice is kept on this PC only.

const current = theme();
const MODE_LABEL: Record<Mode, string> = { dark: "Dark", light: "Light", system: "Match my computer" };

const prefersDark = computed(() => {
  // Read when the picker renders; the app itself follows changes live (startTheme).
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <fieldset class="grid gap-3 sm:grid-cols-3">
      <legend class="sr-only">
        Colour scheme
      </legend>
      <label
        v-for="scheme in SCHEMES"
        :key="scheme"
        :data-theme="themeName({ scheme, mode: current.mode }, prefersDark)"
        class="flex cursor-pointer flex-col overflow-hidden rounded-box border-2 bg-base-100 text-base-content"
        :class="current.scheme === scheme ? 'border-primary' : 'border-transparent'"
      >
        <span class="flex h-20 items-end gap-2.5 bg-base-200 p-3">
          <WavescanMark :size="26" />
          <span class="font-title text-xl leading-none text-accent">Dreamless</span>
          <span class="ml-auto flex">
            <span
              v-for="tone in ['bg-primary', 'bg-accent', 'bg-warning', 'bg-secondary']"
              :key="tone"
              class="h-4 w-2.5 skew-x-24"
              :class="tone"
            />
          </span>
        </span>
        <span class="flex items-start gap-2.5 p-3">
          <input
            type="radio"
            name="scheme"
            class="radio radio-xs radio-primary mt-1"
            :checked="current.scheme === scheme"
            @change="setTheme({ scheme })"
          >
          <span class="flex flex-col">
            <span class="text-sm font-semibold">
              {{ SCHEME_INFO[scheme].name }}<span
                v-if="scheme === 'glass'"
                class="text-xs font-normal opacity-70"
              > · default</span>
            </span>
            <span class="text-xs opacity-70">{{ SCHEME_INFO[scheme].from }}</span>
          </span>
        </span>
      </label>
    </fieldset>

    <div
      role="radiogroup"
      aria-label="Dark or light"
      class="tabs-line self-start"
    >
      <button
        v-for="mode in MODES"
        :key="mode"
        type="button"
        role="radio"
        :aria-checked="current.mode === mode"
        @click="setTheme({ mode })"
      >
        {{ MODE_LABEL[mode] }}
      </button>
    </div>
  </div>
</template>
