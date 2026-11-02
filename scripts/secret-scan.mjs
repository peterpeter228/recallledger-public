#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { lstat, mkdir, open, readlink, realpath, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

/*
 * Offline, dependency-free CLI. Run from this Git worktree or any subdirectory:
 *   node scripts/secret-scan.mjs [--job-dir DIRECTORY]
 * JSON destination: --job-dir > OMP_JOB_DIR > <OS temporary directory>/recallledger-secret-scan.
 * Markdown destination: <worktree>/submission/SECRET_SCAN.md.
 * Exit 0: complete/no findings; 1: complete/findings; 2: incomplete or report failure.
 * Only the two report files (including existing hard-link aliases) are excluded from
 * WORKTREE content. Nothing is excluded from history, including earlier reports.
 * Git ignore rules exclude UNTRACKED files only; ignored tracked files remain scanned.
 * No dotenv files are loaded, symlink targets followed, providers called, or Git refs changed.
 * Never print caught exceptions, child stderr, source text, or credential values.
 */
const DEFAULT_JOB_DIR = join(tmpdir(), 'recallledger-secret-scan');
const PIECE_SIZE = 64 * 1024;
const SHAPE_WINDOW = 16 * 1024;
const MAX_FINDINGS = 50_000;
const MAX_ERRORS = 1_000;
const HELP = `Usage: node scripts/secret-scan.mjs [--job-dir DIRECTORY]
Scans all locally reachable Git commit history (git log -p --all), raw commit
metadata, local ref names, annotated tag metadata, and tracked/untracked worktree files.
JSON: --job-dir, otherwise OMP_JOB_DIR, otherwise <OS temporary directory>/recallledger-secret-scan/secret-scan.json.
Markdown: submission/SECRET_SCAN.md in the Git worktree.
Only these report files are excluded from worktree content; no history exclusions.
Gitignore applies only to untracked files. Tracked ignored files are still scanned.
Environment credentials are compared in memory; no dotenv or credential files are loaded.
Exact scoped exceptions require scripts/secret-scan-allowlist.json; see scripts/SECRET_SCAN.md.
Exit codes: 0 complete/no findings; 1 complete/findings; 2 incomplete/report failure.
Findings contain rule, environment NAME (when applicable), and location only.
`;

const ALLOWLIST_FILE = 'scripts/secret-scan-allowlist.json';
const allowlistEntries = [];
const allowlistByMatch = new Map();
const allowlistUses = new Map();

async function refuseSymlinkAncestors(root, path) {
  const parts = relative(root, resolve(root, path)).split(sep);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw Object.assign(new Error(), { code: 'SYMLINKED_ANCESTOR' });
    if (!info.isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' });
  }
}

