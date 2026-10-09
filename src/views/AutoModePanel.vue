<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import type { FrameSize } from "@wutheringtools/scanner-core";
import { createAutoScan, readEchoWith, type AutoScanResult } from "@/auto/autoScan";
import type { NavigatorProgress } from "@/auto/navigator";
import { CONFIRMATION_PHRASE } from "@/diagnostics/inputTest";
import {
  armAutoMode,
  autoClick,
  autoFocusGame,
  autoScroll,
  disarmAutoMode,
  errorMessage,
  getCaptureStatus,
  sampleRegions,
  startCapture,
  stopCapture,
} from "@/ipc/commands";
import { readEchoRegions } from "@/ocr/appReader";
import type { AppInfo } from "@/ipc/types";
import type { ExtractedEcho } from "@/session/echoExtract";

// Auto mode (ADR 0006, 0023, 0024): the Fair Play warning, the typed confirmation, a
// minimum level, then a scan run by `createAutoScan`. Every echo read is handed to
// ScanView, which keeps the list and the export for both modes. Auto mode is armed only for
// the length of one scan, and the confirmation has to be typed again for the next one.

const props = defineProps<{ info: AppInfo | null; disabled: boolean }>();
const emit = defineEmits<{ echo: [echo: ExtractedEcho]; running: [running: boolean]; frame: [frame: FrameSize] }>();

const MIN_LEVELS = [
  { value: 0, label: "All echoes" },
  { value: 5, label: "+5 and up" },
  { value: 10, label: "+10 and up" },
  { value: 15, label: "+15 and up" },
  { value: 20, label: "+20 and up" },
  { value: 25, label: "+25 only" },
] as const;

const confirmation = ref("");
const minLevel = ref(0);
const running = ref(false);
const progress = ref<NavigatorProgress | null>(null);
const result = ref<AutoScanResult | null>(null);
const stopKeyActive = ref<boolean | null>(null);
const scan = shallowRef<ReturnType<typeof createAutoScan<ExtractedEcho>> | null>(null);

const confirmed = computed(() => confirmation.value.trim().toLowerCase() === CONFIRMATION_PHRASE.toLowerCase());
const isWindows = computed(() => props.info?.platform === "windows");
/** Auto mode needs administrator on Windows (ADR 0023); null means Wavescan couldn't tell. */
const notElevated = computed(() => isWindows.value && props.info?.elevated === false);
const canStart = computed(() => confirmed.value && !running.value && !props.disabled && !notElevated.value);

const RESULT_STYLE: Record<AutoScanResult["reason"], string> = {
  "end-of-list": "alert-success",
  "below-min-level": "alert-success",
  stopped: "alert-info",
  aborted: "alert-warning",
  "not-started": "alert-error",
  "unsupported-shape": "alert-error",
  "grid-not-found": "alert-error",
  "clicks-not-landing": "alert-error",
  "lost-track": "alert-warning",
};

async function start() {
  if (!canStart.value) return;
  running.value = true;
  emit("running", true);
  result.value = null;
  progress.value = null;
  stopKeyActive.value = null;
  const phrase = confirmation.value;
  confirmation.value = ""; // re-armed every scan (ADR 0006)
  scan.value = createAutoScan(
    {
      startCapture,
      stopCapture,
      frameSize: async () => {
        const status = await getCaptureStatus();
        return status.frame ? { width: status.frame.width, height: status.frame.height } : null;
      },
      arm: armAutoMode,
      focusGame: autoFocusGame,
      disarm: disarmAutoMode,
      click: autoClick,
      scroll: autoScroll,
      sampleRegions,
      readEcho: readEchoWith(readEchoRegions),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => performance.now(),
      errorMessage,
    },
    { phrase, minLevel: minLevel.value },
    {
      onStarted: (info) => {
        stopKeyActive.value = info.stopKeyActive;
        emit("frame", info.frame);
      },
      onEcho: (echo) => emit("echo", echo),
      onProgress: (p) => (progress.value = p),
    },
  );
  try {
    result.value = await scan.value.run();
  } finally {
    scan.value = null;
    running.value = false;
    emit("running", false);
  }
}

function stop() {
  scan.value?.stop();
}

