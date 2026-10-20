<script setup lang="ts">
import { ref, watch } from "vue";
import { MAX_PLAYER_NAME_LENGTH, playerName, setPlayerName } from "@/settings/playerName";

// "Your in-game name": the echo panel shows it instead of "Rover" ("Equipped by Clover"), so
// Wavescan needs it to tell echoes on the main character. Saved on this PC only, never
// exported or reported (ADR 0030). Saving re-checks every echo already read.

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const draft = ref(playerName() ?? "");
watch(playerName, (name) => (draft.value = name ?? ""));
const saved = ref(false);

function save() {
  setPlayerName(draft.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 1500);
}
</script>

<template>
  <form
    class="flex flex-col gap-1.5"
    @submit.prevent="save"
  >
    <label
      for="player-name"
      class="text-[11px] font-bold tracking-[.12em] uppercase opacity-75"
    >Your in-game name</label>
    <div class="flex flex-wrap items-center gap-2">
      <input
        id="player-name"
        v-model="draft"
        type="text"
        class="input input-sm w-48"
        :maxlength="MAX_PLAYER_NAME_LENGTH"
        placeholder="e.g. Clover"
        autocomplete="off"
        spellcheck="false"
      >
      <button
        type="submit"
        class="btn btn-sm"
        :disabled="draft.trim() === (playerName() ?? '')"
      >
        Save
      </button>
      <span
        v-if="saved"
        role="status"
        class="text-xs text-success"
      >Saved</span>
    </div>
    <p
      v-if="!compact"
      class="text-xs opacity-75"
    >
      The game shows your name, not "Rover", on echoes your main character has equipped. It stays on this PC:
      the scan file says "Rover", and reports hide it.
    </p>
  </form>
</template>
