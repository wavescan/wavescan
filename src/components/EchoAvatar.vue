<script setup lang="ts">
import { computed } from "vue";
import { echoIconUrl } from "@/data/echoIcons";

// An echo's picture, as people know it from the game. Falls back to the name's initials
// (or "?" for an echo that wasn't recognised) when there's no bundled picture.

const props = defineProps<{
  /** Echo key in the game data, or null if the name wasn't recognised. */
  echo: string | null;
  /** Name shown in the placeholder's initials. */
  name: string;
  /** Tailwind size class, e.g. "size-10". */
  sizeClass: string;
}>();

const url = computed(() => echoIconUrl(props.echo));
const initials = computed(() =>
  props.echo
    ? props.name
        .replace(/^Phantom:\s*/, "")
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0] ?? "")
        .join("")
    : "?",
);
</script>

<template>
  <div
    class="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-base-300 text-xs font-bold text-base-content/60"
    :class="sizeClass"
    aria-hidden="true"
  >
    <img
      v-if="url"
      :src="url"
      alt=""
      class="size-full object-contain"
    >
    <span v-else>{{ initials }}</span>
  </div>
</template>
