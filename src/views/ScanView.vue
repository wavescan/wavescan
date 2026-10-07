<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { getScannerEcho } from "@wutheringtools/scanner-core";
import {
  errorMessage,
  getCaptureStatus,
  readRegions,
  sampleRegions,
  startCapture,
  stopCapture,
} from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import { createEchoSession, type EchoCandidate, type EchoSession, type SessionStats } from "@/session/echoSession";
import { buildScan } from "@/session/exportScan";

const props = defineProps<{ info: AppInfo | null }>();
defineEmits<{ back: [] }>();

const candidates = ref<EchoCandidate[]>([]);
const stats = ref<SessionStats>({ scanned: 0, duplicates: 0, errors: 0 });
const watching = ref(false);
const message = ref<string | null>(null);
const copied = ref(false);
const session = shallowRef<EchoSession | null>(null);
let frame = { width: 0, height: 0 };
let sizeTimer: ReturnType<typeof setInterval> | null = null;

/** Capture rate while watching; the session samples at ~8/s. */
const WATCH_FPS = 15;

async function refreshFrameSize() {
  const status = await getCaptureStatus();
  if (status.frame) frame = { width: status.frame.width, height: status.frame.height };
}

async function start() {
  message.value = null;
  try {
    await startCapture(WATCH_FPS);
    for (let i = 0; i < 20 && frame.width === 0; i++) {
      await refreshFrameSize();
      if (frame.width === 0) await new Promise((r) => setTimeout(r, 100));
    }
    if (frame.width === 0) throw new Error("No frames from the game yet. Is it minimised?");
    session.value = createEchoSession({
      sampleRegions,
      readRegions,
      frameSize: () => frame,
      onCandidate: (c) => candidates.value.unshift(c),
      onStats: (s) => (stats.value = s),
      onError: (m) => (message.value = m),
    });
    session.value.start();
    sizeTimer = setInterval(() => void refreshFrameSize().catch(() => undefined), 2000);
    watching.value = true;
  } catch (error) {
    message.value = errorMessage(error);
    await stopCapture().catch(() => undefined);
  }
}

async function stop() {
  session.value?.stop();
  if (sizeTimer) clearInterval(sizeTimer);
  sizeTimer = null;
  watching.value = false;
  await stopCapture().catch(() => undefined);
}

function remove(id: string) {
  candidates.value = candidates.value.filter((c) => c.id !== id);
}

const built = computed(() =>
  buildScan([...candidates.value].reverse(), {
    scannerVersion: props.info?.version ?? "0.0.0",
    platform: props.info?.platform === "macos" ? "macos" : "windows",
    resolution: frame,
    mode: "watch",
  }),
);

async function copyScan() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(built.value.scan, null, 2));
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch (error) {
    message.value = errorMessage(error);
  }
}

const displayName = (c: EchoCandidate) =>
  c.slot.echo ? (getScannerEcho(c.slot.echo)?.name ?? c.slot.echo) : `Unknown ("${c.raw.name}")`;
const isLow = (c: EchoCandidate, field: "name" | "set" | "mainStat" | "level" | "rank") =>
  c.confidence[field] === "low";
/** Raw OCR text behind uncertain fields, so a wrong read can be reported and fixed. */
const rawHint = (c: EchoCandidate) => {
  const parts: string[] = [];
  if (isLow(c, "level")) parts.push(`level "${c.raw.level}"`);
  if (isLow(c, "mainStat") || isLow(c, "rank")) parts.push(`main stat "${c.raw.mainStat}"`);
  if (isLow(c, "rank")) parts.push(`second stat "${c.raw.secondaryStat}"`);
  return parts.length ? `Read as: ${parts.join(" · ")}` : null;
};

onBeforeUnmount(() => void stop());
</script>