async function loadAllowlist(root, reporter) {
  let handle;
  try {
    await refuseSymlinkAncestors(root, ALLOWLIST_FILE);
    handle = await open(join(root, ALLOWLIST_FILE), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw Error('INVALID_ALLOWLIST');
    const config = JSON.parse(await handle.readFile('utf8'));
    if (!config || Object.keys(config).some(key => !['schemaVersion', 'entries'].includes(key)) || config.schemaVersion !== 1 || !Array.isArray(config.entries)) throw Error('INVALID_ALLOWLIST');
    const ids = new Set();
    const keys = new Set(['id', 'kind', 'value', 'rule', 'paths', 'sections', 'reason', 'source']);
    const sections = new Set(['file-content', 'added', 'removed', 'context-old', 'context-new', 'commit-metadata', 'tag-metadata', 'file-metadata', 'ref-blob', 'ref-name', 'file-name', 'symlink-target']);
    for (const entry of config.entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !keys.has(key))) throw Error('INVALID_ALLOWLIST');
      if (typeof entry.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(entry.id) || ids.has(entry.id)) throw Error('INVALID_ALLOWLIST');
      ids.add(entry.id);
      if (typeof entry.value !== 'string' || !entry.value || entry.value.length > 8192 || /[\u0000-\u001f\u007f]/.test(entry.value)) throw Error('INVALID_ALLOWLIST');
      if (typeof entry.reason !== 'string' || !entry.reason.trim() || entry.reason.length > 1000) throw Error('INVALID_ALLOWLIST');
      if (!Array.isArray(entry.paths) || !entry.paths.length || entry.paths.some(path => path !== null && (typeof path !== 'string' || !path || isAbsolute(path) || /[\\*?\u0000-\u001f\u007f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')))) throw Error('INVALID_ALLOWLIST');
      if (entry.sections !== undefined && (!Array.isArray(entry.sections) || !entry.sections.length || entry.sections.some(section => !sections.has(section)))) throw Error('INVALID_ALLOWLIST');
      if (entry.source !== undefined && (typeof entry.source !== 'string' || !entry.source.trim())) throw Error('INVALID_ALLOWLIST');
      if (entry.kind === 'synthetic-fixture') {
        if (entry.rule !== 'assigned-credential-literal' && !SHAPES.some(([rule]) => rule === entry.rule && !rule.startsWith('pii-') && rule !== 'private-key-pem')) throw Error('INVALID_ALLOWLIST');
      } else if (entry.kind === 'public-onchain') {
        if (entry.rule !== 'assigned-credential-literal') throw Error('INVALID_ALLOWLIST');
      } else if (entry.kind === 'github-noreply') {
        if (entry.rule !== 'pii-email' || !/^[A-Za-z0-9][A-Za-z0-9+_.-]*@users\.noreply\.github\.com$/.test(entry.value)) throw Error('INVALID_ALLOWLIST');
      } else if (entry.kind === 'public-organizer-email') {
        if (entry.rule !== 'pii-email' || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,63}$/.test(entry.value) || typeof entry.source !== 'string') throw Error('INVALID_ALLOWLIST');
        const source = new URL(entry.source);
        if (source.protocol !== 'https:' || source.username || source.password) throw Error('INVALID_ALLOWLIST');
      } else throw Error('INVALID_ALLOWLIST');
      if (entry.paths.includes(null) && !['github-noreply', 'public-organizer-email'].includes(entry.kind)) throw Error('INVALID_ALLOWLIST');
    }
    for (const entry of config.entries) {
      const key = `${entry.rule}\0${entry.value}`;
      if (!allowlistByMatch.has(key)) allowlistByMatch.set(key, []);
      allowlistByMatch.get(key).push(entry);
      allowlistEntries.push(entry);
    }
    return true;
  } catch {
    reporter.error('ALLOWLIST_INVALID_OR_UNAVAILABLE', { path: ALLOWLIST_FILE });
    return false;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function allowlisted(rule, value, location, publicField) {
  // Environment matches, generic private-key headers and non-email PII cannot be waived.
  if (rule === 'current-environment-credential' || rule === 'private-key-pem' || rule === 'pii-phone' || rule === 'pii-home-path') return undefined;
  for (const entry of allowlistByMatch.get(`${rule}\0${value}`) ?? []) {
    if (entry.kind === 'public-onchain' && !publicField) continue;
    const path = location.path ?? null;
    if (!entry.paths.includes(path) || (entry.sections && !entry.sections.includes(location.section))) continue;
    if (path === null && (location.scope !== 'history' || !['commit-metadata', 'tag-metadata'].includes(location.section))) continue;
    return entry;
  }
  return undefined;
}

function scopedPackageLabel(text, start) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  if (!/^[ \t]*(?:-[ \t]+)?$/.test(text.slice(lineStart, start))) return false;
  return /^'@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:@[^'\r\n]+)?'[ \t]*(?::|(?=\r?\n|$))/.test(text.slice(start));
}

function credentialName(name) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return /api[_.-]?key|private|bootstrap|token|secret|pass(?:word|wd|phrase)|credential|authoriz|mnemonic|sign(?:ing|er)?[_.-]?key|access[_.-]?key|client[_.-]?key|connection[_.-]?string|database[_.-]?(?:url|uri)|(?:^|[_.-])(?:key|auth|pwd|seed|cookie|session|dsn)(?:$|[_.-])/i.test(words);
}

function environmentCredentials() {
  const needles = [];
  const names = new Set();
  const seen = new Map();
  const add = (name, value) => {
    if (!value) return;
    let values = seen.get(name);
    if (!values) { values = new Set(); seen.set(name, values); }
    for (const candidate of [value, JSON.stringify(value).slice(1, -1)]) {
      if (!candidate || values.has(candidate)) continue;
      values.add(candidate);
      needles.push({ name, value: candidate });
      names.add(name);
    }
  };
  const decoded = value => { try { return decodeURIComponent(value); } catch { return value; } };
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    // PWD/OLDPWD are shell location variables, not password credentials.
    if (!['PWD', 'OLDPWD'].includes(name) && credentialName(name)) add(name, value);
    if (/^(?:Bearer|Basic)\s+\S+$/i.test(value)) {
      add(name, value);
      add(name, value.replace(/^\S+\s+/, ''));
    }
    try {
      const url = new URL(value);
      if (url.username || url.password) {
        add(name, value);
        add(name, url.username);
        add(name, decoded(url.username));
        add(name, url.password);
        add(name, decoded(url.password));
      }
      for (const [key, credential] of url.searchParams) {
        if (!credentialName(key) && !/^(?:sig|signature)$/i.test(key)) continue;
        add(name, value);
        add(name, credential);
        add(name, encodeURIComponent(credential));
      }
    } catch { /* An arbitrary environment value is not necessarily a URL. */ }
  }
  return { needles, names: [...names].sort() };
}

