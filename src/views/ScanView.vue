<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import {
  errorKind,
  errorMessage,
  getCaptureStatus,
  sampleRegions,
  setMiniWindow,
  startCapture,
  stopCapture,
} from "@/ipc/commands";
import { readEchoRegions } from "@/ocr/appReader";
import type { AppInfo } from "@/ipc/types";
import type { ExtractedEcho } from "@/session/echoExtract";
import { createEchoSession, type EchoCandidate, type EchoSession, type SessionStats } from "@/session/echoSession";
import { problemForError, type Problem } from "@/feedback/problems";
import { displayName, flaggedFields } from "@/review/fields";
import { useScanStore } from "@/review/scanStore";
import { summarize } from "@/review/list";
import { go, goReport, navigation } from "@/ui/navigation";
import AppIcon from "@/components/AppIcon.vue";
import AutoModePanel from "@/views/AutoModePanel.vue";
import EchoAvatar from "@/components/EchoAvatar.vue";
import EchoCard from "@/components/EchoCard.vue";
import PixelProgress from "@/components/PixelProgress.vue";
import PlayerNameField from "@/components/PlayerNameField.vue";
import ProblemCard from "@/components/ProblemCard.vue";

// Scan echoes: watch mode (the user clicks, Wavescan reads) and the auto mode tab. Both add
// to the shared scan store. The mini window shrinks the app to a small always-on-top
// counter for people playing on one screen.

const props = defineProps<{ info: AppInfo | null }>();
const emit = defineEmits<{ mini: [mini: boolean] }>();

const store = useScanStore();
const stats = ref<SessionStats>({ scanned: 0, duplicates: 0, errors: 0, wrongScreen: 0, belowMinLevel: 0, screen: null });
const watching = ref(false);
const paused = ref(false);
const problem = ref<{ problem: Problem; details: string } | null>(null);
const session = shallowRef<EchoSession | null>(null);
const autoRunning = ref(false);
const mini = ref(false);
/** Echo ids read since Start, newest first, and when each arrived (for the pace). */
const recent = ref<string[]>([]);
const arrivals: number[] = [];
/** The session's echo ids → the list's, for an "Equipped by" line read after the echo was added. */
const storeIds = new Map<string, string>();
let frame = { width: 0, height: 0 };
let sizeTimer: ReturnType<typeof setInterval> | null = null;

/** Capture rate while watching; the session samples at ~8/s. */
const WATCH_FPS = 15;

const busy = computed(() => watching.value || autoRunning.value);
const recentCandidates = computed(() =>
  recent.value.map((id) => store.get(id)).filter((c): c is EchoCandidate => c !== undefined),
);
const justRead = computed(() => recentCandidates.value[0] ?? null);
const toCheck = computed(() => recentCandidates.value.filter((c) => flaggedFields(c).length > 0).length);
const total = computed(() => summarize(store.state.candidates).total);
const pace = computed(() => {
  void recent.value.length; // recompute when an echo arrives
  const last = arrivals.slice(-11);
  if (last.length < 2) return null;
  return ((last.at(-1) ?? 0) - (last[0] ?? 0)) / (last.length - 1) / 1000;
});

function setBusy(value: boolean) {
  navigation.busy = value;
}

async function refreshFrameSize() {
  const status = await getCaptureStatus();
  if (status.frame) {
    frame = { width: status.frame.width, height: status.frame.height };
    store.setResolution(frame);
  }
}

function showError(error: unknown) {
  const message = errorMessage(error);
  problem.value = { problem: problemForError(errorKind(error), message, props.info?.platform ?? null), details: message };
}

async function start() {
  problem.value = null;
  recent.value = [];
  arrivals.length = 0;
  storeIds.clear();
  try {
    await startCapture(WATCH_FPS);
    for (let i = 0; i < 20 && frame.width === 0; i++) {
      await refreshFrameSize();
      if (frame.width === 0) await new Promise((r) => setTimeout(r, 100));
    }
    if (frame.width === 0) throw new Error("No pictures from the game yet. Is it minimised?");
    session.value = createEchoSession({
      sampleRegions,
      readRegions: readEchoRegions,
      frameSize: () => frame,
      onCandidate: (c) => {
        const added = store.add(c, "watch");
        storeIds.set(c.id, added.id);
        arrivals.push(performance.now());
        recent.value = [added.id, ...recent.value];
        problem.value = null;
      },
      onCandidateUpdate: (c) => {
        const id = storeIds.get(c.id);
        if (id && c.raw.equippedBy !== undefined) store.addLateEquippedBy(id, c.raw.equippedBy);
      },
      onStats: (s) => (stats.value = s),
      onError: (message, kind) => {
        problem.value = { problem: problemForError(kind, message, props.info?.platform ?? null), details: message };
      },
    });
    session.value.start();
    sizeTimer = setInterval(() => void refreshFrameSize().catch(() => undefined), 2000);
    watching.value = true;
    paused.value = false;
    setBusy(true);
  } catch (error) {
    showError(error);
    await stopCapture().catch(() => undefined);
  }
}

