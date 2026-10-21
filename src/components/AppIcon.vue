<script setup lang="ts">
// Small line icons drawn inline (no icon font or image files, so nothing extra to load).
// The main screens' icons use the mark's geometry (30° edges, a cube for Scan, a hexagon for
// Help, a hexagon nut for Settings). The app's own mark is WavescanMark.vue.
// Decorative: they're hidden from screen readers, so put the meaning in nearby text or an
// aria-label on the button.

export type IconName =
  | "home"
  | "scan"
  | "review"
  | "diagnostics"
  | "help"
  | "settings"
  | "check"
  | "alert"
  | "x"
  | "external"
  | "search"
  | "shield"
  | "code"
  | "chat"
  | "book"
  | "bug"
  | "mini"
  | "undo"
  | "trash"
  | "copy";

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 });

const PATHS: Record<IconName, string[]> = {
  home: ["M3 11.2L12 6l9 5.2", "M5.5 10.2V20h13v-9.8"],
  scan: ["M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z", "M4.6 7.75L12 12l7.4-4.25", "M12 12v8.5"],
  review: ["M9 6h11", "M9 12h11", "M9 18h11", "M4 6l1 1 2-2", "M4 12l1 1 2-2", "M4 18l1 1 2-2"],
  diagnostics: ["M3 12h4l3-7 4 14 3-7h4"],
  help: ["M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z", "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6", "M12 17h.01"],
  settings: ["M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  check: ["M5 12l5 5 9-10"],
  alert: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v6", "M12 16.5v.5"],
  x: ["M6 6l12 12", "M18 6L6 18"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"],
  code: ["M8 7l-5 5 5 5", "M16 7l5 5-5 5", "M14 4l-4 16"],
  chat: ["M4 5h16v11H9l-5 4z"],
  book: ["M5 4h10l4 4v12H5z", "M9 12h6", "M9 16h6"],
  bug: ["M8 4h8l1 3H7z", "M12 11v5", "M3 12h3", "M18 12h3", "M4 18l2-1", "M20 18l-2-1", "M11 7h2a5 5 0 0 1 5 5v3a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-3a5 5 0 0 1 5-5z"],
  mini: ["M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M14 12h5v5h-5z"],
  undo: ["M9 14L4 9l5-5", "M4 9h10a6 6 0 0 1 0 12h-3"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
};
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <path
      v-for="(d, i) in PATHS[props.name]"
      :key="i"
      :d="d"
    />
  </svg>
</template>
