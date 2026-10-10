<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import type { FrameSize } from "@wutheringtools/scanner-core";
import { createAutoScan, readEchoWith, type AutoScanResult } from "@/auto/autoScan";
import type { NavigatorProgress } from "@/auto/navigator";
import { CONFIRMATION_PHRASE } from "@/diagnostics/inputTest";
import { isSupportedAspect } from "@/diagnostics/regions";
import {
  armAutoMode,
  autoClick,
  autoFocusGame,
  autoScroll,
  disarmAutoMode,
  errorKind,
  errorMessage,
  findGameWindow,
  getCaptureStatus,
  openUrl,
  sampleRegions,
  startCapture,
  stopCapture,
} from "@/ipc/commands";
import { readEchoRegions } from "@/ocr/appReader";
import type { AppInfo, GameWindow } from "@/ipc/types";
import type { ExtractedEcho } from "@/session/echoExtract";
import { FAIR_PLAY_URL } from "@/feedback/links";
import { problemForAutoStop, problemForError, type Problem } from "@/feedback/problems";
import { go, goReport, navigation } from "@/ui/navigation";
import AppIcon from "@/components/AppIcon.vue";
import ProblemCard from "@/components/ProblemCard.vue";

// Auto mode (ADR 0006, 0023, 0024) as four steps: understand the risk, permissions, prepare
// the game, then type the confirmation and start. The scan itself is `createAutoScan`.
// Every echo read goes to ScanView, which adds it to the shared store. Auto mode is armed
// only for one scan, and the confirmation has to be typed again for the next one.

const props = defineProps<{ info: AppInfo | null; disabled: boolean }>();
const emit = defineEmits<{ echo: [echo: ExtractedEcho]; running: [running: boolean]; frame: [frame: FrameSize] }>();

const STEPS = ["Understand the risk", "Permissions", "Prepare the game", "Confirm and start"] as const;
const MIN_LEVELS = [
  { value: 0, label: "All echoes", hint: "Longest scan" },
  { value: 5, label: "+5 and up", hint: "Stops at the first +4" },
  { value: 10, label: "+10 and up", hint: "Stops at the first +9" },
  { value: 15, label: "+15 and up", hint: "Stops at the first +14" },
  { value: 20, label: "+20 and up", hint: "Stops at the first +19" },
  { value: 25, label: "+25 only", hint: "What most builds use" },
] as const;

const step = ref(0);
const riskRead = ref(false);
const confirmation = ref("");
const minLevel = ref(0);
const running = ref(false);
const progress = ref<NavigatorProgress | null>(null);
const result = ref<AutoScanResult | null>(null);
const lastEcho = ref<string | null>(null);
const stopKeyActive = ref<boolean | null>(null);
const scan = shallowRef<ReturnType<typeof createAutoScan<ExtractedEcho>> | null>(null);
const game = ref<{ ok: true; window: GameWindow } | { ok: false; problem: Problem; details: string } | null>(null);

const confirmed = computed(() => confirmation.value.trim().toLowerCase() === CONFIRMATION_PHRASE.toLowerCase());
const isWindows = computed(() => props.info?.platform === "windows");
/** Auto mode needs administrator on Windows (ADR 0023); null means Wavescan couldn't tell. */
const notElevated = computed(() => isWindows.value && props.info?.elevated === false);
const gameReady = computed(() => {
  const g = game.value;
  if (!g?.ok || g.window.minimized) return false;
  return isSupportedAspect(g.window.client_rect.width, g.window.client_rect.height);
});
const canStart = computed(() => confirmed.value && !running.value && !props.disabled && !notElevated.value);
const outcome = computed(() =>
  result.value ? problemForAutoStop(result.value.reason, result.value.detail, result.value.echoes) : null,
);

async function checkGame() {
  try {
    game.value = { ok: true, window: await findGameWindow() };
  } catch (e) {
    const message = errorMessage(e);
    game.value = { ok: false, problem: problemForError(errorKind(e), message, props.info?.platform ?? null), details: message };
  }
}

function goStep(n: number) {
  step.value = n;
  if (n === 2) void checkGame();
}

function summaryLine(r: AutoScanResult): string {
  const parts = [`${r.echoes} echoes read`];
  if (r.errors) parts.push(`${r.errors} couldn't be read`);
  if (r.unchanged) parts.push(`${r.unchanged} ${r.unchanged === 1 ? "click" : "clicks"} didn't change the echo shown`);
  return parts.join(" · ");
}

