import { build } from 'esbuild';
await build({
 entryPoints:['apps/api/src/vercel.ts'],outfile:'apps/api/dist/server.mjs',
 bundle:true,platform:'node',format:'esm',target:'node24',
 external:['pg-native'],
 banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"}
});
console.log('Bundled Node API and shared workspaces.');