const SHAPES = [
  ['sui-private-key', /\bsuiprivkey1[a-z0-9]{20,256}\b/gi],
  ['private-key-pem', /-----BEGIN (?:[A-Z0-9]+[ ])*(?:PRIVATE KEY|PRIVATE KEY BLOCK)-----/g],
  ['provider-credential-prefix', /\b(?:sk-(?:(?:proj|svcacct|ant)-)?[A-Za-z0-9_-]{16,512}|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,512}|xox[baprs]-[A-Za-z0-9-]{10,512}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,128}|(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{12,512}|npm_[A-Za-z0-9]{20,256}|hf_[A-Za-z0-9]{20,256})\b/g],
  ['jwt-token', /\beyJ[A-Za-z0-9_-]{8,2048}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,2048}\b/g],
  ['authorization-credential', /\b(?:Bearer|Basic)[ \t]+[A-Za-z0-9+/_=.:-]{12,8192}/gi],
  ['url-embedded-credential', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/?#<>"'`]{1,4096}@/gi],
  ['url-query-credential', /[?&](?:api[_-]?key|access[_-]?token|token|secret|password|passwd|auth|authorization|signature|sig|client[_-]?secret|key)=[^\s&#<>"'`]{1,8192}/gi],
  ['pii-email', /(?<![A-Za-z0-9.!#$%&'*+/=?^_`{|}~-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,63}(?![A-Za-z0-9-])/g],
  ['pii-home-path', /(?:\/(?:home\d*|Users|usr\/home|var\/home|export\/home)\/[^\s/<>"'`]+(?:\/[^\s<>"'`]*)?|\/(?:root|private\/var\/root)(?=\/|[\s<>"'`]|$)(?:\/[^\s<>"'`]*)?|[A-Za-z]:(?:\\{1,2}|\/)(?:Users|Documents and Settings)(?:\\{1,2}|\/)[^\r\n<>"'`]+)/g],
];
const ASSIGNMENT = /(?<![A-Za-z0-9_.-])["'`]?([A-Za-z_][A-Za-z0-9_.-]{0,127})["'`]?[ \t]*(?::|=(?![=>]))[ \t]*(?:(["'`])([^\r\n"'`]{12,8192})\2|([^\s"'`,;<>()[\]{}]{12,8192}))/g;
const PHONE = /(?<![A-Za-z0-9_.:+-])(?:\+[1-9]\d{0,2}(?:[ \t().-]*\d){6,14}|\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]\d{3,4}|1[3-9]\d{9}|1?[2-9]\d{2}[2-9]\d{6})(?![A-Za-z0-9_.:+-])/g;
const CONTEXT_PHONE = /\b(?:phone|mobile|telephone|tel|fax|whats[ ]?app)[ \t]*["']?[ \t]*[:=]?[ \t]*["']?(\+?\d[\d \t().-]{5,30}\d)/gi;

function matches(text, credentials, emit) {
  for (const { name, value } of credentials.needles) {
    let index = text.indexOf(value);
    while (index !== -1) {
      emit(index, index + value.length, 'current-environment-credential', name);
      index = text.indexOf(value, index + Math.max(1, value.length));
    }
  }
  for (const [rule, pattern] of SHAPES) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) emit(match.index, match.index + match[0].length, rule, undefined, match[0]);
  }
  ASSIGNMENT.lastIndex = 0;
  for (const match of text.matchAll(ASSIGNMENT)) {
    const [, name, quote, quoted, bare] = match;
    if (!credentialName(name)) continue;
    const value = (quoted ?? bare).trim();
    // The assignment heuristic targets long hex/base64-like literals, not prose,
    // configuration identifiers or source expressions. Exact env matches and
    // recognizable prefixes above are checked independently at every length.
    if (!/^(?:0x)?[a-fA-F0-9]{32,}$/.test(value) && !/^[A-Za-z0-9+/_=-]{32,}$/.test(value)) continue;
    // A leading slash is valid base64, not sufficient evidence of a reference.
    const afterValue = text[match.index + match[0].length];
    const declarationReference = /\b(?:const|let|var)\s+$/.test(text.slice(Math.max(0, match.index - 24), match.index)) && /^[A-Za-z_$][\w$.]*$/.test(value);
    if (!quote && (afterValue === '(' || afterValue === '[' || declarationReference || /^(?:process\.|import\.|env\.|\$\{|<)/.test(value) || /^(?:true|false|null|undefined)$/.test(value))) continue;
    if (quote && /^(?:\$\{[^}]+\}|process\.env\.[A-Z_]+)$/.test(value)) continue;
    const publicField = /^(?:public[_.-]?key|owner[_.-]?address|wallet[_.-]?address|blob[_.-]?id|transaction[_.-]?digest)$/i.test(name);
    emit(match.index, match.index + match[0].length, 'assigned-credential-literal', undefined, value, publicField);
  }
  for (const pattern of [PHONE, CONTEXT_PHONE]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[1] ?? match[0];
      const digits = value.replace(/\D/g, '');
      const minimum = pattern === CONTEXT_PHONE ? 7 : value.startsWith('+') ? 8 : 10;
      if (digits.length < minimum || digits.length > 15 || /^(\d)\1+$/.test(digits)) continue;
      if (/^(?:19|20)\d{2}[- .]\d{1,2}[- .]\d{1,2}$/.test(value)) continue;
      emit(match.index, match.index + match[0].length, 'pii-phone');
    }
  }
}

function createReporter(credentials) {
  const findings = [], errors = [], seen = new Set(), redactions = new Map();
  let overflow = false;
  function safe(value, kind = 'location') {
    if (typeof value !== 'string') return value;
    let sensitive = /[\u0000-\u001f\u007f]/.test(value) || value.length > 2048;
    // No allowlist on output: a path containing public-looking credential/PII text is redacted too.
    matches(value, credentials, () => { sensitive = true; });
    if (!sensitive) return value;
    const key = `${kind}\0${value}`;
    if (!redactions.has(key)) redactions.set(key, `[redacted ${kind} ${redactions.size + 1}]`);
    return redactions.get(key);
  }
  function location(value) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'string' && !['scope', 'section'].includes(key) ? safe(item, key) : item]));
  }
  return {
    findings, errors, safe,
    get overflow() { return overflow; },
    finding(rule, value, environmentVariable) {
      const entry = { rule, ...location(value), ...(environmentVariable === undefined ? {} : { environmentVariable: safe(environmentVariable, 'environment name') }) };
      const key = JSON.stringify(entry);
      if (seen.has(key)) return;
      if (findings.length >= MAX_FINDINGS) { overflow = true; return; }
      seen.add(key);
      findings.push(entry);
    },
    error(code, value = {}) {
      if (errors.length >= MAX_ERRORS) { overflow = true; return; }
      errors.push({ code, ...location(value) });
    },
  };
}

// The retained overlap covers every bounded shape and the longest environment value.
// Location anchors, raw history bytes and individual long lines are not accumulated.
class Detector {
  constructor(credentials, reporter) {
    this.credentials = credentials;
    this.reporter = reporter;
    this.overlap = Math.max(SHAPE_WINDOW, ...credentials.needles.map(entry => entry.value.length + 1));
    this.reset();
  }
  reset() { this.text = ''; this.base = 0; this.total = 0; this.anchors = []; }
  push(text, location) {
    if (!text) return;
    const previousEnd = this.total;
    this.anchors.push({ offset: previousEnd, location });
    this.total += text.length;
    this.text += text;
    matches(this.text, this.credentials, (start, end, rule, name, value, publicField) => {
      if (this.base + end <= previousEnd) return;
      const offset = this.base + start;
      let index = this.anchors.length - 1;
      while (index > 0 && this.anchors[index].offset > offset) index--;
      const location = this.anchors[index].location;
      // Single-quoted scoped npm labels are not email addresses. This syntax
      // exception is confined to lockfile keys/list items, not arbitrary text.
      if (rule === 'pii-email' && location.path === 'pnpm-lock.yaml' && scopedPackageLabel(this.text, start)) return;
      const entry = allowlisted(rule, value, location, publicField);
      if (entry) allowlistUses.set(entry.id, (allowlistUses.get(entry.id) ?? 0) + 1);
      else this.reporter.finding(rule, location, name);
    });
    const trim = Math.max(0, this.text.length - this.overlap);
    if (!trim) return;
    this.text = this.text.slice(trim);
    this.base += trim;
    let keep = 0;
    while (keep + 1 < this.anchors.length && this.anchors[keep + 1].offset <= this.base) keep++;
    this.anchors.splice(0, keep);
  }
}

async function* textPieces(readable) {
  const decoder = new StringDecoder('utf8');
  let pending = '', line = 1, first = true;
  function* drain(final) {
    while (pending.length) {
      const end = pending.indexOf('\n');
      if (end >= 0 && end < PIECE_SIZE) {
        yield { text: pending.slice(0, end), line, first, newline: true };
        pending = pending.slice(end + 1); line++; first = true;
      } else if (pending.length >= PIECE_SIZE) {
        yield { text: pending.slice(0, PIECE_SIZE), line, first, newline: false };
        pending = pending.slice(PIECE_SIZE); first = false;
      } else if (final) {
        yield { text: pending, line, first, newline: false };
        pending = '';
      } else break;
    }
  }
  for await (const chunk of readable) { pending += decoder.write(chunk); yield* drain(false); }
  pending += decoder.end();
  yield* drain(true);
}

function gitProcess(cwd, args) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '' };
  for (const name of Object.keys(env)) if (name.startsWith('GIT_TRACE')) delete env[name];
  const child = spawn('git', ['--no-pager', '--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=true', '-c', 'protocol.allow=never', ...args], { cwd, env, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const finished = new Promise(resolveResult => {
    child.once('error', () => resolveResult(false));
    child.once('close', (code, signal) => resolveResult(code === 0 && signal === null));
  });
  return { child, finished };
}

async function gitRead(cwd, args, consume) {
  const { child, finished } = gitProcess(cwd, args);
  try { await consume(child.stdout); }
  catch { child.stdout?.destroy(); child.kill(); await finished; return false; }
  return await finished;
}

async function gitFact(cwd, args) {
  let value = '';
  const ok = await gitRead(cwd, args, async stdout => {
    const decoder = new StringDecoder('utf8');
    for await (const chunk of stdout) {
      value += decoder.write(chunk);
      if (value.length > PIECE_SIZE) throw Error('GIT_FACT_TOO_LARGE');
    }
    value += decoder.end();
  });
  if (!ok) throw Error('GIT_FACT_FAILED');
  return value.endsWith('\n') ? value.slice(0, -1) : value;
}

function decodeGitPath(value) {
  if (!value.startsWith('"')) return value;
  const bytes = [];
  const escapes = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '\\': 92, '"': 34 };
  for (let index = 1; index < value.length; index++) {
    const character = value[index];
    if (character === '"') break;
    if (character !== '\\') { bytes.push(...Buffer.from(character)); continue; }
    const escaped = value[++index];
    if (/[0-7]/.test(escaped ?? '')) {
      const octal = /^[0-7]{1,3}/.exec(value.slice(index))[0];
      bytes.push(parseInt(octal, 8)); index += octal.length - 1;
    } else if (Object.hasOwn(escapes, escaped)) bytes.push(escapes[escaped]);
    else throw Error('INVALID_GIT_PATH');
  }
  return Buffer.from(bytes).toString('utf8');
}
function patchPath(value) {
  const decoded = decodeGitPath(value);
  return decoded === '/dev/null' ? null : decoded.replace(/^[ab]\//, '');
}
function diffPath(text) {
  const value = text.slice('diff --git '.length);
  if (value.startsWith('"')) {
    const first = /^"(?:[^"\\]|\\.)*"/.exec(value);
    if (first) return patchPath(first[0]);
  }
  let index = value.indexOf(' b/');
  while (index !== -1) {
    if (value.slice(2, index) === value.slice(index + 3)) return value.slice(2, index);
    index = value.indexOf(' b/', index + 1);
  }
  return null;
}

