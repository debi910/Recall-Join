// Deploys the Function and the web app (Appwrite Sites). Safe to re-run.
// Usage: npm run deploy            (both)
//        npm run deploy -- function | site
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Functions, Sites, Runtime, Framework, BuildRuntime } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { client } from './client.js';

const FN = process.env.VITE_APPWRITE_FUNCTION_ID || 'recall-join';
const SITE = process.env.APPWRITE_SITE_ID || 'recall-join-web';
const what = process.argv[2] || 'all';
const functions = new Functions(client);
const sites = new Sites(client);
const tmp = mkdtempSync(join(tmpdir(), 'rj-'));
const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensure(label, fn) {
  try { await fn(); console.log('created', label); } catch (err) { if (err?.code === 409) console.log('exists ', label); else throw err; }
}

async function waitReady(get) {
  for (;;) {
    const d = await get();
    process.stdout.write(`  ${d.status}\r`);
    if (d.status === 'ready') return console.log('  ready   ');
    if (d.status === 'failed') throw new Error(`Build failed:\n${d.buildLogs}`);
    await wait(3000);
  }
}

async function deployFunction() {
  sh('npm run build:function');
  await ensure(`function ${FN}`, () => functions.create({
    functionId: FN, name: 'Recall Join', runtime: Runtime.Node22, execute: ['users'],
    entrypoint: 'src/main.js', commands: 'npm install', timeout: 60,
    scopes: ['databases.read', 'databases.write', 'tables.read', 'tables.write', 'rows.read', 'rows.write', 'users.read'],
  }));
  const vars = {
    APPWRITE_DB_ID: process.env.APPWRITE_DB_ID || 'recall',
    DEMO_DIST_TEAM: process.env.DEMO_DIST_TEAM || 'dist-demo',
    ADMIN_TEAM: process.env.ADMIN_TEAM || 'admins',
  };
  const existing = (await functions.listVariables({ functionId: FN })).variables;
  for (const [key, value] of Object.entries(vars)) {
    const v = existing.find((x) => x.key === key);
    if (v) await functions.updateVariable({ functionId: FN, variableId: v.$id, key, value });
    else await functions.createVariable({ functionId: FN, variableId: key.toLowerCase().replaceAll('_', '-'), key, value });
  }
  const tar = join(tmp, 'function.tar.gz');
  sh(`tar -czf ${tar} -C functions/recall-join package.json src`);
  const d = await functions.createDeployment({ functionId: FN, code: InputFile.fromPath(tar, 'function.tar.gz'), activate: true });
  console.log('function deployment', d.$id);
  await waitReady(() => functions.getDeployment({ functionId: FN, deploymentId: d.$id }));
}

// The web app is built here (Vite inlines the VITE_* values from .env) and
// uploaded as static files, so the Site needs no build step or variables.
async function deploySite() {
  sh('npm run build');
  await ensure(`site ${SITE}`, () => sites.create({
    siteId: SITE, name: 'Recall Join', framework: Framework.Other, buildRuntime: BuildRuntime.Node22,
    outputDirectory: './', fallbackFile: 'index.html',
  }));
  const tar = join(tmp, 'site.tar.gz');
  sh(`tar -czf ${tar} -C web/dist .`);
  const d = await sites.createDeployment({ siteId: SITE, code: InputFile.fromPath(tar, 'site.tar.gz'), outputDirectory: './', activate: true });
  console.log('site deployment', d.$id);
  await waitReady(() => sites.getDeployment({ siteId: SITE, deploymentId: d.$id }));
  console.log(`\nSite: https://${SITE}.appwrite.network (check the Domains tab in the console if it differs)`);
}

if (what === 'all' || what === 'function') await deployFunction();
if (what === 'all' || what === 'site') await deploySite();
