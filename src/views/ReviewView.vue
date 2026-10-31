<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";
import { setName } from "@/data/scannerData";
import { IMPORT_SITES, type ImportSite } from "@/feedback/links";
import { errorMessage, openUrl } from "@/ipc/commands";
import type { AppInfo } from "@/ipc/types";
import type { EchoCandidate } from "@/session/echoSession";
import { buildScan } from "@/session/exportScan";
import { displayName, flaggedFields, type FieldId } from "@/review/fields";
import { EMPTY_FILTER, filterCandidates, reviewQueue, summarize, type ReviewFilter } from "@/review/list";
import { useScanStore } from "@/review/scanStore";
import { goReport, goScan } from "@/ui/navigation";
import AppIcon from "@/components/AppIcon.vue";
import EchoAvatar from "@/components/EchoAvatar.vue";
import EchoCard from "@/components/EchoCard.vue";
import FieldFixer from "@/components/FieldFixer.vue";

// Review and export: every echo in the scan, what still needs a look, fixes limited to
// values the game allows, and the export: copy to the clipboard, optionally opening the
// import page of a site that reads the scan (Wuthering Tools, Tacet Lab) to paste it into.

const props = defineProps<{ info: AppInfo | null }>();

const store = useScanStore();
const filter = reactive<ReviewFilter>({ ...EMPTY_FILTER });
const layout = ref<"cards" | "table">("cards");
/** The field being fixed: from a click on a card, or the "Check them now" walk-through. */
const fixing = ref<{ id: string; field: FieldId } | null>(null);
const walkthrough = ref(false);
const copied = ref(false);
const opened = ref<ImportSite | null>(null);
const message = ref<string | null>(null);
const confirmClear = ref(false);

const candidates = computed(() => store.state.candidates);
const summary = computed(() => summarize(candidates.value));
const shown = computed(() => filterCandidates(candidates.value, filter));
const queue = computed(() => reviewQueue(candidates.value));
const fixingCandidate = computed(() => (fixing.value ? store.get(fixing.value.id) : undefined));
const costs = [1, 3, 4] as const;

const built = computed(() =>
  buildScan(candidates.value, {
    scannerVersion: props.info?.version ?? "0.0.0",
    platform: props.info?.platform === "macos" ? "macos" : "windows",
    resolution: store.state.resolution,
    mode: store.state.mode,
  }),
);

function startFix(candidate: EchoCandidate, field: FieldId) {
  walkthrough.value = false;
  fixing.value = { id: candidate.id, field };
}

function startWalkthrough() {
  const first = queue.value[0];
  if (!first) return;
  walkthrough.value = true;
  fixing.value = { ...first };
  void nextTick(() => document.getElementById("fixer")?.querySelector<HTMLElement>("button")?.focus());
}

/** Where the field being fixed sits in the queue, or -1. */
function queueIndex(): number {
  const f = fixing.value;
  return f ? queue.value.findIndex((q) => q.id === f.id && q.field === f.field) : -1;
}

/**
 * Moves the walk-through on from queue position `at`. A fixed field leaves the queue, so
 * the next one moves up into its place; a skipped one stays, so the next is one further.
 * Past the end, the walk-through finishes.
 */
function advance(at: number, skipped: boolean) {
  const next = walkthrough.value && at !== -1 ? queue.value[skipped ? at + 1 : at] : undefined;
  if (!next) {
    stopFixing();
    return;
  }
  fixing.value = { ...next };
}

function apply(next: EchoCandidate) {
  const at = queueIndex();
  store.update(next);
  advance(at, false);
}

function skip() {
  advance(queueIndex(), true);
}

function stopFixing() {
  walkthrough.value = false;
  fixing.value = null;
}

function report(candidate: EchoCandidate, field: FieldId | null) {
  goReport({ kind: "misread", echoId: candidate.id, field });
}