async function scanHistory(root, credentials, reporter, counts) {
  const metadata = new Detector(credentials, reporter);
  const oldContent = new Detector(credentials, reporter);
  const newContent = new Detector(credentials, reporter);
  let commit = null, previousCommit = null, oldPath = null, newPath = null;
  let inDiff = false, inHunk = false, oldLine = 0, newLine = 0, routes = [];
  const ok = await gitRead(root, ['log', '-p', '--all', '--full-history', '--root', '-m', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color', '--no-decorate', '--text', '--full-index', '--pretty=raw', '--show-notes=*', '--'], async stdout => {
    for await (const piece of textPieces(stdout)) {
      let text = piece.text;
      if (piece.first) {
        counts.historyLines++;
        const header = /^commit ([a-f0-9]{40,64})(?: \(from [a-f0-9]{40,64}\))?$/.exec(text);
        if (header) {
          commit = header[1];
          if (commit !== previousCommit) counts.historyCommits++;
          previousCommit = commit;
          inDiff = false; inHunk = false; oldPath = null; newPath = null;
          metadata.reset(); oldContent.reset(); newContent.reset();
        }
        const base = { scope: 'history', commit, historyLine: piece.line };
        routes = [];
        if (text.startsWith('diff --git ')) {
          inDiff = true; inHunk = false;
          oldPath = diffPath(text); newPath = oldPath;
          metadata.reset(); oldContent.reset(); newContent.reset();
        } else if (inDiff && text.startsWith('@@ ')) {
          const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
          if (!hunk) throw Error('INVALID_PATCH_HUNK');
          oldLine = Number(hunk[1]); newLine = Number(hunk[2]); inHunk = true;
          oldContent.reset(); newContent.reset();
        } else if (inHunk && /^[ +\-]/.test(text)) {
          const prefix = text[0];
          if (prefix !== '+') routes.push({ detector: oldContent, location: { ...base, path: oldPath, line: oldLine++, section: prefix === '-' ? 'removed' : 'context-old' } });
          if (prefix !== '-') routes.push({ detector: newContent, location: { ...base, path: newPath, line: newLine++, section: prefix === '+' ? 'added' : 'context-new' } });
          text = text.slice(1);
        } else if (inDiff && text.startsWith('--- ')) oldPath = patchPath(text.slice(4));
        else if (inDiff && text.startsWith('+++ ')) newPath = patchPath(text.slice(4));
        if (!routes.length) {
          routes = [{ detector: metadata, location: { ...base, ...(inDiff ? { path: newPath ?? oldPath } : {}), section: inDiff ? 'file-metadata' : 'commit-metadata' } }];
          // Raw pretty-format indents commit-message lines; reconstruct multiline values.
          if (!inDiff && text.startsWith('    ')) text = text.slice(4);
        }
      }
      for (const route of routes) route.detector.push(text + (piece.newline ? '\n' : ''), route.location);
    }
  });
  if (!ok) reporter.error('GIT_HISTORY_INCOMPLETE');
  return ok;
}