function togglePause() {
  if (!session.value) return;
  if (paused.value) session.value.start();
  else session.value.stop();
  paused.value = !paused.value;
}

async function stop() {
  session.value?.stop();
  session.value = null;
  if (sizeTimer) clearInterval(sizeTimer);
  sizeTimer = null;
  watching.value = false;
  paused.value = false;
  setBusy(autoRunning.value);
  await stopCapture().catch(() => undefined);
  if (mini.value) await toggleMini();
}

async function stopAndReview() {
  await stop();
  go("review");
}

async function toggleMini() {
  try {
    await setMiniWindow(!mini.value);
    mini.value = !mini.value;
    emit("mini", mini.value);
  } catch (error) {
    showError(error);
  }
}

function addAutoEcho(echo: ExtractedEcho) {
  const added = store.add(echo, "auto");
  recent.value = [added.id, ...recent.value].slice(0, 50);
}

function autoRunningChanged(running: boolean) {
  autoRunning.value = running;
  setBusy(running || watching.value);
}

function setMode(mode: "watch" | "auto") {
  if (!busy.value) navigation.scanMode = mode;
}

onBeforeUnmount(() => void stop());
</script>

<template>
  <!-- Mini window: just the counter and Stop. -->
  <div
    v-if="mini"
    class="flex h-full flex-col gap-2"
  >
    <div class="flex items-center gap-2.5 text-sm font-semibold">
      <PixelProgress
        class="w-16 shrink-0"
        label="Watching"
        :cells="6"
        :count="paused ? 0 : stats.scanned"
      />
      {{ paused ? "Paused" : "Watching" }}
    </div>
    <div class="flex items-baseline gap-4">
      <span><span class="font-mono text-3xl font-semibold">{{ stats.scanned }}</span> read</span>
      <span
        v-if="toCheck"
        class="text-warning"
      ><span class="font-mono text-xl font-bold">{{ toCheck }}</span> to check</span>
    </div>
    <div class="truncate text-sm opacity-80">
      {{ justRead ? `Last: ${displayName(justRead)} +${justRead.level ?? "?"}` : "Click an echo in the game" }}
    </div>
    <div class="mt-auto flex gap-2">
      <button
        type="button"
        class="btn btn-sm"
        @click="toggleMini"
      >
        Full window
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline"
        @click="stop"
      >
        Stop
      </button>
    </div>
  </div>

  <div
    v-else
    class="mx-auto flex max-w-6xl flex-col gap-5"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-title text-3xl">
        Scan echoes
      </h1>
      <div
        role="tablist"
        aria-label="Scan mode"
        class="tabs-line"
      >
        <button
          role="tab"
          type="button"
          :aria-selected="navigation.scanMode === 'watch'"
          :disabled="busy"
          @click="setMode('watch')"
        >
          Watch mode
        </button>
        <button
          role="tab"
          type="button"
          :aria-selected="navigation.scanMode === 'auto'"
          :disabled="busy"
          @click="setMode('auto')"
        >
          Auto mode
        </button>
      </div>
    </div>

    <div class="rounded-box bg-base-100 p-4">
      <PlayerNameField />
    </div>

    <AutoModePanel
      v-if="navigation.scanMode === 'auto'"
      :info="info"
      :disabled="watching"
      @echo="addAutoEcho"
      @running="autoRunningChanged"
      @frame="store.setResolution($event)"
    />

    <template v-else>
      <header class="flex flex-wrap items-center justify-between gap-4 rounded-box bg-base-100 p-4">
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <PixelProgress
              v-if="watching"
              class="w-24 shrink-0"
              label="Watching"
              :cells="8"
              :count="paused ? 0 : stats.scanned"
            />
            <h2 class="text-lg font-semibold">
              <template v-if="!watching">
                Open Bag → Echoes in the game, then press Start
              </template>
              <template v-else-if="paused">
                Paused
              </template>
              <template v-else>
                Watching · click the next echo in the game
              </template>
            </h2>
          </div>
          <p class="text-sm opacity-75">
            Wavescan reads each echo once the details panel stops changing. It never clicks anything in watch mode.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <template v-if="!watching">
            <button
              type="button"
              class="btn btn-primary"
              :disabled="autoRunning"
              @click="start"
            >
              Start watching
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="btn"
              @click="togglePause"
            >
              {{ paused ? "Resume" : "Pause" }}
            </button>
            <button
              type="button"
              class="btn"
              :aria-label="'Switch to the mini window'"
              @click="toggleMini"
            >
              <AppIcon name="mini" /> Mini window
            </button>
            <button
              type="button"
              class="btn btn-outline"
              @click="stopAndReview"
            >
              Stop and review
            </button>
          </template>
        </div>
      </header>

      <div
        v-if="watching && stats.screen === 'unknown'"
        role="status"
        class="alert alert-warning text-sm"
      >
        <AppIcon name="alert" />
        <span>Can't see Bag → Echoes in the game, so nothing is being read. Open the bag and pick the Echoes tab, and close any popup over it.</span>
      </div>

      <div
        v-if="watching && stats.belowMinLevel > 0"
        role="status"
        class="alert text-sm"
      >
        <span>Skipped {{ stats.belowMinLevel }} {{ stats.belowMinLevel === 1 ? "echo" : "echoes" }} below +5. Wavescan only reads echoes at +5 and up.</span>
      </div>

      <ProblemCard
        v-if="problem"
        :problem="problem.problem"
        :details="problem.details"
        @report="goReport({ kind: 'game' })"
      />

      <div class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-1.5">
        <div class="stat-tile">
          <div class="stat-tile-label">
            Read this time
          </div>
          <div class="font-mono text-2xl font-semibold">
            {{ stats.scanned }}
          </div>
        </div>
        <div
          class="stat-tile"
          :class="{ 'stat-tile-warning': toCheck }"
        >
          <div class="stat-tile-label">
            Need a look
          </div>
          <div
            class="font-mono text-2xl font-semibold"
            :class="toCheck ? 'text-warning' : ''"
          >
            {{ toCheck }}
          </div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">
            Already read · skipped
          </div>
          <div class="font-mono text-2xl font-semibold">
            {{ stats.duplicates }}
          </div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">
            Pace
          </div>
          <div class="font-mono text-2xl font-semibold">
            {{ pace === null ? "–" : pace.toFixed(1) }}<span class="text-sm font-normal opacity-70"> s / echo</span>
          </div>
        </div>
      </div>

      <div
        v-if="justRead"
        class="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <section
          aria-labelledby="just-h"
          class="flex flex-col gap-2"
        >
          <h2
            id="just-h"
            class="section-title"
          >
            <span><strong>Just read</strong> · #{{ justRead.index }}</span>
          </h2>
          <EchoCard
            :candidate="justRead"
            size="large"
            readonly
          />
          <p
            v-if="flaggedFields(justRead).length === 0"
            class="flex items-center gap-1 text-sm text-success"
          >
            <AppIcon
              name="check"
              :size="14"
            /> Every field read clearly
          </p>
          <p
            v-else
            class="text-sm text-warning"
          >
            {{ flaggedFields(justRead).length }} to check on the Review screen
          </p>
        </section>
        <section
          aria-labelledby="session-h"
          class="flex flex-col gap-2"
        >
          <div class="flex items-center justify-between">
            <h2
              id="session-h"
              class="section-title flex-1"
            >
              <strong>This session</strong>
            </h2>
            <span class="text-xs opacity-70">{{ total }} in the scan</span>
          </div>
          <ol class="flex flex-col gap-[3px]">
            <li
              v-for="c in recentCandidates.slice(1, 9)"
              :key="c.id"
              class="flex items-center gap-3 rounded-[2px] bg-base-100 px-3 py-2 text-sm"
              :class="{ 'edge-flag': flaggedFields(c).length }"
            >
              <span class="w-8 font-mono opacity-60">{{ c.index }}</span>
              <EchoAvatar
                :echo="c.slot.echo"
                :name="displayName(c)"
                size-class="size-7"
              />
              <span class="flex-1 truncate">
                {{ displayName(c) }}
                <span class="opacity-70">· {{ c.slot.mainStatLabel || "?" }}</span>
                <span
                  v-if="flaggedFields(c).length"
                  class="text-warning"
                > · {{ flaggedFields(c).length }} to check</span>
              </span>
              <span class="font-mono font-semibold text-accent">+{{ c.level ?? "?" }}</span>
            </li>
          </ol>
        </section>
      </div>
      <p
        v-else-if="watching"
        class="rounded-box border border-dashed border-base-300 p-8 text-center opacity-70"
      >
        Waiting for the first echo. Click one in the game.
      </p>
    </template>
  </div>
</template>
