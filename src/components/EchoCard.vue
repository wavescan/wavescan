<script setup lang="ts">
import { computed } from "vue";
import { setName } from "@/data/scannerData";
import type { EchoCandidate } from "@/session/echoSession";
import { expectedSubstatCount } from "@/session/exportScan";
import {
  candidateCost,
  displayName,
  flaggedFields,
  mainStatValue,
  rollTier,
  substatKey,
  substatValue,
  type FieldId,
} from "@/review/fields";
import { setIconUrl } from "@/ui/setIconUrl";
import AppIcon from "@/components/AppIcon.vue";

// One echo, laid out like the in-game details panel: name and level, cost/rarity/set,
// main stat, then substats with a roll meter. A field Wavescan wasn't sure about is
// highlighted with a "check" label and is a button that opens the fixer.

const props = withDefaults(
  defineProps<{
    candidate: EchoCandidate;
    /** "large" for the "Just read" spotlight. */
    size?: "normal" | "large";
    /** Hide the footer actions (live view). */
    readonly?: boolean;
    /** The field being fixed right now, outlined. */
    active?: FieldId | null;
  }>(),
  { size: "normal", readonly: false, active: null },
);
const emit = defineEmits<{ fix: [field: FieldId]; undo: []; remove: []; report: [] }>();

const flagged = computed(() => new Set<string>(flaggedFields(props.candidate)));
const checked = computed(() => new Set(props.candidate.checked ?? []));
const isFlagged = (field: FieldId) => flagged.value.has(field);
const isChecked = (field: FieldId) => checked.value.has(field) && !flagged.value.has(field);

const cost = computed(() => candidateCost(props.candidate));
const iconUrl = computed(() => setIconUrl(props.candidate.slot.set));
const mainValue = computed(() => mainStatValue(props.candidate));
const levelPercent = computed(() => ((props.candidate.level ?? 0) / 25) * 100);

const rows = computed(() =>
  props.candidate.slot.substats
    .map((row, i) => {
      const key = substatKey(props.candidate, i);
      return {
        index: i,
        field: `substat.${i}` as FieldId,
        label: row.subStat,
        value: row.subStatValue,
        tier: rollTier(key, substatValue(props.candidate, i)),
      };
    })
    .filter((r) => r.label),
);

/** Slots unlocked by the level but not tuned yet (only when the count is believable). */
const untuned = computed(() => {
  const level = props.candidate.level;
  if (level === null || isFlagged("substats")) return 0;
  return Math.max(0, expectedSubstatCount(level) - rows.value.length);
});

const stars = computed(() => (props.candidate.rank ? "★".repeat(props.candidate.rank) : null));
const large = computed(() => props.size === "large");

const flagClass = "rounded-md bg-warning/15 text-base-content ring-1 ring-warning/60 hover:bg-warning/25";
const activeClass = "outline-2 outline-offset-2 outline-primary";
</script>