async function scanRefs(root, credentials, reporter, counts) {
  const refs = [];
  let valid = true;
  const ok = await gitRead(root, ['for-each-ref', '--format=%(objectname) %(objecttype) %(refname)'], async stdout => {
    for await (const piece of textPieces(stdout)) {
      if (!piece.first || !piece.newline) throw Error('INVALID_REF_RECORD');
      const match = /^([a-f0-9]{40,64}) (commit|tag|blob|tree) (refs\/[^\s]+)$/.exec(piece.text);
      if (!match) throw Error('INVALID_REF_RECORD');
      const [, object, type, ref] = match;
      counts.localRefs++;
      const detector = new Detector(credentials, reporter);
      detector.push(ref, { scope: 'history', object, ref, section: 'ref-name' });
      if (type !== 'commit') refs.push({ object, type, ref });
    }
  });
  if (!ok) { reporter.error('GIT_REF_ENUMERATION_INCOMPLETE'); valid = false; }
  const scanned = new Set();
  for (let index = 0; index < refs.length; index++) {
    const { object, type, ref } = refs[index];
    if (scanned.has(object)) continue;
    scanned.add(object);
    if (type === 'tree') { reporter.error('NON_COMMIT_TREE_REF_NOT_SCANNED', { scope: 'history', object, ref }); valid = false; continue; }
    const detector = new Detector(credentials, reporter);
    let target = null, targetType = null;
    const complete = await gitRead(root, ['cat-file', type, object], async stdout => {
      for await (const piece of textPieces(stdout)) {
        if (type === 'tag' && piece.first && piece.line <= 2) {
          target = /^object ([a-f0-9]{40,64})$/.exec(piece.text)?.[1] ?? target;
          targetType = /^type (tag|blob|tree|commit)$/.exec(piece.text)?.[1] ?? targetType;
        }
        detector.push(piece.text + (piece.newline ? '\n' : ''), { scope: 'history', object, ref, line: piece.line, section: type === 'tag' ? 'tag-metadata' : 'ref-blob' });
      }
    });
    if (!complete) { reporter.error('GIT_REF_OBJECT_INCOMPLETE', { scope: 'history', object, ref }); valid = false; }
    if (type === 'tag') {
      counts.annotatedTags++;
      if (!target || !targetType) { reporter.error('GIT_TAG_TARGET_UNREADABLE', { scope: 'history', object, ref }); valid = false; }
      else if (targetType !== 'commit') refs.push({ object: target, type: targetType, ref });
    }
  }
  return valid;
}

