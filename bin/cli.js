#!/usr/bin/env node
// Stable entry point. The published `bin` path has to keep working across
// versions, so it stays here and forwards to the bundle rather than moving.
import('../dist/index.js').catch((error) => {
  console.error(`nomnomtokens failed to start: ${error?.message ?? error}`)
  console.error('This install looks incomplete. Try: npm i -g nomnomtokens@latest')
  process.exit(1)
})