/** Copies the scan; true when it worked. Problems are shown under the buttons. */
async function copyScan(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(built.value.scan, null, 2));
    copied.value = true;
    message.value = null;
    setTimeout(() => (copied.value = false), 2500);
    return true;
  } catch (error) {
    message.value = errorMessage(error);
    return false;
  }
}

/** Copies the scan, then opens `site`'s import page in the browser to paste it into. */
async function copyAndOpen(site: ImportSite) {
  if (!(await copyScan())) return;
  try {
    await openUrl(site.url);
    opened.value = site;
  } catch (error) {
    message.value = `Copied, but the browser didn't open: ${errorMessage(error)}`;
  }
}

function clearScan() {
  store.clear();
  confirmClear.value = false;
  stopFixing();
}

const queuePosition = computed(() => {
  const f = fixing.value;
  if (!f) return null;
  const i = queue.value.findIndex((q) => q.id === f.id && q.field === f.field);
  return i === -1 ? null : { at: i + 1, of: queue.value.length };
});
</script>

<template>
  <div
    v-if="candidates.length === 0"
    class="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center"
  >
    <h1 class="font-title text-3xl">
      Nothing to review yet
    </h1>
    <p class="opacity-80">
      Scan some echoes first. They show up here to check and export.
    </p>
    <button
      type="button"
      class="btn btn-primary"
      @click="goScan('watch')"
    >
      Start watching
    </button>
  </div>

  <div
    v-else
    class="mx-auto flex max-w-7xl flex-wrap items-start gap-6"
    @keydown.esc="stopFixing"
  >
    <div class="flex min-w-0 flex-[999_1_32rem] flex-col gap-4">
      <header class="flex flex-col gap-1">
        <h1 class="font-title text-3xl">
          Review {{ summary.total }} {{ summary.total === 1 ? "echo" : "echoes" }}
        </h1>
        <p class="text-sm opacity-80">
          <template v-if="summary.toCheck">
            {{ summary.toCheck }} {{ summary.toCheck === 1 ? "has" : "have" }} a value Wavescan wasn't sure about. Check them against the game, then export.
          </template>
          <template v-else>
            Everything read clearly. Export when you're ready.
          </template>
        </p>
      </header>

      <div
        v-if="summary.toCheck && !walkthrough"
        class="edge-warning flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <span class="text-sm"><strong>{{ queue.length }} {{ queue.length === 1 ? "value" : "values" }} to check.</strong> Step through them one at a time.</span>
        <button
          type="button"
          class="btn btn-outline btn-warning btn-sm"
          @click="startWalkthrough"
        >
          Check them now
        </button>
      </div>

      <section
        v-if="walkthrough && fixing && fixingCandidate"
        id="fixer"
        aria-label="Checking values"
        class="feature-line grid gap-4 rounded-box bg-base-100 p-4 md:grid-cols-2"
      >
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-sm">
            <span class="font-semibold">Checking {{ queuePosition ? `${queuePosition.at} of ${queuePosition.of}` : "" }}</span>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              @click="stopFixing"
            >
              Done for now
            </button>
          </div>
          <EchoCard
            :candidate="fixingCandidate"
            :active="fixing.field"
            readonly
          />
        </div>
        <FieldFixer
          :candidate="fixingCandidate"
          :field="fixing.field"
          @apply="apply"
          @skip="skip"
          @report="report(fixingCandidate, fixing.field)"
        />
      </section>

      <div
        role="toolbar"
        aria-label="Filter echoes"
        class="flex flex-wrap items-center gap-2"
      >
        <label class="input input-sm min-w-48 flex-1">
          <AppIcon
            name="search"
            :size="14"
            class="opacity-60"
          />
          <span class="sr-only">Search echoes</span>
          <input
            v-model="filter.search"
            type="search"
            placeholder="Search name, set or stat"
          >
        </label>
        <button
          type="button"
          class="btn btn-sm"
          :class="filter.toCheck ? 'btn-warning' : ''"
          :aria-pressed="filter.toCheck"
          @click="filter.toCheck = !filter.toCheck"
        >
          To check · {{ summary.toCheck }}
        </button>
        <label class="select select-sm w-auto">
          <span class="sr-only">Set</span>
          <select v-model="filter.set">
            <option :value="null">Any set</option>
            <option
              v-for="[key, count] in summary.sets"
              :key="key"
              :value="key"
            >{{ setName(key) }} ({{ count }})</option>
          </select>
        </label>
        <label class="select select-sm w-auto">
          <span class="sr-only">Cost</span>
          <select v-model="filter.cost">
            <option :value="null">Any cost</option>
            <option
              v-for="cost in costs"
              :key="cost"
              :value="cost"
            >Cost {{ cost }}</option>
          </select>
        </label>
        <label class="select select-sm w-auto">
          <span class="sr-only">Level</span>
          <select v-model.number="filter.minLevel">
            <option :value="0">Any level</option>
            <option :value="20">+20 and up</option>
            <option :value="25">+25 only</option>
          </select>
        </label>
        <div
          role="radiogroup"
          aria-label="Layout"
          class="tabs-line ml-auto"
        >
          <button
            type="button"
            role="radio"
            :aria-checked="layout === 'cards'"
            @click="layout = 'cards'"
          >
            Cards
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="layout === 'table'"
            @click="layout = 'table'"
          >
            Table
          </button>
        </div>
      </div>

      <p
        v-if="shown.length === 0"
        class="rounded-box border border-dashed border-base-300 p-6 text-center text-sm opacity-70"
      >
        No echoes match these filters.
      </p>

      <div
        v-if="layout === 'cards'"
        class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] items-start gap-3"
      >
        <div
          v-for="c in shown"
          :key="c.id"
          class="flex flex-col gap-2"
        >
          <EchoCard
            :candidate="c"
            :active="!walkthrough && fixing?.id === c.id ? fixing.field : null"
            @fix="startFix(c, $event)"
            @undo="store.undo(c.id)"
            @remove="store.remove(c.id)"
            @report="report(c, null)"
          />
          <FieldFixer
            v-if="!walkthrough && fixing?.id === c.id"
            :candidate="c"
            :field="fixing.field"
            @apply="apply"
            @skip="stopFixing"
            @report="report(c, fixing.field)"
          />
        </div>
      </div>

      <div
        v-else
        class="overflow-x-auto rounded-box bg-base-100"
      >
        <table class="table table-sm">
          <thead>
            <tr>
              <th>#</th>
              <th>Echo</th>
              <th>Level</th>
              <th>Set</th>
              <th>Main stat</th>
              <th>Substats</th>
              <th><span class="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in shown"
              :key="c.id"
            >
              <td
                class="font-mono opacity-70"
                :class="{ 'edge-flag': flaggedFields(c).length }"
              >
                {{ c.index }}
              </td>
              <td class="font-medium">
                <span class="flex items-center gap-2">
                  <EchoAvatar
                    :echo="c.slot.echo"
                    :name="displayName(c)"
                    size-class="size-7"
                  />
                  {{ displayName(c) }}
                </span>
              </td>
              <td class="font-mono font-semibold text-accent">
                +{{ c.level ?? "?" }}
              </td>
              <td>{{ c.slot.set ? setName(c.slot.set) : "?" }}</td>
              <td>{{ c.slot.mainStatLabel || "?" }}</td>
              <td class="text-xs opacity-75">
                <span
                  v-for="(s, i) in c.slot.substats.filter((row) => row.subStat)"
                  :key="i"
                  class="mr-2 whitespace-nowrap"
                >{{ s.subStat }} <span class="font-mono">{{ s.subStatValue }}</span></span>
              </td>
              <td>
                <button
                  v-if="flaggedFields(c).length"
                  type="button"
                  class="badge badge-warning badge-outline badge-sm"
                  @click="layout = 'cards'; startFix(c, flaggedFields(c)[0]!)"
                >
                  {{ flaggedFields(c).length }} to check
                </button>
                <span
                  v-else-if="c.checked?.length"
                  class="badge badge-secondary badge-outline badge-sm"
                >checked</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <aside
      aria-labelledby="export-h"
      class="flex w-full flex-[1_1_16rem] flex-col gap-4 rounded-box bg-base-100 p-5 md:sticky md:top-0 md:max-w-xs"
    >
      <h2
        id="export-h"
        class="font-title text-xl"
      >
        Export
      </h2>
      <!-- Banded rows, like the stat list in the game's echo panel. -->
      <dl class="bands text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:rounded-[1px] [&>div]:px-2 [&>div]:py-1">
        <div>
          <dt>Echoes in the file</dt>
          <dd class="font-mono font-semibold">
            {{ built.scan.echoes.length }}
          </dd>
        </div>
        <div :class="summary.toCheck ? 'text-warning' : ''">
          <dt>Still to check</dt>
          <dd class="font-mono font-semibold">
            {{ summary.toCheck }}
          </dd>
        </div>
        <div>
          <dt>Checked by you</dt>
          <dd class="font-mono font-semibold">
            {{ summary.checkedByUser }}
          </dd>
        </div>
        <div>
          <dt>Unknown echo (left out)</dt>
          <dd class="font-mono font-semibold">
            {{ built.skippedUnknown }}
          </dd>
        </div>
      </dl>
      <dl class="bands text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&>div]:rounded-[1px] [&>div]:px-2 [&>div]:py-1">
        <div>
          <dt>+25</dt>
          <dd class="font-mono font-semibold">
            {{ summary.levels.max }}
          </dd>
        </div>
        <div>
          <dt>+20 to +24</dt>
          <dd class="font-mono font-semibold">
            {{ summary.levels.high }}
          </dd>
        </div>
        <div>
          <dt>Below +20</dt>
          <dd class="font-mono font-semibold">
            {{ summary.levels.low }}
          </dd>
        </div>
      </dl>
      <!-- Wuthering Tools is the main action; other sites that import the scan follow. -->
      <button
        v-for="(site, i) in IMPORT_SITES"
        :key="site.url"
        type="button"
        class="btn h-auto min-h-10 py-2 leading-tight"
        :class="i === 0 ? 'btn-primary' : 'btn-outline'"
        :disabled="built.scan.echoes.length === 0"
        @click="copyAndOpen(site)"
      >
        <AppIcon name="external" /> Copy and open {{ site.name }}
      </button>
      <button
        type="button"
        class="btn btn-sm"
        :disabled="built.scan.echoes.length === 0"
        @click="copyScan"
      >
        <AppIcon name="copy" /> {{ copied ? "Copied" : "Copy scan only" }}
      </button>
      <p
        v-if="opened"
        class="text-xs leading-relaxed"
      >
        {{ opened.name }} opened in your browser. {{ opened.pasteHint }}
      </p>
      <p
        v-if="message"
        role="alert"
        class="text-xs text-error"
      >
        {{ message }}
      </p>
      <p class="text-xs leading-relaxed opacity-75">
        <template v-if="summary.toCheck">
          You can export now: values you haven't checked are marked in the scan, and Wuthering Tools asks you about them.
        </template>
        Wavescan uploads nothing. The scan goes to your clipboard, and you paste it into the site yourself.
        Wuthering Tools keeps it in your browser.
      </p>
      <div class="border-t border-base-300 pt-3">
        <button
          v-if="!confirmClear"
          type="button"
          class="btn btn-ghost btn-sm"
          @click="confirmClear = true"
        >
          <AppIcon
            name="trash"
            :size="14"
          /> Clear this scan
        </button>
        <div
          v-else
          class="flex flex-col gap-2 text-sm"
        >
          <span>Remove all {{ summary.total }} echoes from Wavescan?</span>
          <div class="flex gap-2">
            <button
              type="button"
              class="btn btn-error btn-sm"
              @click="clearScan"
            >
              Clear
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="confirmClear = false"
            >
              Keep
            </button>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>