async function existingOutputIdentity(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw Error('REPORT_NOT_REGULAR_FILE');
    return `${info.dev}:${info.ino}`;
  } catch (error) { if (error?.code === 'ENOENT') return null; throw Error('UNSAFE_REPORT_DESTINATION'); }
}

async function scanWorktree(root, outputs, credentials, reporter, counts) {
  const outputPaths = new Set(outputs.map(path => resolve(path)));
  const outputIdentities = new Set((await Promise.all(outputs.map(existingOutputIdentity))).filter(Boolean));
  let valid = true;
  const scanFile = async path => {
    const absolute = resolve(root, path);
    const fromRoot = relative(root, absolute);
    if (isAbsolute(path) || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
      reporter.error('PATH_OUTSIDE_WORKTREE', { scope: 'worktree', path }); valid = false; return;
    }
    if (outputPaths.has(absolute)) { counts.excludedReports++; return; }
    let info;
    try {
      await refuseSymlinkAncestors(root, fromRoot);
      info = await lstat(absolute);
    } catch (error) {
      if (error?.code === 'ENOENT') { counts.deletedTrackedFiles++; return; }
      reporter.error(error?.code === 'SYMLINKED_ANCESTOR' ? 'WORKTREE_SYMLINKED_ANCESTOR_NOT_SCANNED' : 'WORKTREE_STAT_FAILED', { scope: 'worktree', path }); valid = false; return;
    }
    if (outputIdentities.has(`${info.dev}:${info.ino}`)) { counts.excludedReports++; return; }
    const detector = new Detector(credentials, reporter);
    detector.push(path, { scope: 'worktree', path, section: 'file-name' });
    detector.reset();
    try {
      if (info.isSymbolicLink()) {
        detector.push(await readlink(absolute), { scope: 'worktree', path, line: 1, section: 'symlink-target' });
        counts.worktreeSymlinks++; return;
      }
      if (!info.isFile()) { reporter.error('WORKTREE_NON_REGULAR_ENTRY_NOT_SCANNED', { scope: 'worktree', path }); valid = false; return; }
      for await (const piece of textPieces(createReadStream(absolute))) {
        detector.push(piece.text + (piece.newline ? '\n' : ''), { scope: 'worktree', path, line: piece.line, section: 'file-content' });
      }
      counts.worktreeFiles++;
    } catch { reporter.error('WORKTREE_READ_FAILED', { scope: 'worktree', path }); valid = false; }
  };
  const ok = await gitRead(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--'], async stdout => {
    let pending = Buffer.alloc(0);
    for await (const chunk of stdout) {
      pending = Buffer.concat([pending, chunk]);
      let end;
      while ((end = pending.indexOf(0)) !== -1) {
        const bytes = pending.subarray(0, end);
        const path = bytes.toString('utf8');
        if (!Buffer.from(path).equals(bytes)) throw Error('NON_UTF8_PATH_UNSUPPORTED');
        pending = pending.subarray(end + 1);
        await scanFile(path);
      }
      if (pending.length > PIECE_SIZE) throw Error('GIT_PATH_TOO_LARGE');
    }
    if (pending.length) throw Error('UNTERMINATED_GIT_PATH');
  });
  if (!ok) { reporter.error('GIT_WORKTREE_ENUMERATION_INCOMPLETE'); valid = false; }
  return valid;
}

