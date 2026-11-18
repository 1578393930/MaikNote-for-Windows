#!/usr/bin/env node
// Assemble the current Windows release only; reject missing or invalid signatures.
import fs from 'node:fs';
import path from 'node:path';
import { checkRelease, repository, rootDir } from './check-release.mjs';
import { verifyUpdaterSignature } from './verify-updater-signature.mjs';

const { version, config } = checkRelease();
const setupName = `MaikNote_${version}_x64-setup.exe`;
const bundleDir = path.join(rootDir, 'src-tauri/target/release/bundle/nsis');
const setup = fs.readFileSync(path.join(bundleDir, setupName));
const signature = fs.readFileSync(path.join(bundleDir, `${setupName}.sig`), 'utf8').trim();
verifyUpdaterSignature(setup, signature, config.plugins.updater.pubkey);

const outputDir = path.join(rootDir, 'release-portable');
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(path.join(bundleDir, setupName), path.join(outputDir, setupName));
fs.copyFileSync(path.join(bundleDir, `${setupName}.sig`), path.join(outputDir, `${setupName}.sig`));
const latest = {
  version,
  notes: `https://github.com/${repository}/releases/tag/v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${repository}/releases/download/v${version}/${setupName}`,
    },
  },
};
fs.writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');
console.log(`Verified installer and generated latest.json for v${version}`);
