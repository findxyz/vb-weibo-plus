import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(frontendDir, 'src');

const violations = [];

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function moduleArea(filePath) {
  return path.relative(srcDir, filePath).split(path.sep)[0];
}

const REGEX_PREV_KEYWORDS = new Set([
  'return',
  'case',
  'throw',
  'in',
  'of',
  'typeof',
  'void',
  'delete',
  'new',
  'else',
  'do',
  'yield',
  'await',
]);

function canStartRegex(prevKind, prevWord) {
  if (prevKind === 'start' || prevKind === 'punct') return true;
  if (prevKind === 'word' && REGEX_PREV_KEYWORDS.has(prevWord)) return true;
  return false;
}

function scanJs(code) {
  const comments = [];
  let cleaned = '';
  let i = 0;
  let line = 1;
  let prevKind = 'start';
  let prevWord = '';

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '\n') {
      cleaned += '\n';
      line += 1;
      i += 1;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      cleaned += ch;
      i += 1;
      continue;
    }

    if (
      ch === '/' &&
      next === '/' &&
      !(i >= 2 && code[i - 1] === ':' && /[A-Za-z]/.test(code[i - 2]))
    ) {
      const commentLine = line;
      let body = '';
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        body += code[i];
        i += 1;
      }
      if (!body.trimStart().startsWith('biome-ignore ')) {
        comments.push(commentLine);
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      const commentLine = line;
      comments.push(commentLine);
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') {
          cleaned += '\n';
          line += 1;
        }
        i += 1;
      }
      i += 2;
      continue;
    }

    if (ch === '/' && canStartRegex(prevKind, prevWord)) {
      cleaned += ch;
      i += 1;
      let inClass = false;
      while (i < code.length && code[i] !== '\n') {
        const c = code[i];
        cleaned += c;
        if (c === '\\' && i + 1 < code.length) {
          i += 1;
          cleaned += code[i];
        } else if (c === '[') {
          inClass = true;
        } else if (c === ']') {
          inClass = false;
        } else if (c === '/' && !inClass) {
          i += 1;
          break;
        }
        i += 1;
      }
      while (i < code.length && /[a-z]/i.test(code[i])) {
        cleaned += code[i];
        i += 1;
      }
      prevKind = 'expr';
      prevWord = '';
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      cleaned += ch;
      i += 1;
      while (i < code.length) {
        const c = code[i];
        cleaned += c;
        if (c === '\n') line += 1;
        if (c === '\\' && i + 1 < code.length) {
          i += 1;
          cleaned += code[i];
          if (code[i] === '\n') line += 1;
        } else if (c === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      prevKind = 'expr';
      prevWord = '';
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let word = '';
      while (i < code.length && /[A-Za-z0-9_$]/.test(code[i])) {
        word += code[i];
        cleaned += code[i];
        i += 1;
      }
      prevKind = 'word';
      prevWord = word;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      while (i < code.length && /[0-9a-fA-FxXoObBn._]/.test(code[i])) {
        cleaned += code[i];
        i += 1;
      }
      prevKind = 'expr';
      prevWord = '';
      continue;
    }

    cleaned += ch;
    prevKind = ch === ')' || ch === ']' ? 'expr' : 'punct';
    prevWord = '';
    i += 1;
  }

  return { cleaned, comments };
}

function findCssComments(css) {
  const comments = [];
  let i = 0;
  let line = 1;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '\n') {
      line += 1;
      i += 1;
    } else if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      while (i < css.length) {
        if (css[i] === '\n') line += 1;
        if (css[i] === '\\' && i + 1 < css.length) {
          i += 2;
        } else if (css[i] === quote) {
          i += 1;
          break;
        } else {
          i += 1;
        }
      }
    } else if (ch === '/' && css[i + 1] === '*') {
      comments.push(line);
      i += 2;
      while (i < css.length && !(css[i] === '*' && css[i + 1] === '/')) {
        if (css[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
    } else {
      i += 1;
    }
  }
  return comments;
}

const IMPORT_RE =
  /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectSpecifiers(cleaned) {
  const specifiers = [];
  for (const match of cleaned.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

const forbiddenTargets = {
  shared: new Set(['chat', 'post']),
  chat: new Set(['post']),
  post: new Set(['chat']),
};

for (const file of walk(srcDir)) {
  const rel = path.relative(frontendDir, file).replaceAll('\\', '/');
  const ext = path.extname(file);

  if (ext === '.js' || ext === '.jsx') {
    violations.push(`${rel}: JavaScript source files are not allowed under src/; use .ts or .tsx`);
    continue;
  }

  if (ext === '.css') {
    const css = fs.readFileSync(file, 'utf8');
    for (const commentLine of findCssComments(css)) {
      violations.push(`${rel}:${commentLine}: comments are not allowed in frontend production CSS`);
    }
    continue;
  }

  if (ext !== '.ts' && ext !== '.tsx') {
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  const { cleaned, comments } = scanJs(content);
  for (const commentLine of comments) {
    violations.push(
      `${rel}:${commentLine}: comments are not allowed in frontend production sources (only "// biome-ignore ..." directives are permitted)`,
    );
  }

  const area = moduleArea(file);
  const blocked = forbiddenTargets[area];
  if (!blocked) {
    continue;
  }

  for (const specifier of collectSpecifiers(cleaned)) {
    if (!specifier.startsWith('.')) {
      continue;
    }
    const target = path.resolve(path.dirname(file), specifier);
    const targetArea = moduleArea(target);
    if (blocked.has(targetArea)) {
      violations.push(
        `${rel}: module in "${area}" must not import "${specifier}" (belongs to "${targetArea}")`,
      );
    }
  }
}

for (const cssRel of ['src/chat/chat.css', 'src/post/post.css']) {
  const cssPath = path.join(frontendDir, cssRel);
  const css = fs.readFileSync(cssPath, 'utf8');
  const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((m) => m[1]));
  for (const token of used) {
    if (!defined.has(token)) {
      violations.push(
        `${cssRel}: uses undefined CSS token "${token}" (each skin stylesheet must stay self-contained)`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Frontend boundary check failed:\n' + violations.map((v) => `  - ${v}`).join('\n'));
  process.exit(1);
}