<template>
  <article
    class="flex flex-col gap-3 rounded-box border bg-base-100 p-4"
    :class="flagged.size ? 'border-warning/70' : 'border-base-300'"
    :aria-label="`${displayName(candidate)}, scan number ${candidate.index}`"
  >
    <header class="flex items-center gap-3">
      <div
        class="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral"
        :class="large ? 'size-14' : 'size-10'"
      >
        <img
          v-if="iconUrl"
          :src="iconUrl"
          alt=""
          class="size-full object-cover"
        >
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline justify-between gap-2">
          <component
            :is="readonly || !isFlagged('name') ? 'span' : 'button'"
            type="button"
            class="truncate text-left font-bold"
            :class="[large ? 'text-xl' : 'text-base', isFlagged('name') ? flagClass + ' px-1' : '', active === 'name' ? activeClass : '']"
            @click="!readonly && isFlagged('name') && emit('fix', 'name')"
          >
            {{ displayName(candidate) }}
            <span
              v-if="isFlagged('name')"
              class="badge badge-warning badge-xs ml-1 align-middle"
            >check</span>
          </component>
          <component
            :is="readonly || !isFlagged('level') ? 'span' : 'button'"
            type="button"
            class="shrink-0 font-mono text-primary"
            :class="[large ? 'text-lg' : '', isFlagged('level') ? flagClass + ' px-1' : '', active === 'level' ? activeClass : '']"
            :aria-label="isFlagged('level') ? `Level, read as ${candidate.raw.level || 'nothing'}: check` : undefined"
            @click="!readonly && isFlagged('level') && emit('fix', 'level')"
          >
            +{{ candidate.level ?? "?" }}
          </component>
        </div>
        <div
          class="mt-1.5 h-1 overflow-hidden rounded bg-base-300"
          aria-hidden="true"
        >
          <div
            class="h-1 bg-primary"
            :style="{ width: `${levelPercent}%` }"
          />
        </div>
      </div>
    </header>

    <div class="flex flex-wrap gap-1.5 text-xs">
      <span class="rounded-md bg-base-200 px-2 py-0.5">Cost {{ cost ?? "?" }}</span>
      <component
        :is="readonly || !isFlagged('rank') ? 'span' : 'button'"
        type="button"
        class="rounded-md bg-base-200 px-2 py-0.5"
        :class="[isFlagged('rank') ? flagClass : 'text-warning', active === 'rank' ? activeClass : '']"
        :aria-label="candidate.rank ? `${candidate.rank} star` : 'rarity unknown'"
        @click="!readonly && isFlagged('rank') && emit('fix', 'rank')"
      >
        {{ stars ?? "rarity ?" }}<span v-if="isFlagged('rank')"> · check</span>
      </component>
      <component
        :is="readonly || !isFlagged('set') ? 'span' : 'button'"
        type="button"
        class="rounded-md bg-base-200 px-2 py-0.5"
        :class="[isFlagged('set') ? flagClass : '', active === 'set' ? activeClass : '']"
        @click="!readonly && isFlagged('set') && emit('fix', 'set')"
      >
        {{ candidate.slot.set ? setName(candidate.slot.set) : "set ?" }}<span v-if="isFlagged('set')"> · check</span>
        <span
          v-if="isChecked('set')"
          class="text-secondary"
        > · checked</span>
      </component>
    </div>

    <div class="border-t border-base-300 pt-3">
      <component
        :is="readonly || !isFlagged('mainStat') ? 'div' : 'button'"
        type="button"
        class="flex w-full items-baseline justify-between gap-2 text-left"
        :class="[isFlagged('mainStat') ? flagClass + ' px-1' : '', active === 'mainStat' ? activeClass : '']"
        @click="!readonly && isFlagged('mainStat') && emit('fix', 'mainStat')"
      >
        <span
          class="font-semibold"
          :class="large ? 'text-lg' : ''"
        >
          {{ candidate.slot.mainStatLabel || "Main stat ?" }}
          <span
            v-if="isFlagged('mainStat')"
            class="badge badge-warning badge-xs ml-1 align-middle"
          >check</span>
          <span
            v-if="isChecked('mainStat')"
            class="badge badge-secondary badge-outline badge-xs ml-1 align-middle"
          >checked</span>
        </span>
        <span
          class="font-mono"
          :class="large ? 'text-xl' : 'text-base'"
        >{{ mainValue === null ? "" : `${mainValue.toFixed(1)}%` }}</span>
      </component>
      <div
        v-if="candidate.raw.secondaryStat"
        class="mt-1 text-xs opacity-70"
      >
        {{ candidate.raw.secondaryStat }}
      </div>
    </div>

    <ul class="flex flex-col gap-1.5 border-t border-base-300 pt-3 text-sm">
      <li
        v-for="row in rows"
        :key="row.index"
      >
        <component
          :is="readonly || !isFlagged(row.field) ? 'div' : 'button'"
          type="button"
          class="grid w-full grid-cols-[1fr_3rem_3.5rem] items-center gap-2 text-left"
          :class="[isFlagged(row.field) ? flagClass + ' -mx-1 px-1 py-0.5' : '', active === row.field ? activeClass : '']"
          @click="!readonly && isFlagged(row.field) && emit('fix', row.field)"
        >
          <!-- Full stat names wrap rather than being cut off: "Basic Attack DMG Bonus" matters. -->
          <span class="leading-tight">
            {{ row.label }}
            <span
              v-if="isFlagged(row.field)"
              class="badge badge-warning badge-xs ml-1 align-middle"
            >check</span>
            <span
              v-if="isChecked(row.field)"
              class="badge badge-secondary badge-outline badge-xs ml-1 align-middle"
            >checked</span>
          </span>
          <span
            class="flex gap-px"
            :title="row.tier ? `Roll ${row.tier.tier} of ${row.tier.of}` : 'Not a value the game rolls'"
            :aria-label="row.tier ? `roll ${row.tier.tier} of ${row.tier.of}` : undefined"
          >
            <template v-if="row.tier">
              <span
                v-for="n in row.tier.of"
                :key="n"
                class="h-1.5 flex-1 rounded-sm"
                :class="n <= row.tier.tier ? 'bg-primary' : 'bg-base-300'"
              />
            </template>
          </span>
          <span class="text-right font-mono">{{ row.value }}</span>
        </component>
      </li>
      <li
        v-for="n in untuned"
        :key="`untuned-${n}`"
        class="flex justify-between opacity-60"
      >
        <span>Not tuned yet</span><span>—</span>
      </li>
      <li v-if="isFlagged('substats')">
        <component
          :is="readonly ? 'div' : 'button'"
          type="button"
          class="w-full text-left text-xs"
          :class="[flagClass, 'px-1 py-0.5', active === 'substats' ? activeClass : '']"
          @click="!readonly && emit('fix', 'substats')"
        >
          Expected {{ expectedSubstatCount(candidate.level ?? 0) }} substats at +{{ candidate.level }}, read {{ rows.length }} · check
        </component>
      </li>
      <li
        v-if="rows.length === 0 && untuned === 0 && !isFlagged('substats')"
        class="opacity-60"
      >
        No substats yet
      </li>
    </ul>

    <footer
      v-if="!readonly"
      class="flex items-center justify-between gap-2 border-t border-base-300 pt-2 text-xs"
    >
      <span class="opacity-70">#{{ candidate.index }}</span>
      <div class="flex gap-1">
        <button
          v-if="candidate.checked?.length"
          type="button"
          class="btn btn-ghost btn-xs"
          @click="emit('undo')"
        >
          <AppIcon
            name="undo"
            :size="14"
          /> Undo my changes
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          @click="emit('report')"
        >
          <AppIcon
            name="bug"
            :size="14"
          /> Report
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          :aria-label="`Remove ${displayName(candidate)} from the scan`"
          @click="emit('remove')"
        >
          <AppIcon
            name="trash"
            :size="14"
          />
        </button>
      </div>
    </footer>
  </article>
</template>
