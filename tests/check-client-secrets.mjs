import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const names=['DATABASE_URL','MIGRATION_DATABASE_URL','BETTER_AUTH_SECRET','DEMO_SEED_PASSWORD','CRON_SECRET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','ABLY_API_KEY'];
const secrets=[...new Set(names.map(name=>process.env[name]).filter(value=>value&&value.length>=8))];
const directories=process.argv.slice(2);
assert.ok(directories.length,'Pass explicit built client artifact directories.');
assert.ok(secrets.length,'No configured server values were available to check; refusing a meaningless pass.');
let files=0;
async function scan(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=directory+'/'+entry.name;
  if(entry.isDirectory())await scan(path);
  else if(entry.isFile()){
   const content=await readFile(path);
   for(const secret of secrets)assert.equal(content.includes(secret),false,'Configured server-only value found in client artifact: '+path);
   files++;
  }
 }
}
for(const directory of directories)await scan(directory);
console.log(JSON.stringify({result:'PASS',files,directories,configuredValuesChecked:secrets.length,note:'Configured-value artifact scan only; not a comprehensive secret or dependency audit.'}));
