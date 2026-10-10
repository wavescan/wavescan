<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { scannerGameData } from "@wutheringtools/scanner-core";
import { allSetKeys, setName } from "@/data/scannerData";
import type { EchoCandidate } from "@/session/echoSession";
import {
  candidateCost,
  confirmField,
  fieldLabel,
  fixEcho,
  fixLevel,
  fixMainStat,
  fixRank,
  fixSet,
  fixSubstatValue,
  legalSubstatValues,
  mainStatKey,
  mainStatOptions,
  rawReading,
  setOptions,
  statLabel,
  substatKey,
  substatValue,
  type FieldId,
} from "@/review/fields";
import { MAX_LEVEL_BY_RANK } from "@/session/echoRank";

// Fixes one field: only values the game allows are offered (a substat's legal rolls, the
// sets this echo comes in, the main stats for its cost), plus "Looks right" to accept what
// was read. Emits the fixed candidate; the parent stores it.

const props = defineProps<{ candidate: EchoCandidate; field: FieldId }>();
const emit = defineEmits<{ apply: [next: EchoCandidate]; skip: []; report: [] }>();

const substatIndex = computed(() => (props.field.startsWith("substat.") ? Number(props.field.slice(8)) : null));
const raw = computed(() => rawReading(props.candidate, props.field));
const label = computed(() => fieldLabel(props.candidate, props.field));

const substatChoices = computed(() => {
  const i = substatIndex.value;
  if (i === null) return [];
  const key = substatKey(props.candidate, i);
  const flat = key?.endsWith("_FLAT") ?? false;
  return legalSubstatValues(key).map((value) => ({ value, text: flat ? String(value) : value.toFixed(1) }));
});
const currentSubstat = computed(() => (substatIndex.value === null ? null : substatValue(props.candidate, substatIndex.value)));

const levelChoices = computed(() => {
  const cap = props.candidate.rank ? (MAX_LEVEL_BY_RANK[props.candidate.rank] ?? 25) : 25;
  return Array.from({ length: cap + 1 }, (_, i) => i);
});
const setChoices = computed(() => setOptions(props.candidate, allSetKeys()));
const mainStatChoices = computed(() => mainStatOptions(candidateCost(props.candidate)));

const echoQuery = ref("");
watch(
  () => props.candidate.id + props.field,
  () => (echoQuery.value = props.candidate.raw.name),
  { immediate: true },
);
const echoMatches = computed(() => {
  const q = echoQuery.value.trim().toLowerCase();
  const echoes = Object.values(scannerGameData().echoes);
  const words = q.split(/\s+/).filter(Boolean);
  return echoes
    .filter((e) => words.every((w) => e.name.toLowerCase().includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);
});

/** True when there's something read that the user can accept as-is. */
const canConfirm = computed(() => {
  const c = props.candidate;
  switch (props.field) {
    case "name":
      return c.slot.echo !== null;
    case "level":
      return c.level !== null;
    case "rank":
      return c.rank !== null;
    case "set":
      return c.slot.set !== null;
    case "mainStat":
      return mainStatKey(c) !== null;
    case "substats":
      return true;
    default:
      return currentSubstat.value !== null && substatChoices.value.some((s) => Math.abs(s.value - (currentSubstat.value ?? -1)) < 0.05);
  }
});

const error = ref<string | null>(null);
function apply(fix: () => EchoCandidate) {
  try {
    error.value = null;
    emit("apply", fix());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

const choiceClass = (selected: boolean) =>
  selected ? "btn btn-sm btn-primary" : "btn btn-sm btn-outline border-base-300 font-normal";
</script>

<template>
  <div
    role="group"
    :aria-label="`Fix ${label}`"
    class="flex flex-col gap-3 rounded-box border border-base-300 bg-base-200 p-4 shadow-lg"
  >
    <div class="text-sm font-semibold">
      <template v-if="field === 'substats'">
        Does the game show this many substats?
      </template>
      <template v-else>
        What does the game show for {{ label.replace(" (substat)", "") }}?
      </template>
    </div>
    <div
      v-if="raw"
      class="font-mono text-xs opacity-70"
    >
      Read as: "{{ raw }}"
    </div>

    <div
      v-if="substatIndex !== null"
      class="flex flex-col gap-2"
    >
      <span class="text-xs opacity-70">Only values the game can roll:</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="choice in substatChoices"
          :key="choice.value"
          type="button"
          class="font-mono"
          :class="choiceClass(currentSubstat !== null && Math.abs(choice.value - currentSubstat) < 0.05)"
          @click="apply(() => fixSubstatValue(candidate, substatIndex ?? 0, choice.value))"
        >
          {{ choice.text }}
        </button>
      </div>
    </div>

    <div
      v-else-if="field === 'level'"
      class="flex flex-wrap gap-1.5"
    >
      <button
        v-for="level in levelChoices"
        :key="level"
        type="button"
        class="min-w-11 font-mono"
        :class="choiceClass(level === candidate.level)"
        @click="apply(() => fixLevel(candidate, level))"
      >
        +{{ level }}
      </button>
    </div>

    <div
      v-else-if="field === 'rank'"
      class="flex flex-wrap gap-1.5"
    >
      <button
        v-for="rank in [2, 3, 4, 5]"
        :key="rank"
        type="button"
        :class="choiceClass(rank === candidate.rank)"
        @click="apply(() => fixRank(candidate, rank))"
      >
        {{ "★".repeat(rank) }}
      </button>
    </div>

    <div
      v-else-if="field === 'set'"
      class="flex flex-wrap gap-1.5"
    >
      <button
        v-for="set in setChoices"
        :key="set"
        type="button"
        :class="choiceClass(set === candidate.slot.set)"
        @click="apply(() => fixSet(candidate, set))"
      >
        {{ setName(set) }}
      </button>
    </div>

    <div
      v-else-if="field === 'mainStat'"
      class="flex flex-wrap gap-1.5"
    >
      <button
        v-for="key in mainStatChoices"
        :key="key"
        type="button"
        :class="choiceClass(key === mainStatKey(candidate))"
        @click="apply(() => fixMainStat(candidate, key))"
      >
        {{ statLabel(key) }}
      </button>
    </div>

    <div
      v-else-if="field === 'name'"
      class="flex flex-col gap-2"
    >
      <label class="input input-sm w-full">
        <span class="sr-only">Echo name</span>
        <input
          v-model="echoQuery"
          type="search"
          placeholder="Type the echo's name"
          autocomplete="off"
        >
      </label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="echo in echoMatches"
          :key="echo.key"
          type="button"
          :class="choiceClass(echo.key === candidate.slot.echo)"
          @click="apply(() => fixEcho(candidate, echo.key))"
        >
          {{ echo.name }}
        </button>
        <span
          v-if="echoMatches.length === 0"
          class="text-xs opacity-70"
        >No echo matches. A brand-new echo needs a Wavescan update.</span>
      </div>
    </div>

    <p
      v-else-if="field === 'substats'"
      class="text-xs opacity-80"
    >
      If the game shows more, one wasn't read: remove this echo and click it again in watch mode.
    </p>

    <p
      v-if="error"
      role="alert"
      class="text-xs text-error"
    >
      {{ error }}
    </p>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        class="link text-xs"
        @click="emit('report')"
      >
        Report this misread
      </button>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="emit('skip')"
        >
          Skip
        </button>
        <button
          v-if="canConfirm"
          type="button"
          class="btn btn-sm"
          @click="apply(() => confirmField(candidate, field))"
        >
          {{ field === "substats" ? "Yes, that's right" : "Looks right" }}
        </button>
      </div>
    </div>
  </div>
</template>
