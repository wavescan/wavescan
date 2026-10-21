<script setup lang="ts">
import PlayerNameField from "@/components/PlayerNameField.vue";
import ThemePicker from "@/components/ThemePicker.vue";

// Settings: how Wavescan looks (ADR 0036) and your in-game name (ADR 0030). Both stay on
// this PC. The name field is also on the Scan screen, where it's needed before a scan.
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-7">
    <h1 class="font-title text-3xl">
      Settings
    </h1>

    <section
      aria-labelledby="look-h"
      class="flex flex-col gap-3"
    >
      <h2
        id="look-h"
        class="section-title"
      >
        <strong>Appearance</strong>
      </h2>
      <p class="text-sm opacity-75">
        Three colour schemes taken from Wuthering Waves itself. Your choice stays on this PC.
      </p>
      <ThemePicker />
    </section>

    <section
      aria-labelledby="name-h"
      class="flex flex-col gap-3"
    >
      <h2
        id="name-h"
        class="section-title"
      >
        <strong>Scanning</strong>
      </h2>
      <div class="rounded-box bg-base-100 p-4">
        <PlayerNameField />
      </div>
    </section>
  </div>
</template>
