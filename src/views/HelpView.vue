<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { errorMessage, openUrl } from "@/ipc/commands";
import { readEngineName } from "@/ocr/appReader";
import type { AppInfo } from "@/ipc/types";
import type { GameDataInfo } from "@/data/scannerData";
import { activity } from "@/feedback/activity";
import { LICENSE_URL, RELEASES_URL, SECURITY_URL, sourceUrl } from "@/feedback/links";
import { searchTopics } from "@/help/troubleshooting";
import { useScanStore } from "@/review/scanStore";
import { goReport } from "@/ui/navigation";
import AppIcon from "@/components/AppIcon.vue";

// Help & feedback: report a problem, suggest an idea, the offline troubleshooting guide,
// the source code this copy was built from, and what Wavescan did this session.

const props = defineProps<{ info: AppInfo | null; gameData: GameDataInfo | null }>();

const store = useScanStore();
const query = ref("");
const reader = ref("…");
const message = ref<string | null>(null);
const detailsCopied = ref(false);

const topics = computed(() => searchTopics(query.value, props.info?.platform ?? null));
const since = computed(() =>
  new Date(activity.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
);

onMounted(async () => {
  reader.value = await readEngineName().catch(() => "unknown");
});

async function open(url: string) {
  try {
    message.value = null;
    await openUrl(url);
  } catch (error) {
    message.value = `Couldn't open your browser: ${errorMessage(error)}. The address is ${url}`;
  }
}

const appDetails = computed(() =>
  [
    `Wavescan ${props.info?.version ?? "?"}${props.info?.build ? ` (build ${props.info.build})` : " (local build)"}`,
    `Platform: ${props.info?.platform ?? "?"}`,
    `Text reader: ${reader.value}`,
    `Game data: ${props.gameData ? `${props.gameData.hash.slice(0, 8)} (${props.gameData.echoes} echoes)` : "?"}`,
  ].join("\n"),
);

async function copyDetails() {
  try {
    await navigator.clipboard.writeText(appDetails.value);
    detailsCopied.value = true;
    setTimeout(() => (detailsCopied.value = false), 2000);
  } catch (error) {
    message.value = errorMessage(error);
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-7">
    <h1 class="text-2xl font-bold">
      Help &amp; feedback
    </h1>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <button
        type="button"
        class="flex flex-col gap-1.5 rounded-box border border-primary/50 bg-base-100 p-4 text-left hover:bg-base-200"
        @click="goReport({ kind: store.state.candidates.length ? 'misread' : 'game' })"
      >
        <AppIcon
          name="bug"
          :size="22"
          class="text-primary"
        />
        <span class="font-bold">Report a problem</span>
        <span class="text-sm opacity-75">A misread value, auto mode stuck, game not found. Wavescan writes the report; you send it.</span>
      </button>
      <button
        type="button"
        class="flex flex-col gap-1.5 rounded-box border border-base-300 bg-base-100 p-4 text-left hover:bg-base-200"
        @click="goReport({ kind: 'idea' })"
      >
        <AppIcon
          name="chat"
          :size="22"
          class="text-primary"
        />
        <span class="font-bold">Suggest an idea</span>
        <span class="text-sm opacity-75">Something that would make scanning easier? Open an issue on GitHub.</span>
      </button>
      <a
        href="#troubleshooting"
        class="flex flex-col gap-1.5 rounded-box border border-base-300 bg-base-100 p-4 text-left hover:bg-base-200"
      >
        <AppIcon
          name="book"
          :size="22"
          class="text-primary"
        />
        <span class="font-bold">Troubleshooting</span>
        <span class="text-sm opacity-75">Built in and works offline: HDR, administrator, black window and more.</span>
      </a>
      <button
        type="button"
        class="flex flex-col gap-1.5 rounded-box border border-base-300 bg-base-100 p-4 text-left hover:bg-base-200"
        @click="open(sourceUrl(info?.build ?? null))"
      >
        <AppIcon
          name="code"
          :size="22"
          class="text-primary"
        />
        <span class="flex items-center gap-1 font-bold">Read the source <AppIcon
          name="external"
          :size="12"
        /></span>
        <span class="text-sm opacity-75">
          <template v-if="info?.build">The exact code this copy was built from: commit <span class="font-mono">{{ info.build }}</span>.</template>
          <template v-else>This is a local build; opens the latest code on GitHub.</template>
        </span>
      </button>
    </div>

    <p
      v-if="message"
      role="alert"
      class="alert alert-warning text-sm"
    >
      {{ message }}
    </p>

    <div class="grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section
        aria-labelledby="ledger-h"
        class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-5"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="ledger-h"
            class="flex items-center gap-2 font-bold"
          >
            <AppIcon
              name="shield"
              class="text-success"
            /> What Wavescan did this session
          </h2>
          <span class="text-xs opacity-70">since {{ since }}</span>
        </div>
        <dl class="divide-y divide-base-300 text-sm">
          <div class="flex justify-between gap-3 py-2">
            <dt>Windows it took pictures of</dt>
            <dd>{{ activity.capturesStarted ? "Wuthering Waves only" : "None yet" }}</dd>
          </div>
          <div class="flex justify-between gap-3 py-2">
            <dt>Pictures saved to disk</dt>
            <dd class="font-mono">
              0
            </dd>
          </div>
          <div class="flex justify-between gap-3 py-2">
            <dt>Clicks sent to the game</dt>
            <dd class="font-mono">
              {{ activity.clicks }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 py-2">
            <dt>Scrolls sent to the game</dt>
            <dd class="font-mono">
              {{ activity.scrolls }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 py-2">
            <dt>Internet connections made by Wavescan</dt>
            <dd>None (this version makes none)</dd>
          </div>
          <div class="flex justify-between gap-3 py-2">
            <dt>Pages opened in your browser</dt>
            <dd class="font-mono">
              {{ activity.pagesOpened }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 py-2">
            <dt>User ID area read</dt>
            <dd class="text-success">
              Never
            </dd>
          </div>
        </dl>
        <p class="text-xs opacity-70">
          Counted by the app as it works. You can confirm the network part with a firewall such as Windows Defender Firewall or Little Snitch.
        </p>
      </section>

      <section
        aria-labelledby="about-h"
        class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-5"
      >
        <h2
          id="about-h"
          class="font-bold"
        >
          About this copy
        </h2>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt class="opacity-70">
            Version
          </dt>
          <dd>{{ info?.version ?? "…" }}</dd>
          <dt class="opacity-70">
            Build
          </dt>
          <dd class="font-mono">
            {{ info?.build ?? "local" }}
          </dd>
          <dt class="opacity-70">
            Game data
          </dt>
          <dd>{{ gameData ? `${gameData.echoes} echoes · ` : "" }}<span class="font-mono">{{ gameData?.hash.slice(0, 8) }}</span></dd>
          <dt class="opacity-70">
            Text reader
          </dt>
          <dd>{{ reader }}</dd>
          <dt class="opacity-70">
            Licence
          </dt>
          <dd>
            <button
              type="button"
              class="link"
              @click="open(LICENSE_URL)"
            >
              GPL-3.0
            </button>
          </dd>
        </dl>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm"
            @click="open(RELEASES_URL)"
          >
            What's new <AppIcon
              name="external"
              :size="12"
            />
          </button>
          <button
            type="button"
            class="btn btn-sm"
            @click="copyDetails"
          >
            {{ detailsCopied ? "Copied" : "Copy app details" }}
          </button>
        </div>
        <p class="text-xs opacity-75">
          Found a security problem?
          <button
            type="button"
            class="link"
            @click="open(SECURITY_URL)"
          >
            Report it privately
          </button>
          instead of opening a public issue.
        </p>
      </section>
    </div>

    <section
      id="troubleshooting"
      aria-labelledby="trouble-h"
      class="flex flex-col gap-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="trouble-h"
          class="text-lg font-bold"
        >
          Troubleshooting
        </h2>
        <label class="input input-sm w-64">
          <AppIcon
            name="search"
            :size="14"
            class="opacity-60"
          />
          <span class="sr-only">Search troubleshooting</span>
          <input
            v-model="query"
            type="search"
            placeholder="e.g. HDR, administrator"
          >
        </label>
      </div>
      <div class="flex flex-col gap-2">
        <details
          v-for="topic in topics"
          :key="topic.id"
          class="collapse collapse-arrow rounded-box border border-base-300 bg-base-100"
        >
          <summary class="collapse-title text-sm font-semibold">
            {{ topic.question }}
          </summary>
          <div class="collapse-content text-sm">
            <p
              v-for="line in topic.answer"
              :key="line"
              class="mb-1"
            >
              {{ line }}
            </p>
          </div>
        </details>
        <p
          v-if="topics.length === 0"
          class="text-sm opacity-70"
        >
          Nothing matches. Try another word, or report the problem.
        </p>
      </div>
    </section>
  </div>
</template>
