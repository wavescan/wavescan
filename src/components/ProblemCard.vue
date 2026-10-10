<script setup lang="ts">
import { ref } from "vue";
import type { Problem } from "@/feedback/problems";
import AppIcon from "@/components/AppIcon.vue";

// A problem explained: what happened, what to do, an optional main action (the default
// slot), "Report this", and the technical message under "Details".

defineProps<{ problem: Problem; details?: string | null }>();
defineEmits<{ report: [] }>();

const open = ref(false);

const TONE = {
  warn: { box: "border-warning/50 bg-warning/10", icon: "text-warning" },
  error: { box: "border-error/50 bg-error/10", icon: "text-error" },
  info: { box: "border-info/40 bg-info/10", icon: "text-info" },
  success: { box: "border-success/40 bg-success/10", icon: "text-success" },
} as const;
</script>

<template>
  <section
    role="alert"
    class="flex flex-col gap-3 rounded-box border p-4"
    :class="TONE[problem.tone].box"
  >
    <div class="flex items-center gap-2">
      <AppIcon
        :name="problem.tone === 'success' ? 'check' : problem.tone === 'error' ? 'x' : 'alert'"
        :class="TONE[problem.tone].icon"
      />
      <h2 class="text-base font-semibold">
        {{ problem.title }}
      </h2>
    </div>
    <p class="text-sm opacity-90">
      {{ problem.cause }}
    </p>
    <ol
      v-if="problem.steps.length"
      class="list-decimal space-y-1 pl-5 text-sm"
    >
      <li
        v-for="step in problem.steps"
        :key="step"
      >
        {{ step }}
      </li>
    </ol>
    <div class="flex flex-wrap items-center gap-3">
      <slot />
      <button
        v-if="problem.reportable"
        type="button"
        class="btn btn-ghost btn-sm"
        @click="$emit('report')"
      >
        Report this
      </button>
      <button
        v-if="details && details !== problem.cause"
        type="button"
        class="btn btn-ghost btn-sm"
        :aria-expanded="open"
        @click="open = !open"
      >
        Details
      </button>
    </div>
    <p
      v-if="open && details"
      class="font-mono text-xs opacity-70"
    >
      {{ details }}
    </p>
  </section>
</template>
