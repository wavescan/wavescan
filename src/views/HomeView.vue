<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { errorKind, errorMessage, findGameWindow } from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import { readinessItems, readinessSummary, SETUP_REMINDERS, type WindowOutcome } from "@/setup/readiness";
import { useScanStore } from "@/review/scanStore";
import { summarize } from "@/review/list";
import { go, goScan } from "@/ui/navigation";
import AppIcon from "@/components/AppIcon.vue";

// Home: is the game ready, which mode to use, and a scan left over from last time.

const props = defineProps<{ info: AppInfo | null; error: string | null }>();

const store = useScanStore();
const windowOutcome = ref<WindowOutcome | null>(null);
const checking = ref(false);

const items = computed(() => readinessItems(windowOutcome.value, props.info));
const summary = computed(() => readinessSummary(items.value));
const current = computed(() => summarize(store.state.candidates));
const saved = computed(() => store.restorable.scan);
const savedSummary = computed(() => (saved.value ? summarize(saved.value.candidates) : null));

/** Looks for the game window (no capture, no input). Repeats every few seconds while Home is open. */
async function check() {
  checking.value = true;
  try {
    windowOutcome.value = { ok: true, value: await findGameWindow() };
  } catch (e) {
    windowOutcome.value = { ok: false, kind: errorKind(e), message: errorMessage(e) };
  } finally {
    checking.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void check();
  timer = setInterval(() => void check(), 4000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `today ${time}` : `${date.toLocaleDateString()} ${time}`;
}

function continueSaved() {
  store.restore();
  go("review");
}

const STATUS = {
  ok: { box: "border-success/40 bg-success/10", icon: "check", text: "text-success" },
  todo: { box: "border-warning/50 bg-warning/10", icon: "alert", text: "text-warning" },
  unknown: { box: "border-base-300 bg-base-100", icon: "help", text: "opacity-70" },
} as const;
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-7">
    <header class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold">
        {{ summary.ready === summary.total && summary.total > 0 ? "Ready when you are" : "Let's get the game ready" }}
      </h1>
      <p class="max-w-2xl opacity-80">
        Wavescan reads your echoes from the game window and turns them into a file for Wuthering Tools.
        It only looks at the game, and nothing leaves your computer.
      </p>
      <div
        v-if="error"
        role="alert"
        class="alert alert-error mt-2 text-sm"
      >
        {{ error }}
      </div>
    </header>

    <section
      aria-labelledby="setup-h"
      class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="setup-h"
          class="font-semibold"
        >
          Game setup
          <span class="font-normal opacity-70">· {{ summary.ready }} of {{ summary.total }} ready</span>
        </h2>
        <button
          type="button"
          class="btn btn-sm"
          :disabled="checking"
          @click="check"
        >
          Check again
        </button>
      </div>
      <ul class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2">
        <li
          v-for="item in items"
          :key="item.id"
          class="flex flex-col gap-1 rounded-lg border p-3"
          :class="STATUS[item.status].box"
        >
          <span
            class="flex items-center gap-2 text-sm font-semibold"
            :class="item.status === 'todo' ? 'text-warning' : ''"
          >
            <AppIcon
              :name="STATUS[item.status].icon"
              :size="16"
              :class="STATUS[item.status].text"
            />
            {{ item.label }}
            <span class="sr-only">: {{ item.status === "ok" ? "ready" : item.status === "todo" ? "needs attention" : "unknown" }}</span>
          </span>
          <span class="text-xs opacity-80">{{ item.detail }}</span>
        </li>
      </ul>
      <p class="text-xs opacity-70">
        Also check: {{ SETUP_REMINDERS.join(" · ") }}.
        <button
          type="button"
          class="link"
          @click="go('diagnostics')"
        >
          Run the full check
        </button>
      </p>
    </section>

    <section
      aria-labelledby="mode-h"
      class="flex flex-col gap-3"
    >
      <h2
        id="mode-h"
        class="font-semibold"
      >
        How do you want to scan?
      </h2>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-4">
        <div class="flex flex-col gap-3 rounded-box border-2 border-primary/70 bg-base-100 p-5">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xl font-bold">
              Watch mode
            </h3>
            <span class="badge badge-primary badge-soft">Recommended</span>
          </div>
          <p class="text-sm opacity-80">
            You click through your echoes in the game. Wavescan reads each one as it appears. It never touches your mouse or keyboard.
          </p>
          <ul class="list-disc space-y-1 pl-5 text-sm opacity-90">
            <li>No input sent to the game</li>
            <li>No administrator rights needed</li>
            <li>Go at your own pace, stop any time</li>
          </ul>
          <button
            type="button"
            class="btn btn-primary mt-auto self-start"
            @click="goScan('watch')"
          >
            Start watching
          </button>
        </div>
        <div class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-5">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xl font-bold">
              Auto mode
            </h3>
            <span class="badge badge-warning badge-soft">Some account risk</span>
          </div>
          <p class="text-sm opacity-80">
            Wavescan clicks through your bag for you, about 8 minutes for 3,000 echoes. Hands off the mouse while it runs.
          </p>
          <ul class="list-disc space-y-1 pl-5 text-sm opacity-90">
            <li>Sends clicks to the game, which may count as a macro</li>
            <li v-if="info?.platform !== 'macos'">
              Needs Run as administrator on Windows
            </li>
            <li v-else>
              Needs the Accessibility permission
            </li>
            <li>Move the mouse or press F8 to stop</li>
          </ul>
          <button
            type="button"
            class="btn mt-auto self-start"
            @click="goScan('auto')"
          >
            Read the risks and set up
          </button>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-4">
      <div
        v-if="saved && savedSummary"
        class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-5"
      >
        <h2 class="text-sm font-semibold opacity-80">
          Scan from earlier, not exported
        </h2>
        <p>
          {{ savedSummary.total }} echoes<template v-if="savedSummary.toCheck">
            · {{ savedSummary.toCheck }} to check
          </template> · {{ when(saved.updatedAt) }}
        </p>
        <p class="text-xs opacity-70">
          Starting a new scan replaces it.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            @click="continueSaved"
          >
            Continue reviewing
          </button>
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            @click="store.discardSaved()"
          >
            Discard
          </button>
        </div>
      </div>
      <div
        v-else-if="current.total > 0"
        class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-5"
      >
        <h2 class="text-sm font-semibold opacity-80">
          This scan
        </h2>
        <p>
          {{ current.total }} echoes<template v-if="current.toCheck">
            · {{ current.toCheck }} to check
          </template>
        </p>
        <button
          type="button"
          class="btn btn-sm self-start"
          @click="go('review')"
        >
          Review and export
        </button>
      </div>
      <div class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-5">
        <h2 class="flex items-center gap-2 text-sm font-semibold opacity-80">
          <AppIcon
            name="shield"
            :size="16"
          /> What Wavescan touches
        </h2>
        <p class="text-sm opacity-90">
          Pictures of the game window only, read on this computer. Your User ID is never read. No accounts, no tracking.
        </p>
        <button
          type="button"
          class="link self-start text-sm"
          @click="go('help')"
        >
          See what it did this session
        </button>
      </div>
    </section>
  </div>
</template>
