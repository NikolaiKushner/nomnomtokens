<script setup lang="ts">
// Dark by default, applied before paint so the page never flashes light.
useHead({
  script: [{
    innerHTML: `try{document.documentElement.classList.toggle('dark',(localStorage.getItem('nnt-theme')??'dark')==='dark')}catch(e){document.documentElement.classList.add('dark')}`,
    tagPosition: 'head',
  }],
  htmlAttrs: { class: 'dark' },
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
