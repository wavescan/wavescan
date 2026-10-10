<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { errorMessage, openUrl } from "@/ipc/commands";
import { readEngineName } from "@/ocr/appReader";
import type { AppInfo } from "@/ipc/types";
import type { GameDataInfo } from "@/data/scannerData";
import { newIssueUrl, REPORT_KINDS, reportBody, reportTitle, type ReportContext, type ReportKind } from "@/feedback/issue";
import { issueSearchUrl } from "@/feedback/links";
import { displayName, fieldLabel, flaggedFields, type FieldId } from "@/review/fields";
import { useScanStore } from "@/review/scanStore";
import { go, navigation } from "@/ui/navigation";
import AppIcon from "@/components/AppIcon.vue";

// Report a problem: Wavescan writes the report, shows every word of it, and opens a GitHub
// "new issue" page with it filled in. Nothing is sent until the user presses Submit there.

const props = defineProps<{ info: AppInfo | null; gameData: GameDataInfo | null }>();

const store = useScanStore();
const kind = ref<ReportKind>(navigation.report.kind);
const echoId = ref<string | null>(navigation.report.echoId ?? null);
const field = ref<FieldId | null>(navigation.report.field ?? null);
const note = ref("");
const includeSetup = ref(true);
const reader = ref("unknown");
const status = ref<string | null>(null);

onMounted(async () => {
  reader.value = await readEngineName().catch(() => "unknown");
});

/** Echoes to pick from: ones with something to check first, then newest. */
const echoChoices = computed(() =>
  [...store.state.candidates].sort(
    (a, b) => Number(flaggedFields(b).length > 0) - Number(flaggedFields(a).length > 0) || b.index - a.index,
  ),
);
const echo = computed(() => (echoId.value ? store.get(echoId.value) : undefined));
const fieldChoices = computed((): FieldId[] => {
  const c = echo.value;
  if (!c) return [];
  const substats = c.slot.substats.flatMap((s, i) => (s.subStat ? [`substat.${i}` as FieldId] : []));
  return ["name", "level", "rank", "set", "mainStat", ...substats];
});

watch(echoId, () => {
  if (field.value && !fieldChoices.value.includes(field.value)) field.value = null;
});

const context = computed(
  (): ReportContext => ({
    app: props.info,
    gameData: props.gameData,
    resolution: store.state.resolution,
    reader: reader.value,
    mode: store.state.mode,
    echo: echo.value ? { candidate: echo.value, field: field.value } : null,
    autoResult: navigation.lastAutoResult,
    note: note.value,
    includeSetup: includeSetup.value,
  }),
);
const title = computed(() => reportTitle(kind.value, context.value));
const body = computed(() => reportBody(kind.value, context.value));
const searchTerm = computed(() => (echo.value && field.value ? fieldLabel(echo.value, field.value).replace(" (substat)", "") : ""));

async function copyText(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(`${title.value}\n\n${body.value}`);
    return true;
  } catch {
    return false;
  }
}

async function openIssue() {
  const { url, truncated } = newIssueUrl(title.value, body.value);
  const copied = await copyText();
  try {
    await openUrl(url);
    status.value = truncated
      ? "Opened GitHub. The report was too long for the link, so paste the full text from your clipboard."
      : `Opened GitHub in your browser.${copied ? " The text is also on your clipboard." : ""} Press Submit there when it looks right.`;
  } catch (error) {
    status.value = `Couldn't open your browser (${errorMessage(error)}).${copied ? " The report is on your clipboard: paste it into a new issue on GitHub." : ""}`;
  }
}

async function copyOnly() {
  status.value = (await copyText()) ? "Copied. Paste it into a new GitHub issue or share it with the testers on Discord." : "Couldn't copy.";
}

