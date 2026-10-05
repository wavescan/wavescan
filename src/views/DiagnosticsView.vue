<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  errorKind,
  errorMessage,
  findGameWindow,
  getCapturePreview,
  getCaptureStatus,
  getWindowCandidates,
  ocrRegion,
  startCapture,
  stopCapture,
} from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import { decodePreview } from "@/diagnostics/preview";
import { OCR_TEST_REGIONS } from "@/diagnostics/regions";
import {
  buildReport,
  formatReport,
  type Check,
  type DiagnosticsInput,
  type Outcome,
} from "@/diagnostics/report";

const props = defineProps<{ info: AppInfo | null }>();
defineEmits<{ back: [] }>();

const running = ref(false);
const step = ref("");
const checks = ref<Check[]>([]);
const reportText = ref("");
const copied = ref(false);
const canvas = ref<HTMLCanvasElement | null>(null);

/** Capture frame rate requested while diagnosing (enough to measure, light on the GPU). */
const DIAGNOSTIC_FPS = 30;
/** How long to let frames arrive before measuring the frame rate. */
const WARMUP_MS = 2000;

async function attempt<T>(work: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, error: errorMessage(error), kind: errorKind(error) };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function drawPreview() {
  const target = canvas.value;
  if (!target) return;
  const preview = decodePreview(await getCapturePreview(target.clientWidth || 640));
  target.width = preview.width;
  target.height = preview.height;
  target
    .getContext("2d")
    ?.putImageData(new ImageData(preview.rgba, preview.width, preview.height), 0, 0);
}

async function run() {
  running.value = true;
  copied.value = false;
  const input: DiagnosticsInput = {
    app: props.info,
    userAgent: navigator.userAgent,
    window: null,
    candidates: [],
    capture: null,
    ocr: [],
  };
  try {
    step.value = "Looking for the game window…";
    input.window = await attempt(findGameWindow);
    const candidates = await attempt(getWindowCandidates);
    input.candidates = candidates.ok ? candidates.value : [];

    if (input.window.ok) {
      step.value = "Capturing the game for a couple of seconds…";
      const started = await attempt(() => startCapture(DIAGNOSTIC_FPS));
      if (started.ok) {
        await sleep(WARMUP_MS);
        input.capture = await attempt(getCaptureStatus);
        await attempt(drawPreview);

        for (const test of OCR_TEST_REGIONS) {
          step.value = `Reading text: ${test.label}…`;
          input.ocr.push({
            id: test.id,
            label: test.label,
            outcome: await attempt(() => ocrRegion(test.region)),
          });
        }
      } else {
        input.capture = started;
      }
    }
  } finally {
    await attempt(stopCapture);
    const report = buildReport(input);
    checks.value = report.checks;
    reportText.value = formatReport(report);
    step.value = "";
    running.value = false;
  }
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportText.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

onBeforeUnmount(() => {
  void attempt(stopCapture);
});

const badge: Record<Check["status"], string> = {
  pass: "badge-success",
  warn: "badge-warning",
  fail: "badge-error",
  skipped: "badge-ghost",
};
</script>

<template>
  <div class="card bg-base-100 shadow-md w-full max-w-3xl">
    <div class="card-body gap-4">
      <div class="flex items-center justify-between">
        <h1 class="card-title text-2xl">
          Diagnostics
        </h1>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="running"
          @click="$emit('back')"
        >
          Back
        </button>
      </div>

      <ol class="list-decimal list-inside text-sm opacity-80 space-y-1">
        <li>Open Wuthering Waves and go to <strong>Bag → Echoes</strong>.</li>
        <li>Click any echo so its details show on the right.</li>
        <li>Come back here and press <strong>Run</strong>. The game must not be minimised.</li>
      </ol>
      <p class="text-xs opacity-70">
        Wavescan only looks at the game window and never clicks anything here. Your User ID is
        blacked out in the preview, and the report contains no pictures.
      </p>

      <div class="flex items-center gap-3">
        <button
          class="btn btn-primary"
          :disabled="running"
          @click="run"
        >
          {{ running ? "Running…" : "Run" }}
        </button>
        <span
          v-if="step"
          class="text-sm opacity-80"
        >{{ step }}</span>
      </div>

      <ul
        v-if="checks.length"
        class="space-y-2"
      >
        <li
          v-for="check in checks"
          :key="check.id"
          class="flex items-start gap-3 text-sm"
        >
          <span
            class="badge badge-sm mt-0.5 w-16 justify-center"
            :class="badge[check.status]"
          >{{ check.status }}</span>
          <span><strong>{{ check.label }}:</strong> {{ check.detail }}</span>
        </li>
      </ul>

      <canvas
        ref="canvas"
        class="w-full rounded border border-base-300 bg-base-200"
        :class="{ hidden: !checks.length }"
      />

      <div
        v-if="reportText"
        class="space-y-2"
      >
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">
            Report
          </h2>
          <button
            class="btn btn-sm"
            @click="copyReport"
          >
            {{ copied ? "Copied ✓" : "Copy report" }}
          </button>
        </div>
        <textarea
          class="textarea textarea-bordered w-full font-mono text-xs h-48"
          readonly
          :value="reportText"
        />
      </div>
    </div>
  </div>
</template>