onBeforeUnmount(stop);
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-box border border-warning/40 bg-warning/10 p-4 space-y-3 text-sm">
      <p>
        <strong>⚠️ Read this before using auto mode.</strong> Kuro Games' Fair Play Policy
        (linked from the README) prohibits third-party tools and macros. Auto mode sends mouse clicks to the game,
        which some people consider a macro. We don't know of anyone being banned for scanning,
        and Wavescan never touches the game's memory or files. <strong>But Kuro hasn't said tools
          like this are allowed, so there is some risk to your account.</strong> Watch mode
        doesn't send any input to the game, so that risk doesn't apply to it.
      </p>
      <ol class="list-decimal list-inside space-y-1 opacity-90">
        <li>In the game, open <strong>Bag → Echoes</strong>, sorted by <strong>Level</strong> (highest first).</li>
        <li>Press <strong>Start auto scan</strong>. Wavescan brings the game to the front and clicks through your echoes.</li>
        <li><strong>Don't touch the mouse or keyboard</strong> until it's done.</li>
        <li>To stop at any time, <strong>move the mouse</strong> or press <strong>F8</strong>. Everything read so far is kept.</li>
      </ol>
    </div>

    <div
      v-if="notElevated"
      role="alert"
      class="alert alert-error text-sm"
    >
      Auto mode needs Wavescan to run as administrator, because Windows blocks clicks from
      normal apps into the game. Close Wavescan, right-click it and choose
      <strong>Run as administrator</strong>. Watch mode works without it.
    </div>
    <div
      v-else-if="isWindows && info?.elevated === null"
      class="text-xs opacity-70"
    >
      Couldn't tell whether Wavescan runs as administrator. Auto mode needs it on Windows.
    </div>
    <div
      v-if="info?.platform === 'macos'"
      class="text-xs opacity-70"
    >
      The first time, macOS asks for <strong>Accessibility</strong> permission, which auto mode needs to click.
    </div>

    <div class="flex flex-wrap items-end gap-4">
      <label class="form-control w-full max-w-xs">
        <span class="label-text text-sm">Type <strong>{{ CONFIRMATION_PHRASE }}</strong> to continue</span>
        <input
          v-model="confirmation"
          type="text"
          class="input input-bordered input-sm"
          autocomplete="off"
          :disabled="running || disabled"
        >
      </label>
      <label class="form-control w-48">
        <span class="label-text text-sm">Which echoes</span>
        <select
          v-model.number="minLevel"
          class="select select-bordered select-sm"
          :disabled="running || disabled"
        >
          <option
            v-for="option in MIN_LEVELS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <button
        v-if="!running"
        class="btn btn-warning btn-sm"
        :disabled="!canStart"
        @click="start"
      >
        Start auto scan
      </button>
      <button
        v-else
        class="btn btn-sm"
        @click="stop"
      >
        Stop
      </button>
    </div>

    <div
      v-if="running"
      class="flex flex-wrap items-center gap-3 text-sm"
    >
      <span
        class="loading loading-ring loading-sm"
        aria-label="scanning"
      />
      <span v-if="progress">
        Row {{ progress.row + 1 }} · {{ progress.echoes }} echoes read
        <template v-if="progress.errors">· {{ progress.errors }} couldn't be read</template>
      </span>
      <span v-else>Starting…</span>
      <span
        v-if="stopKeyActive === false"
        class="text-warning"
      >F8 isn't available (another app uses it). Move the mouse to stop.</span>
      <span
        v-else-if="stopKeyActive"
        class="opacity-70"
      >Move the mouse or press F8 to stop.</span>
    </div>

    <div
      v-if="result"
      role="alert"
      class="alert text-sm"
      :class="RESULT_STYLE[result.reason]"
    >
      <div>
        <div>{{ result.detail }}</div>
        <div
          v-if="result.reason !== 'not-started'"
          class="opacity-80"
        >
          {{ result.echoes }} echoes read
          <template v-if="result.errors">
            · {{ result.errors }} couldn't be read
          </template>
          <template v-if="result.unchanged">
            · {{ result.unchanged }} {{ result.unchanged === 1 ? "click" : "clicks" }} didn't change the echo shown
            (empty slots at the end of the list, an exact copy of the echo before it, or a click that didn't land)
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
