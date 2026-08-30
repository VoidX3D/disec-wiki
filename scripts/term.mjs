#!/usr/bin/env node
/**
 * Minimal terminal UI helpers for DISEC wiki scripts (no dependencies).
 * Colours, spinners, progress bars, section headers and a summary table.
 */
const USE_COLOR = process.stderr.isTTY && !process.env.NO_COLOR;

const code = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
};

export function c(text, name) {
  if (!USE_COLOR || !code[name]) return text;
  return `${code[name]}${text}${code.reset}`;
}

export function paint(text, name) {
  return c(text, name);
}

export const fmt = {
  ok: (t) => c(t, 'green'),
  fail: (t) => c(t, 'red'),
  warn: (t) => c(t, 'yellow'),
  dim: (t) => c(t, 'gray'),
  bold: (t) => c(t, 'bold'),
  info: (t) => c(t, 'cyan'),
  label: (t) => c(t, 'magenta'),
};

export function section(title) {
  const line = '─'.repeat(Math.max(20, process.stderr.columns ? process.stderr.columns - 1 : 60));
  process.stderr.write(`\n${fmt.bold(title)}\n${c(line, 'gray')}\n`);
}

export function logStatus(symbol, color, text, detail = '') {
  const pad = detail ? `${fmt.dim('·')} ${fmt.dim(detail)}` : '';
  process.stderr.write(`  ${c(symbol, color)} ${text}${pad ? ' ' + pad : ''}\n`);
}

export const status = {
  ok: (text, detail) => logStatus('✓', 'green', fmt.ok(text), detail),
  fail: (text, detail) => logStatus('✗', 'red', fmt.fail(text), detail),
  skip: (text, detail) => logStatus('·', 'gray', fmt.dim(text), detail),
  warn: (text, detail) => logStatus('!', 'yellow', fmt.warn(text), detail),
  info: (text, detail) => logStatus('•', 'cyan', fmt.info(text), detail),
};

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Render an inline progress line. Call with (done, total, label). The line is
 * redrawn on each call (only when stderr is a TTY). Returns a function that
 * clears the line; pass `null` to finalise.
 */
export function progress(done, total, label = '') {
  if (!process.stderr.isTTY) {
    if (done === total) process.stderr.write(`\n`);
    return;
  }
  const cols = process.stderr.columns || 80;
  const barW = 24;
  const pct = total > 0 ? done / total : 1;
  const filled = Math.round(barW * pct);
  const bar = `[${'█'.repeat(filled)}${'░'.repeat(barW - filled)}]`;
  const spin = SPIN[Math.floor(Date.now() / 120) % SPIN.length];
  const pctTxt = `${Math.round(pct * 100)}%`.padStart(4);
  const labelTxt = label.slice(0, Math.max(10, cols - barW - 18));
  const line = `  ${c(spin, 'cyan')} ${bar} ${c(pctTxt, 'bold')} ${fmt.dim(labelTxt)}`;
  process.stderr.write(`\r${line}`);
  if (done === total) process.stderr.write(`\x1b[2K\r`);
}

/** ASCII bar that always prints one line per tick (non-TTY safe). */
export function progressLine(done, total, label = '') {
  const barW = 22;
  const pct = total > 0 ? done / total : 1;
  const filled = Math.round(barW * pct);
  const bar = `[${'█'.repeat(filled)}${'░'.repeat(barW - filled)}]`;
  const pctTxt = `${Math.round(pct * 100)}%`.padStart(4);
  process.stderr.write(`  ${bar} ${c(pctTxt, 'bold')} ${fmt.dim(label)}\n`);
}

/** Print a compact summary table of per-category counts. */
export function summaryTable(rows) {
  if (!rows.length) return;
  const nameW = Math.max(...rows.map(r => r.name.length)) + 2;
  const head = `  ${'CATEGORY'.padEnd(nameW)}  ${'OK'.padStart(4)}  ${'FAIL'.padStart(4)}  ${'TOTAL'.padStart(5)}`;
  process.stderr.write(`\n${c('─'.repeat(50), 'gray')}\n${fmt.bold(head)}\n${c('─'.repeat(50), 'gray')}\n`);
  let tOk = 0;
  let tFail = 0;
  for (const r of rows) {
    tOk += r.ok;
    tFail += r.fail;
    const okS = r.ok ? fmt.ok(String(r.ok).padStart(4)) : ' '.padStart(4);
    const failS = r.fail ? fmt.fail(String(r.fail).padStart(4)) : ' '.padStart(4);
    process.stderr.write(`  ${r.name.padEnd(nameW)}  ${okS}  ${failS}  ${String(r.ok + r.fail).padStart(5)}\n`);
  }
  process.stderr.write(`${c('─'.repeat(50), 'gray')}\n`);
  const okS = fmt.ok(String(tOk).padStart(4));
  const failS = tFail ? fmt.fail(String(tFail).padStart(4)) : String(tFail).padStart(4);
  process.stderr.write(`  ${fmt.bold('TOTAL').padEnd(nameW)}  ${okS}  ${failS}  ${String(tOk + tFail).padStart(5)}\n`);
  return { ok: tOk, fail: tFail };
}