async function start() {
  if (!canStart.value) return;
  running.value = true;
  emit("running", true);
  result.value = null;
  progress.value = null;
  lastEcho.value = null;
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
      onEcho: (echo) => {
        lastEcho.value = `${echo.raw.name} +${echo.level ?? "?"}`;
        emit("echo", echo);
      },
      onProgress: (p) => (progress.value = p),
    },
  );
  try {
    result.value = await scan.value.run();
    navigation.lastAutoResult = `${result.value.reason}: ${result.value.detail} (${summaryLine(result.value)}, row ${result.value.row + 1}, min level +${minLevel.value})`;
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
  <!-- While it runs: one big, unmissable instruction. -->
  <section
    v-if="running"
    aria-live="polite"
    class="flex flex-wrap items-center gap-6 rounded-box border-2 border-warning bg-warning/10 p-6"
  >
    <div class="flex min-w-64 flex-1 flex-col gap-1">
      <h2 class="text-2xl font-bold">
        Hands off the mouse
      </h2>
      <p
        v-if="stopKeyActive === false"
        class="text-sm"
      >
        F8 isn't available (another app uses it). <strong>Move the mouse</strong> to stop.
      </p>
      <p
        v-else
        class="text-sm"
      >
        <strong>Move the mouse</strong> or press <kbd class="kbd kbd-sm">F8</kbd> to stop. Everything read so far is kept.
      </p>
    </div>
    <div class="flex min-w-64 flex-1 flex-col gap-2 text-sm">
      <div class="flex justify-between">
        <span v-if="progress">{{ progress.echoes }} echoes read · row {{ progress.row + 1 }}</span>
        <span v-else>Starting…</span>
        <span
          v-if="progress?.errors"
          class="text-warning"
        >{{ progress.errors }} couldn't be read</span>
      </div>
      <progress
        class="progress progress-warning w-full"
        aria-label="Scanning"
      />
      <span class="opacity-80">
        <template v-if="lastEcho">Last: {{ lastEcho }} · </template>
        {{ minLevel > 0 ? `stops at the first echo below +${minLevel}` : "reads to the end of the list" }}
      </span>
    </div>
    <button
      type="button"
      class="btn btn-neutral btn-lg"
      @click="stop"
    >
      Stop now
    </button>
  </section>

  <div
    v-else
    class="flex flex-col gap-5"
  >
    <ProblemCard
      v-if="outcome && result"
      :problem="outcome"
      :details="summaryLine(result)"
      @report="goReport({ kind: 'auto' })"
    >
      <button
        v-if="result.echoes > 0"
        type="button"
        class="btn btn-sm btn-primary"
        @click="go('review')"
      >
        Review {{ result.echoes }} echoes
      </button>
    </ProblemCard>

    <div class="flex flex-wrap items-start gap-6">
      <ol
        aria-label="Steps"
        class="flex w-56 flex-col gap-1"
      >
        <li
          v-for="(label, i) in STEPS"
          :key="label"
        >
          <button
            type="button"
            class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm"
            :class="i === step ? 'bg-base-100 font-semibold' : 'opacity-75 hover:bg-base-100'"
            :aria-current="i === step ? 'step' : undefined"
            :disabled="i > step"
            @click="goStep(i)"
          >
            <span
              class="flex size-6 items-center justify-center rounded-full text-xs font-bold"
              :class="i < step ? 'bg-success/20 text-success' : i === step ? 'bg-primary text-primary-content' : 'border border-base-300'"
            >
              <AppIcon
                v-if="i < step"
                name="check"
                :size="12"
              />
              <template v-else>{{ i + 1 }}</template>
            </span>
            {{ label }}
          </button>
        </li>
      </ol>

      <section
        class="flex min-w-72 flex-1 flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-6"
        aria-live="polite"
      >
        <h2 class="text-xl font-bold">
          {{ STEPS[step] }}
        </h2>

        <template v-if="step === 0">
          <div class="flex flex-col gap-3 rounded-box border border-warning/50 bg-warning/10 p-4 text-sm">
            <p>
              Kuro Games' Fair Play Policy prohibits third-party tools and macros. Auto mode sends mouse clicks to the
              game, which some people consider a macro. We don't know of anyone being banned for scanning, and Wavescan
              never touches the game's memory or files.
            </p>
            <p>
              <strong>But Kuro hasn't said tools like this are allowed, so there is some risk to your account.</strong>
              Watch mode sends no input to the game, so that risk doesn't apply to it.
            </p>
            <button
              type="button"
              class="link self-start"
              @click="openUrl(FAIR_PLAY_URL)"
            >
              Read the Fair Play Policy <AppIcon
                name="external"
                :size="12"
                class="inline"
              />
            </button>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="riskRead"
              type="checkbox"
              class="checkbox checkbox-sm"
            >
            I've read this and want to set up auto mode
          </label>
          <div class="flex justify-between gap-2">
            <button
              type="button"
              class="btn btn-ghost"
              @click="navigation.scanMode = 'watch'"
            >
              Use watch mode instead
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="!riskRead"
              @click="goStep(1)"
            >
              Next
            </button>
          </div>
        </template>

        <template v-else-if="step === 1">
          <div
            v-if="notElevated"
            role="alert"
            class="alert alert-error text-sm"
          >
            <div>
              Auto mode needs Wavescan to run as administrator, because Windows blocks clicks from normal apps into the
              game. Close Wavescan, right-click it and choose <strong>Run as administrator</strong>. Watch mode works without it.
            </div>
          </div>
          <p
            v-else-if="isWindows && info?.elevated === true"
            class="flex items-center gap-2 text-sm"
          >
            <AppIcon
              name="check"
              class="text-success"
            /> Wavescan is running as administrator.
          </p>
          <p
            v-else-if="isWindows"
            class="text-sm opacity-80"
          >
            Couldn't tell whether Wavescan runs as administrator. Auto mode needs it on Windows; if clicks don't land, restart it that way.
          </p>
          <p
            v-if="info?.platform === 'macos'"
            class="text-sm opacity-80"
          >
            The first time, macOS asks for the <strong>Accessibility</strong> permission, which auto mode needs to click.
            Allow it in System Settings → Privacy &amp; Security → Accessibility.
          </p>
          <div class="flex justify-between gap-2">
            <button
              type="button"
              class="btn btn-ghost"
              @click="goStep(0)"
            >
              Back
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="notElevated"
              @click="goStep(2)"
            >
              Next
            </button>
          </div>
        </template>

        <template v-else-if="step === 2">
          <ol class="list-decimal space-y-1 pl-5 text-sm">
            <li>In the game, open <strong>Bag → Echoes</strong>.</li>
            <li>Sort by <strong>Level</strong>, highest first.</li>
            <li>Close any menu on top of the list.</li>
          </ol>
          <div
            v-if="game?.ok"
            class="flex items-center gap-2 text-sm"
            :class="gameReady ? '' : 'text-warning'"
          >
            <AppIcon :name="gameReady ? 'check' : 'alert'" />
            <template v-if="game.window.minimized">
              The game is minimised. Open it from the taskbar.
            </template>
            <template v-else-if="gameReady">
              Game found at {{ game.window.client_rect.width }}×{{ game.window.client_rect.height }}.
            </template>
            <template v-else>
              The game is {{ game.window.client_rect.width }}×{{ game.window.client_rect.height }}: auto mode needs 16:9 or 16:10.
            </template>
          </div>
          <ProblemCard
            v-else-if="game && !game.ok"
            :problem="game.problem"
            :details="game.details"
          />
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-semibold">
              Which echoes?
            </legend>
            <div class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
              <label
                v-for="option in MIN_LEVELS"
                :key="option.value"
                class="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm"
                :class="minLevel === option.value ? 'border-primary bg-primary/10' : 'border-base-300'"
              >
                <span class="flex items-center gap-2 font-medium">
                  <input
                    v-model.number="minLevel"
                    type="radio"
                    name="min-level"
                    class="radio radio-sm"
                    :value="option.value"
                  >
                  {{ option.label }}
                </span>
                <span class="pl-6 text-xs opacity-70">{{ option.hint }}</span>
              </label>
            </div>
          </fieldset>
          <div class="flex justify-between gap-2">
            <button
              type="button"
              class="btn btn-ghost"
              @click="goStep(1)"
            >
              Back
            </button>
            <div class="flex gap-2">
              <button
                type="button"
                class="btn"
                @click="checkGame"
              >
                Check again
              </button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="!gameReady"
                @click="goStep(3)"
              >
                Next
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <ul class="list-disc space-y-1 pl-5 text-sm">
            <li>Wavescan brings the game to the front, scrolls to the top and clicks through your echoes.</li>
            <li><strong>Don't touch the mouse or keyboard</strong> until it's done.</li>
            <li>To stop at any time, move the mouse or press <kbd class="kbd kbd-sm">F8</kbd>.</li>
          </ul>
          <label class="flex max-w-xs flex-col gap-1 text-sm">
            <span>Type <strong>{{ CONFIRMATION_PHRASE }}</strong> to continue</span>
            <input
              v-model="confirmation"
              type="text"
              class="input input-sm"
              autocomplete="off"
              :disabled="disabled"
              @keydown.enter="start"
            >
          </label>
          <div class="flex justify-between gap-2">
            <button
              type="button"
              class="btn btn-ghost"
              @click="goStep(2)"
            >
              Back
            </button>
            <button
              type="button"
              class="btn btn-warning"
              :disabled="!canStart"
              @click="start"
            >
              Start auto scan
            </button>
          </div>
          <p
            v-if="disabled"
            class="text-xs opacity-70"
          >
            Stop watch mode first.
          </p>
        </template>
      </section>
    </div>
  </div>
</template>
