import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try{
 const context=await browser.newContext({viewport:{width:375,height:812}});
 const page=await context.newPage();const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200_000,uploadThroughput:75_000});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const started=Date.now();await page.goto('http://localhost:4173',{waitUntil:'commit'});await page.getByRole('heading',{name:/Less waste/}).waitFor();
 const firstViewMs=Date.now()-started;
 const chartRequested=await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('ReportChart')));assert.equal(chartRequested,false,'Public view must not load protected-dashboard chart chunk');
 const applicationRequested=await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('ApplicationShell')));assert.equal(applicationRequested,false,'Public view must not load the authenticated application shell');
 const reactRuntimeRequested=await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>/\/assets\/main-/.test(e.name)));assert.equal(reactRuntimeRequested,false,'Static public home must not load the application runtime');
 // The following checks concern cache/security, not network performance. Remove throttling
 // after measuring first view so unrelated background test load cannot stall SW installation.
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
 await page.waitForLoadState('load');
 assert.deepEqual(errors,[],'Static public homepage must render without uncaught errors');
 const paints=await page.evaluate(()=>Object.fromEntries(performance.getEntriesByType('paint').map(entry=>[entry.name,Math.round(entry.startTime)])));
 await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Public-shell service worker did not activate within 20 seconds.')),20000))]));await page.reload();
 const protectedStatus=await page.evaluate(()=>fetch('/api/v1/sites').then(r=>r.status));assert.equal(protectedStatus,401);
 const cachePaths=await page.evaluate(async()=>{const paths=[];for(const name of await caches.keys()){const cache=await caches.open(name);for(const key of await cache.keys())paths.push(new URL(key.url).pathname);}return paths;});assert.deepEqual(cachePaths,['/offline.html']);
 const icons=await page.evaluate(async()=>{const manifest=await fetch('/manifest.webmanifest').then(r=>r.json());return manifest.icons.map(icon=>icon.sizes);});assert.deepEqual(icons,['192x192','512x512']);
 await page.goto('http://localhost:4173/login');await page.getByRole('heading',{name:'Welcome back.',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:/Less waste/}).count(),0,'Non-home SPA routes must not retain prerendered homepage markup');
 assert.deepEqual(errors,[],'Lazy application route must render without uncaught errors');
 await context.setOffline(true);await page.goto('http://localhost:4173/app/jobs');await page.getByRole('heading',{name:"You're offline"}).waitFor();
 const performanceBudget={firstContentfulPaintMs:3000,visibleHeadingMs:5000};
 const performanceTargetMet=paints['first-contentful-paint']<=performanceBudget.firstContentfulPaintMs&&firstViewMs<=performanceBudget.visibleHeadingMs;
 console.log(JSON.stringify({functionalChecks:'PASS',performanceTargetMet,performanceBudget,firstViewMs,paints,conditions:'375x812, cold context/cache disabled, 150ms latency, 1.6Mbps download, 0.6Mbps upload, 4x CPU, local Vite production preview (no CDN compression guarantee)',measurement:'Navigation commit to visible-heading confirmation; paint timings from browser navigation start. Cache/security checks run after removing throttles.',publicChartRequested:chartRequested,authenticatedShellRequested:applicationRequested,reactRuntimeRequested,protectedStatus,cachePaths,offlineFallback:true,lazyLoginRoute:true,manifestIconSizes:icons},null,2));
 if(!performanceTargetMet)process.exitCode=1;
 await context.close();
}finally{await browser.close();}