const LIMITATIONS = [
  'Offline heuristic review, not proof of absence. Unknown credential formats, obfuscated/encoded/encrypted values and Unicode/obfuscated PII can escape shape detection.',
  'Exact matching covers credential-like environment names and credentials embedded in environment URLs, including JSON-escaped variants. Unset environment credentials cannot be compared. Short/shared current values can cause false positives.',
  'History includes all locally reachable commits with root and per-parent merge patches, removed/context lines, raw author/committer/message metadata, notes, ref names and annotated tags. No history path exclusions; old reports remain in scope.',
  'Reflog-only/dangling objects, remote refs not present locally, Git LFS payloads, archive contents and submodule repositories are not traversed. Missing objects, shallow history, unsupported tree refs and encountered submodule entries make the result incomplete.',
  'Worktree uses git ls-files --cached --others --exclude-standard. Gitignore excludes untracked files only; tracked ignored files are scanned. Ignored untracked credential files, node_modules and generated dist are outside this source-worktree scope.',
  'Only the two selected generated report files and existing hard-link aliases are excluded from worktree content to prevent recursion. Their previous Git history is never excluded.',
  'Symlink link text is scanned without following it. A tracked path with a symlinked ancestor is refused and makes worktree coverage incomplete; it is never opened through that ancestor. UTF-8 plaintext in binary files is scanned, but arbitrary binary encodings and non-UTF-8 path names are not supported; unsupported path names make the scan incomplete.',
  'No content snapshot is taken: do not edit files or refs during a scan. Findings are deduplicated per rule/environment/location, not per secret. Shape windows are bounded; extremely long shaped literals still require human review.',
  'The committed scripts/secret-scan-allowlist.json permits only exact value/rule/path exceptions with per-entry justification: synthetic fixture credentials, public on-chain identifiers in public fields, GitHub noreply identities and organizer emails with a published HTTPS source. No exact environment match, phone number or absolute home path is waivable. The allowlist file itself remains scanned. Single-quoted scoped npm package labels in pnpm-lock.yaml keys/list items are syntax, not emails.',
  'Finding/error storage is capped; overflow makes the result incomplete (exit 2), never clean. History and worktree content are streamed with bounded overlap rather than buffered in full.',
];

