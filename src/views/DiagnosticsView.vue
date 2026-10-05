<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  armAutoMode,
  autoClick,
  autoFocusGame,
  disarmAutoMode,
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
import { INPUT_TEST_TARGETS, OCR_TEST_REGIONS } from "@/diagnostics/regions";
import { CONFIRMATION_PHRASE, runInputTest } from "@/diagnostics/inputTest";
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
const confirmation = ref("");
const inputRunning = ref(false);
/** The last diagnostics run, so the input test can add to the same report. */
let lastInput: DiagnosticsInput | null = null;

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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

function publish(input: DiagnosticsInput) {
  lastInput = input;
  const report = buildReport(input);
  checks.value = report.checks;
  reportText.value = formatReport(report);
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
    input: lastInput?.input ?? null,
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
    publish(input);
    step.value = "";
    running.value = false;
  }
}

const PANEL = OCR_TEST_REGIONS.find((r) => r.id === "echo-panel")?.region;

async function runClickTest() {
  if (!lastInput || !PANEL) return;
  const panel = PANEL;
  inputRunning.value = true;
  copied.value = false;
  try {
    const started = await attempt(() => startCapture(DIAGNOSTIC_FPS));
    const result = started.ok
      ? await runInputTest(
          {
            arm: armAutoMode,
            focusGame: autoFocusGame,
            click: autoClick,
            disarm: disarmAutoMode,
            readPanel: async () => (await ocrRegion(panel)).lines.map((l) => l.text).join("\n"),
            sleep,
            errorMessage,
          },
          confirmation.value,
          INPUT_TEST_TARGETS,
        )
      : { outcome: "error" as const, detail: started.error, clicks: 0 };
    publish({ ...lastInput, input: result });
  } finally {
    await attempt(stopCapture);
    confirmation.value = "";
    inputRunning.value = false;
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
        v-if="checks.length"
        class="rounded-box border border-warning/40 bg-warning/10 p-4 space-y-3"
      >
        <h2 class="font-semibold">
          Optional: click test (for auto mode)
        </h2>
        <p class="text-sm">
          This checks whether Wavescan's clicks reach the game. It brings the game to the
          front and clicks two echoes in your Bag grid. That only selects them; nothing is
          changed, upgraded or discarded.
        </p>
        <p class="text-sm">
          <strong>Fair Play:</strong> Kuro Games' Fair Play Policy prohibits third-party tools
          and macros. Clicking for you could be seen as a macro, so there is some risk to your
          account. Watch mode never clicks. Only continue if you accept that risk.
        </p>
        <label class="form-control w-full max-w-xs">
          <span class="label-text text-sm">Type <strong>{{ CONFIRMATION_PHRASE }}</strong> to continue</span>
          <input
            v-model="confirmation"
            type="text"
            class="input input-bordered input-sm"
            autocomplete="off"
            :disabled="inputRunning || running"
          >
        </label>
        <p class="text-xs opacity-70">
          Don't touch the mouse during the test: moving it stops Wavescan immediately.
        </p>
        <button
          class="btn btn-warning btn-sm"
          :disabled="inputRunning || running || confirmation.trim().toLowerCase() !== CONFIRMATION_PHRASE.toLowerCase()"
          @click="runClickTest"
        >
          {{ inputRunning ? "Testing…" : "Run click test" }}
        </button>
      </div>

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