async function searchIssues() {
  try {
    await openUrl(issueSearchUrl(searchTerm.value));
  } catch (error) {
    status.value = errorMessage(error);
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-5">
    <header class="flex flex-col gap-1">
      <button
        type="button"
        class="link self-start text-sm no-underline"
        @click="go('help')"
      >
        ← Help &amp; feedback
      </button>
      <h1 class="text-2xl font-bold">
        Report a problem
      </h1>
      <p class="opacity-80">
        Wavescan writes the report for you. You see every word before anything leaves this app, and you send it yourself from GitHub.
      </p>
    </header>

    <fieldset>
      <legend class="mb-2 font-semibold">
        What's it about?
      </legend>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2">
        <label
          v-for="option in REPORT_KINDS"
          :key="option.kind"
          class="flex cursor-pointer flex-col gap-1 rounded-box border p-3"
          :class="kind === option.kind ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-100'"
        >
          <span class="flex items-center gap-2 text-sm font-semibold">
            <input
              v-model="kind"
              type="radio"
              name="report-kind"
              class="radio radio-sm"
              :value="option.kind"
            >
            {{ option.label }}
          </span>
          <span class="pl-6 text-xs opacity-70">{{ option.hint }}</span>
        </label>
      </div>
    </fieldset>

    <div class="grid gap-5 md:grid-cols-2">
      <section
        aria-labelledby="include-h"
        class="flex flex-col gap-3"
      >
        <h2
          id="include-h"
          class="font-semibold"
        >
          What to include
        </h2>

        <template v-if="kind === 'misread'">
          <p
            v-if="echoChoices.length === 0"
            class="text-sm opacity-75"
          >
            There are no scanned echoes to attach. Describe what was misread below.
          </p>
          <div
            v-else
            class="grid gap-2 sm:grid-cols-2"
          >
            <label class="flex flex-col gap-1 text-sm">
              Echo
              <select
                v-model="echoId"
                class="select select-sm w-full"
              >
                <option :value="null">None</option>
                <option
                  v-for="c in echoChoices"
                  :key="c.id"
                  :value="c.id"
                >#{{ c.index }} {{ displayName(c) }} +{{ c.level ?? "?" }}{{ flaggedFields(c).length ? " (to check)" : "" }}</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
              Which value
              <select
                v-model="field"
                class="select select-sm w-full"
                :disabled="!echo"
              >
                <option :value="null">Not sure / several</option>
                <option
                  v-for="f in fieldChoices"
                  :key="f"
                  :value="f"
                >{{ echo ? fieldLabel(echo, f) : f }}</option>
              </select>
            </label>
          </div>
        </template>

        <div
          v-if="kind === 'game'"
          class="flex flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-100 p-3 text-sm"
        >
          Run Diagnostics and paste its report into the issue: it says exactly what Wavescan can see.
          <button
            type="button"
            class="btn btn-sm"
            @click="go('diagnostics')"
          >
            Open Diagnostics
          </button>
        </div>

        <p
          v-if="kind === 'auto' && !navigation.lastAutoResult"
          class="text-sm opacity-75"
        >
          No auto scan has run since Wavescan opened, so describe what happened below.
        </p>

        <label class="flex items-start gap-2 rounded-box border border-base-300 bg-base-100 p-3 text-sm">
          <input
            v-model="includeSetup"
            type="checkbox"
            class="checkbox checkbox-sm mt-0.5"
          >
          <span>App and setup details<br><span class="text-xs opacity-70">Version, build, system, game size, text reader</span></span>
        </label>

        <label class="flex flex-col gap-1 text-sm">
          <span class="font-semibold">What happened?</span>
          <textarea
            v-model="note"
            rows="4"
            class="textarea w-full"
            :placeholder="kind === 'misread' ? 'e.g. the game shows Crit. DMG 17.4%' : 'What you did, what you expected, what you saw'"
          />
        </label>

        <p class="flex items-start gap-2 rounded-box border border-base-300 bg-base-100 p-3 text-xs opacity-90">
          <AppIcon
            name="shield"
            :size="16"
            class="text-success"
          />
          Never included: your User ID, account name, other windows, pictures, or file paths from your computer.
          For a picture, use Copy picture on the Diagnostics screen (User ID blacked out) and paste it into GitHub yourself.
        </p>
      </section>

      <section
        aria-labelledby="preview-h"
        class="flex flex-col gap-3"
      >
        <div class="flex items-baseline justify-between">
          <h2
            id="preview-h"
            class="font-semibold"
          >
            Exactly what will be sent
          </h2>
          <span class="text-xs opacity-70">{{ body.length.toLocaleString() }} characters</span>
        </div>
        <div class="rounded-box border border-base-300 bg-base-100 px-3 py-2 text-sm">
          <span class="opacity-70">Title: </span>{{ title }}
        </div>
        <pre class="max-h-80 overflow-auto rounded-box border border-base-300 bg-neutral p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-content">{{ body }}</pre>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-primary"
            @click="openIssue"
          >
            Open on GitHub <AppIcon
              name="external"
              :size="14"
            />
          </button>
          <button
            type="button"
            class="btn"
            @click="copyOnly"
          >
            <AppIcon name="copy" /> Copy text
          </button>
        </div>
        <p
          v-if="status"
          role="status"
          class="text-sm"
        >
          {{ status }}
        </p>
        <p class="text-xs opacity-75">
          Opens a new issue in your browser with this text filled in. You can still edit it there, and nothing is posted until you press Submit.
          No GitHub account? Copy the text and share it with the testers on Discord.
        </p>
        <p class="flex items-center gap-2 border-t border-base-300 pt-3 text-xs">
          <AppIcon
            name="search"
            :size="14"
          />
          <span>Before you send:
            <button
              type="button"
              class="link"
              @click="searchIssues"
            >search existing issues{{ searchTerm ? ` for "${searchTerm}"` : "" }}</button>.
            Adding to one helps more than a new one.</span>
        </p>
      </section>
    </div>
  </div>
</template>
