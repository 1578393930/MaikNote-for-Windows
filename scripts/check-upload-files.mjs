import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Inspect names only: never read or print credential contents.
const root = fileURLToPath(new URL('../', import.meta.url));
const blocked = execFileSync('git', ['ls-files', '--cached', '--ignored', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean);

if (blocked.length) {
  console.error('Upload blocked: tracked/staged files violate .gitignore:');
  for (const name of blocked) console.error(`- ${name}`);
  process.exitCode = 1;
} else {
  console.log('Upload file check passed: no ignored files are tracked/staged. Review the staged diff before pushing.');
}
