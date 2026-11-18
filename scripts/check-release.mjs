import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = fileURLToPath(new URL('../', import.meta.url));
export const repository = '1578393930/MaikNote-for-Windows';
export const readJson = (name) => JSON.parse(fs.readFileSync(path.join(rootDir, name), 'utf8'));

export function checkRelease() {
  const { version } = readJson('version.json');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('version.json must contain a stable version such as 0.10.22');
  }
  const config = readJson('src-tauri/tauri.conf.json');
  const cargo = fs.readFileSync(path.join(rootDir, 'src-tauri/Cargo.toml'), 'utf8');
  if (config.version !== version || readJson('package.json').version !== version ||
      cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== version) {
    throw new Error('Version mismatch: run npm run sync-version before committing the release');
  }
  const endpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
  if (config.plugins.updater.endpoints.length !== 1 || config.plugins.updater.endpoints[0] !== endpoint) {
    throw new Error('Updater must point to your Windows repository');
  }
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== repository) {
    throw new Error('Release repository does not match updater repository');
  }
  return { version, config };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = checkRelease();
  console.log(`Release configuration verified: ${repository} v${version}`);
}