function markdown(report) {
  const cell = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replaceAll('`', '&#96;').replaceAll('\n', ' ');
  const lines = [
    '# Secret and PII scan', '',
    `- Status: **${report.status}**; exit code: **${report.exitCode}**.`,
    `- Generated: ${report.generatedAt}.`,
    `- Findings: ${report.findings.length}; incomplete conditions: ${report.errors.length}.`,
    `- Credential environment names considered: ${report.credentialEnvironmentNames.length}. Values are compared in memory only, never reported.`,
    '- No provider calls, credential-file reads, Git modifications or history rewrites are performed.',
    '- JSON: selected job directory / secret-scan.json. This report and that JSON are excluded from worktree content only, never from history.',
    '- Usage: `node scripts/secret-scan.mjs [--job-dir DIRECTORY]`.',
    '- Job directory precedence: `--job-dir`, `OMP_JOB_DIR`, then `<OS temporary directory>/recallledger-secret-scan` (works without job environment variables).',
    '', '## Scope and counts', '',
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}.`),
    '', '## Findings (no matched content)', '',
    '| Rule | Environment name | Scope | Commit/object | File/ref | Line | Section | History stream line |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.findings.map(item => `| ${cell(item.rule)} | ${cell(item.environmentVariable)} | ${cell(item.scope)} | ${cell(item.commit ?? item.object)} | ${cell(item.path ?? item.ref ?? '(metadata)')} | ${cell(item.line)} | ${cell(item.section)} | ${cell(item.historyLine)} |`),
  ];
  if (!report.findings.length) lines.push('', 'No findings were recorded; a clean verdict requires complete scan coverage.');
  lines.push('', '## Incomplete conditions', '');
  if (!report.errors.length) lines.push('None recorded.');
  else for (const error of report.errors) lines.push(`- ${cell(error.code)}${error.path || error.ref ? ` — ${cell(error.path ?? error.ref)}` : ''}${error.commit || error.object ? ` — ${cell(error.commit ?? error.object)}` : ''}.`);
  lines.push('', '## Credential environment names', '', ...report.credentialEnvironmentNames.map(name => `- ${cell(name)}`));
  if (!report.credentialEnvironmentNames.length) lines.push('None available; credential-shape and PII detection still ran.');
  lines.push('', '## Exact scoped allowlist', '', 'Values are omitted. Each exception is loaded from scripts/secret-scan-allowlist.json and constrained by its rule, exact paths and optional sections. Current environment matches always remain findings. See scripts/SECRET_SCAN.md for the format and review requirements.', '');
  for (const entry of report.allowlist) lines.push(`- ${cell(entry.id)} (${cell(entry.kind)}, ${cell(entry.rule)}): ${cell(entry.reason)} Applicable matches: ${entry.matches}.`);
  lines.push('', '## Interpretation and limitations', '', ...report.limitations.map(item => `- ${item}`), '', 'If a finding is a real current credential leak, stop publication and have the owner rotate/revoke it. Do not rewrite history or treat an incomplete scan as clearance.', '');
  return lines.join('\n');
}

async function publish(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await existingOutputIdentity(path);
  const temporary = join(dirname(path), `.secret-scan-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(temporary, path);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

async function main() {
  let selectedJob;
  for (let index = 2; index < process.argv.length; index++) {
    const argument = process.argv[index];
    if (argument === '--help' && process.argv.length === 3) { process.stdout.write(HELP); return; }
    if (argument === '--job-dir' && selectedJob === undefined && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) selectedJob = process.argv[++index];
    else if (argument.startsWith('--job-dir=') && selectedJob === undefined && argument.length > '--job-dir='.length) selectedJob = argument.slice('--job-dir='.length);
    else throw Error('INVALID_ARGUMENTS');
  }
  const credentials = environmentCredentials();
  const reporter = createReporter(credentials);
  const root = await realpath(await gitFact(process.cwd(), ['rev-parse', '--show-toplevel']));
  const jobDir = resolve(selectedJob ?? process.env.OMP_JOB_DIR ?? DEFAULT_JOB_DIR);
  const jsonPath = join(jobDir, 'secret-scan.json');
  const markdownPath = join(root, 'submission', 'SECRET_SCAN.md');
  const counts = { historyCommits: 0, historyLines: 0, localRefs: 0, annotatedTags: 0, worktreeFiles: 0, worktreeSymlinks: 0, deletedTrackedFiles: 0, excludedReports: 0 };
  const allowlistComplete = await loadAllowlist(root, reporter);
  let shallow = true;
  try { shallow = await gitFact(root, ['rev-parse', '--is-shallow-repository']) !== 'false'; }
  catch { reporter.error('SHALLOW_STATUS_UNAVAILABLE'); }
  if (shallow) reporter.error('SHALLOW_HISTORY_NOT_COMPLETE');
  const historyComplete = await scanHistory(root, credentials, reporter, counts);
  const refsComplete = await scanRefs(root, credentials, reporter, counts);
  let worktreeComplete = false;
  try { worktreeComplete = await scanWorktree(root, [jsonPath, markdownPath], credentials, reporter, counts); }
  catch { reporter.error('WORKTREE_OR_REPORT_DESTINATION_UNAVAILABLE'); }
  if (reporter.overflow) reporter.error('FINDING_OR_ERROR_CAP_EXCEEDED');
  const incomplete = !allowlistComplete || shallow || !historyComplete || !refsComplete || !worktreeComplete || reporter.errors.length > 0 || reporter.overflow;
  const exitCode = incomplete ? 2 : reporter.findings.length ? 1 : 0;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: incomplete ? 'INCOMPLETE' : reporter.findings.length ? 'FINDINGS' : 'CLEAN',
    exitCode,
    completeness: { history: historyComplete && !shallow, refs: refsComplete, worktree: worktreeComplete, allowlist: allowlistComplete, overflow: reporter.overflow },
    counts,
    credentialEnvironmentNames: credentials.names.map(name => reporter.safe(name, 'environment name')),
    findings: reporter.findings,
    errors: reporter.errors,
    allowlist: allowlistEntries.map(({ id, kind, rule, reason }) => ({ id: reporter.safe(id, 'allowlist id'), kind, rule, reason: reporter.safe(reason, 'allowlist reason'), matches: allowlistUses.get(id) ?? 0 })),
    limitations: LIMITATIONS,
  };
  await publish(jsonPath, JSON.stringify(report, null, 2) + '\n');
  await publish(markdownPath, markdown(report));
  process.stdout.write(`SECRET_SCAN_${report.status}: ${report.findings.length} finding(s), ${report.errors.length} incomplete condition(s). Reports: submission/SECRET_SCAN.md and selected job secret-scan.json.\n`);
  process.exitCode = exitCode;
}

// Error messages and stacks can contain credentials, paths, Git metadata or source.
// All failures therefore have a constant terminal representation.
main().catch(() => {
  process.stderr.write('SECRET_SCAN_INCOMPLETE: invalid invocation, unavailable local Git data, or report publication failure. No error payload is printed.\n');
  process.exitCode = 2;
});
