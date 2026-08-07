<script setup lang="ts">
/**
 * Theme is applied before first paint by an inline script, so the page never
 * flashes the wrong colour.
 *
 * Deliberately **no** `htmlAttrs: { class: 'dark' }` here. Nuxt's head manager
 * re-applies html attributes on every client-side navigation, which silently
 * overwrites the class the theme toggle just set — the theme appeared to reset
 * itself every time you changed page.
 */
useHead({
  meta: [{ name: 'color-scheme', content: 'dark light' }],
  script: [{
    key: 'nnt-theme',
    tagPosition: 'head',
    innerHTML: `(function(){try{`
      + `var p=localStorage.getItem('nnt-theme');`
      + `if(p!=='light'&&p!=='dark'&&p!=='system')p='system';`
      + `var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);`
      + `document.documentElement.classList.toggle('dark',d);`
      + `document.documentElement.style.colorScheme=d?'dark':'light';`
      + `}catch(e){}})()`,
  }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
