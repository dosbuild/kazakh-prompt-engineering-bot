#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = join(root, 'workflow/kazakh-prompt-engineering-bot.json');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }

  return files;
}

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function markdownTargets(source) {
  const targets = [];
  const markdownLink = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlLink = /(?:href|src)=["']([^"']+)["']/g;
  let match;

  while ((match = markdownLink.exec(source))) targets.push(match[1]);
  while ((match = htmlLink.exec(source))) targets.push(match[1]);
  return targets;
}

let workflowSource;
let workflow;

try {
  workflowSource = await readFile(workflowPath, 'utf8');
  workflow = JSON.parse(workflowSource);
} catch (error) {
  console.error(`FAIL: cannot read valid workflow JSON: ${relative(root, workflowPath)}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

check(typeof workflow.name === 'string' && workflow.name.length > 0, 'workflow must have a name');
check(workflow.active === false, 'public workflow import must be inactive by default');
check(Array.isArray(workflow.nodes) && workflow.nodes.length > 0, 'workflow must contain nodes');
check(workflow.connections && typeof workflow.connections === 'object', 'workflow must contain connections');

for (const unsafeKey of ['id', 'versionId', 'pinData', 'staticData', 'shared', 'meta']) {
  check(!(unsafeKey in workflow), `public workflow should not contain top-level instance field: ${unsafeKey}`);
}

const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
const names = nodes.map((node) => node.name);
const nameSet = new Set(names);
check(nameSet.size === names.length, 'node names must be unique because expressions reference them by name');

for (const [sourceName, outputs] of Object.entries(workflow.connections ?? {})) {
  check(nameSet.has(sourceName), `connection source does not exist: ${sourceName}`);
  for (const channel of Object.values(outputs ?? {})) {
    for (const branch of channel ?? []) {
      for (const connection of branch ?? []) {
        check(nameSet.has(connection.node), `connection target does not exist: ${connection.node}`);
      }
    }
  }
}

const requiredNodes = [
  'Telegram Trigger',
  'Input Contract / Session Key',
  'Ensure Clarification Table',
  'Session Router',
  'Clarification Answer Classifier',
  'Agent 1 - Request Mapper',
  'Agent 2 - Kazakh Prompt Architect',
  'Agent 3 - Prompt Fidelity Auditor',
  'Agent 4 - Final Prompt Editor',
  'Output Packager',
];

for (const name of requiredNodes) {
  check(nameSet.has(name), `required architectural node is missing: ${name}`);
}

const allowedCredentials = new Map([
  ['PLACEHOLDER_TELEGRAM_CREDENTIAL_ID', 'PLACEHOLDER_TELEGRAM_CREDENTIAL'],
  ['PLACEHOLDER_OPENAI_CREDENTIAL_ID', 'PLACEHOLDER_OPENAI_CREDENTIAL'],
]);
const credentials = [];

for (const node of nodes) {
  for (const credential of Object.values(node.credentials ?? {})) {
    if (credential?.id !== undefined) {
      credentials.push({ id: String(credential.id), name: String(credential.name ?? '') });
    }
  }
}

for (const credential of credentials) {
  check(allowedCredentials.get(credential.id) === credential.name,
    `non-placeholder or mismatched credential reference found: ${credential.id} / ${credential.name}`);
}

const typeCounts = new Map();
for (const node of nodes) {
  typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
}

check(nodes.length === 53, `expected the canonical 53-node workflow, found ${nodes.length}`);
check(typeCounts.get('@n8n/n8n-nodes-langchain.openAi') === 5, 'expected five OpenAI stages');
check(typeCounts.get('n8n-nodes-base.dataTable') === 7, 'expected seven Data Table operations');
check(credentials.length === 18, `expected 18 credential references, found ${credentials.length}`);

const byName = new Map(nodes.map((node) => [node.name, node]));
check(byName.get('Telegram Trigger')?.parameters?.updates?.join(',') === 'message,channel_post',
  'Telegram Trigger update types changed from message + channel_post');
check(byName.get('Prepare Clarification Session')?.parameters?.jsCode?.includes('30 * 60 * 1000'),
  'documented 30-minute clarification expiry is missing');
check(byName.get('Purge Old Clarification Sessions')?.parameters?.filters?.conditions
  ?.some((condition) => String(condition.keyValue).includes('days: 7')),
  'documented seven-day purge threshold is missing');
check(byName.get('Output Packager')?.parameters?.jsCode?.includes('safeDirectLimit = 3600'),
  'documented 3,600-character delivery threshold is missing');

const files = await collectFiles(root);
const relativeFiles = files.map((path) => relative(root, path));
const forbiddenNames = new Set(['.DS_Store', 'Thumbs.db']);

for (const path of relativeFiles) {
  const basename = path.split('/').at(-1);
  check(!forbiddenNames.has(basename) && !basename.startsWith('._'),
    `local OS artifact must not be published: ${path}`);
  check(basename === '.env.example' || (basename !== '.env' && !basename.startsWith('.env.')),
    `local environment file must not be published: ${path}`);
  check(!/(^|\/)\d+\.(png|jpe?g|webp)$/i.test(path), `asset needs a semantic filename: ${path}`);
}

const requiredFiles = [
  'README.md',
  'README.kk.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'docs/setup.md',
  'docs/user-flow.md',
  'docs/architecture.md',
  'docs/privacy-and-security.md',
  'docs/assets/n8n-workflow-overview.png',
  'docs/assets/telegram-bot-profile.png',
  'docs/assets/telegram-request-processing.png',
  'docs/assets/telegram-clarification-resume.png',
  'docs/assets/telegram-prompt-file-delivery.png',
];

for (const path of requiredFiles) {
  check(relativeFiles.includes(path), `required publication file is missing: ${path}`);
}

const textExtensions = new Set(['.md', '.json', '.mjs', '.js', '.yml', '.yaml', '.txt']);
const secretPatterns = [
  ['OpenAI-style secret key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['Telegram bot token', /\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/g],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['generic bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi],
  ['absolute macOS user path', /\/Users\/[^/\s]+\//g],
  ['absolute Linux home path', /\/home\/[^/\s]+\//g],
];

let markdownCount = 0;

for (const file of files) {
  const extension = extname(file).toLowerCase();
  const basename = file.split('/').at(-1);
  const isText = textExtensions.has(extension) || basename === '.gitignore' || basename === '.editorconfig';
  if (!isText) continue;

  const source = await readFile(file, 'utf8');
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    check(!pattern.test(source), `${label} pattern found in ${relative(root, file)}`);
  }

  if (extension !== '.md') continue;
  markdownCount += 1;

  for (const rawTarget of markdownTargets(source)) {
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(rawTarget) || rawTarget.startsWith('#')) continue;
    const [encodedPath, anchor] = rawTarget.split('#', 2);
    const localPath = resolve(dirname(file), decodeURIComponent(encodedPath));
    check(await exists(localPath), `broken local link in ${relative(root, file)}: ${rawTarget}`);

    if (anchor && await exists(localPath) && extname(localPath).toLowerCase() === '.md') {
      const targetSource = await readFile(localPath, 'utf8');
      const slugs = new Set([...targetSource.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => githubSlug(match[1])));
      check(slugs.has(decodeURIComponent(anchor).toLowerCase()),
        `broken Markdown anchor in ${relative(root, file)}: ${rawTarget}`);
    }
  }
}

for (const imagePath of requiredFiles.filter((path) => path.endsWith('.png'))) {
  const buffer = await readFile(join(root, imagePath));
  check(buffer.subarray(1, 4).toString('ascii') === 'PNG', `asset is not a PNG: ${imagePath}`);
  check(buffer.length >= 24, `PNG is truncated: ${imagePath}`);

  const binaryText = buffer.toString('latin1');
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    check(!pattern.test(binaryText), `${label} pattern found in image metadata: ${imagePath}`);
  }

  if (buffer.length >= 24) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    check(width >= 900 && height >= 300, `visual is unexpectedly small (${width}×${height}): ${imagePath}`);
  }
}

if (failures.length > 0) {
  console.error(`Repository validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const models = [...new Set(nodes
  .filter((node) => node.type === '@n8n/n8n-nodes-langchain.openAi')
  .map((node) => node.parameters?.modelId?.value)
  .filter(Boolean))];

console.log(`OK: ${workflow.name}`);
console.log(`- workflow: ${nodes.length} nodes; ${Object.keys(workflow.connections).length} connected sources`);
console.log(`- credentials: ${credentials.length} references; placeholders only`);
console.log(`- models: ${models.join(', ')}`);
console.log(`- publication: ${markdownCount} Markdown files; local links and required visuals valid`);
console.log('- safety: no forbidden artifacts or common secret/local-path patterns found');