<template>
  <div class="card bg-base-100 shadow-md w-full max-w-4xl">
    <div class="card-body gap-4">
      <div class="flex items-center justify-between">
        <h1 class="card-title text-2xl">
          Scan echoes <span class="badge badge-outline">watch mode</span>
        </h1>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="watching"
          @click="$emit('back')"
        >
          Back
        </button>
      </div>

      <ol class="list-decimal list-inside text-sm opacity-80 space-y-1">
        <li>In Wuthering Waves, open <strong>Bag → Echoes</strong> (sorted by Level works best).</li>
        <li>Press <strong>Start watching</strong>, then click through your echoes in the game at any pace.</li>
        <li>Each new echo appears below. Wavescan never clicks anything in watch mode.</li>
      </ol>

      <div class="flex flex-wrap items-center gap-3">
        <button
          v-if="!watching"
          class="btn btn-primary"
          @click="start"
        >
          Start watching
        </button>
        <button
          v-else
          class="btn"
          @click="stop"
        >
          Stop
        </button>
        <div class="stats stats-horizontal shadow-sm text-sm">
          <div class="stat py-2 px-4">
            <div class="stat-title">
              Scanned
            </div>
            <div class="stat-value text-lg">
              {{ candidates.length }}
            </div>
          </div>
          <div class="stat py-2 px-4">
            <div class="stat-title">
              Duplicates skipped
            </div>
            <div class="stat-value text-lg">
              {{ stats.duplicates }}
            </div>
          </div>
        </div>
        <span
          v-if="watching"
          class="loading loading-ring loading-sm"
          aria-label="watching"
        />
      </div>

      <div
        v-if="message"
        role="alert"
        class="alert alert-warning text-sm"
      >
        {{ message }}
      </div>

      <div
        v-if="candidates.length"
        class="flex items-center gap-3"
      >
        <button
          class="btn btn-sm btn-secondary"
          @click="copyScan"
        >
          {{ copied ? "Copied ✓" : "Copy scan for Wuthering Tools" }}
        </button>
        <span class="text-xs opacity-70">
          {{ built.scan.echoes.length }} echoes ready
          <template v-if="built.skippedUnknown">· {{ built.skippedUnknown }} unknown (not included)</template>
          · yellow = please check
        </span>
      </div>

      <ul class="divide-y divide-base-200">
        <li
          v-for="c in candidates"
          :key="c.id"
          class="py-2 flex items-start gap-3 text-sm"
        >
          <span class="opacity-50 w-8 shrink-0">#{{ c.index }}</span>
          <div class="flex-1 space-y-1">
            <div class="font-medium">
              <span :class="{ 'text-warning': isLow(c, 'name') }">{{ displayName(c) }}</span>
              <span
                class="ml-2 badge badge-sm"
                :class="isLow(c, 'level') ? 'badge-warning' : 'badge-ghost'"
              >+{{ c.level ?? "?" }}</span>
              <span
                class="ml-1 badge badge-sm"
                :class="isLow(c, 'set') ? 'badge-warning' : 'badge-ghost'"
              >{{ c.slot.set ?? "set ?" }}</span>
              <span
                class="ml-1 badge badge-sm"
                :class="isLow(c, 'rank') ? 'badge-warning' : 'badge-ghost'"
              >{{ c.rank ? `${c.rank}★` : "rarity ?" }}</span>
            </div>
            <div class="opacity-80">
              <span :class="{ 'text-warning': isLow(c, 'mainStat') }">{{ c.slot.mainStatLabel || "main stat ?" }}</span>
              <template
                v-for="(s, i) in c.slot.substats"
                :key="i"
              >
                <span
                  v-if="s.subStat"
                  class="ml-3"
                  :class="{ 'text-warning': c.confidence.substats[i] === 'low' }"
                >{{ s.subStat }} {{ s.subStatValue }}</span>
              </template>
            </div>
            <div
              v-if="rawHint(c)"
              class="text-xs opacity-60 font-mono"
            >
              {{ rawHint(c) }}
            </div>
          </div>
          <button
            class="btn btn-ghost btn-xs"
            aria-label="Remove"
            @click="remove(c.id)"
          >
            ✕
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
