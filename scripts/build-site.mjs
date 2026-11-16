// Builds the public Netlify folder `site/` from the compiled app.
//
//   node scripts/build-site.mjs --clean   removes the generated `dist/` and `site/` folders
//   node scripts/build-site.mjs           copies the public files into a fresh `site/`
//
// Only the files listed in PUBLIC_FILES and the compiled `dist/` folder are published; sources,
// tests, configuration and node_modules never reach `site/`. All paths are derived from this
// script's own location, not from the current working directory.

import { access, cp, lstat, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(ROOT, 'dist');
const SITE_DIR = join(ROOT, 'site');

// The only files taken from the repository root.
const PUBLIC_FILES = ['index.html', 'styles.css'];
const ENTRY_MODULE = join('dist', 'main.js');

// The generated folders this script is allowed to remove: exactly these two paths.
const GENERATED_DIRS = [DIST_DIR, SITE_DIR];

async function assertProjectRoot() {
  const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  if (manifest.name !== 'country-search') {
    throw new Error(`Refusing to run: ${ROOT} is not the country-search project`);
  }
}

async function removeGenerated(directory) {
  if (!GENERATED_DIRS.includes(directory)) {
    throw new Error(`Refusing to remove ${directory}: not a generated directory`);
  }
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  // A symbolic link could point anywhere: never follow it.
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`Refusing to remove ${directory}: not a plain directory`);
  }
  await rm(directory, { recursive: true });
}

async function clean() {
  for (const directory of GENERATED_DIRS) {
    await removeGenerated(directory);
  }
}

// The published `dist/` must contain nothing but compiled .js modules in plain directories:
// no source maps, declarations, symbolic links or other files.
async function assertOnlyCompiledModules(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await assertOnlyCompiledModules(path);
    } else if (!entry.isFile() || !entry.name.endsWith('.js')) {
      throw new Error(`Refusing to publish ${path}: not a compiled .js module`);
    }
  }
}

async function build() {
  for (const file of [...PUBLIC_FILES, ENTRY_MODULE]) {
    try {
      await access(join(ROOT, file));
    } catch {
      throw new Error(`Missing ${file}: run "npm run build" first`);
    }
  }

  // Checked on the source before anything is removed or copied.
  await assertOnlyCompiledModules(DIST_DIR);

  await removeGenerated(SITE_DIR);
  await cp(DIST_DIR, join(SITE_DIR, 'dist'), { recursive: true });
  for (const file of PUBLIC_FILES) {
    await cp(join(ROOT, file), join(SITE_DIR, file));
  }

  const published = (await readdir(SITE_DIR)).sort();
  const expected = [...PUBLIC_FILES, 'dist'].sort();
  if (published.join() !== expected.join()) {
    throw new Error(`Unexpected content of site/: ${published.join(', ')}`);
  }
  console.log(`site/ is ready: ${published.join(', ')}`);
}

await assertProjectRoot();
if (process.argv.includes('--clean')) {
  await clean();
} else {
  await build();
}
