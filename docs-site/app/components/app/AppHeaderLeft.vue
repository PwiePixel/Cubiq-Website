<script setup lang="ts">
// Logo + Schriftzug „Cubiq Launcher“ + „Docs“ – führt zur Startseite der Doku in der aktuellen Sprache.
const { localePath } = useDocusI18n()
const icon = useBaseUrl('/icon.png')
</script>

<template>
  <NuxtLink :to="localePath('/')" class="flex min-w-0 items-center gap-2.5 text-highlighted" aria-label="Cubiq Launcher Docs">
    <img :src="icon" alt="" width="32" height="32" class="size-8 shrink-0">
    <span class="cubiq-display hidden text-xl leading-none min-[400px]:inline">Cubiq Launcher</span>
    <UBadge label="Docs" color="primary" variant="subtle" size="sm" class="cubiq-display" />
  </NuxtLink>
</template>
