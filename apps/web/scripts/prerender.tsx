import { readFile, writeFile } from 'node:fs/promises';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import Landing from '../src/Landing';

// Build-time rendering of public content only. No auth client, API, DB or user records are imported.
const output = new URL('../dist/index.html', import.meta.url);
const html = await readFile(output, 'utf8');
const placeholder = '<div id="root"></div>';
if (!html.includes(placeholder)) throw new Error('Public prerender requires the expected empty Vite root.');
const shell = renderToString(<StaticRouter location="/"><Landing demo={process.env.VITE_DEMO_MODE!=='false'}/></StaticRouter>);
await writeFile(output, html.replace(placeholder, `<div id="root">${shell}</div>`));
console.log('Prerendered public homepage only; no protected data was loaded.');
