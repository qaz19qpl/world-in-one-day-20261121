// The World in One Day — Saturday 21 November 2026.
// A code-drawn news poster: 1024x1024 PNG, six stories, zero network, zero clock,
// zero randomness. Pure Node standard library. Run twice, get the same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Layout: navy masthead with globe, then six panels (2 columns x 3 rows), each
// with a kicker, a headline, a short body and a fact strip; sources in the footer.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- canvas ----

const W = 1024;
const H = 1024;
const fb = new Uint8Array(W * H * 3); // RGB framebuffer

type RGB = [number, number, number];

const PAPER: RGB = [247, 243, 234];
const INK: RGB = [20, 33, 61];
const WHITE: RGB = [255, 255, 255];
const AMBER: RGB = [217, 142, 0];
const LINE: RGB = [216, 210, 196];
const BODY: RGB = [52, 58, 74];

function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) px(xx, yy, c);
  }
}

function hline(x0: number, x1: number, y: number, c: RGB): void {
  for (let x = x0; x <= x1; x++) px(x, y, c);
}

function vline(x: number, y0: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) px(x, y, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// Filled disc by scanlines (integer math, deterministic).
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) px(cx + x, cy + y, c);
  }
}

// Ring: outline of a circle, 2 px thick.
function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 1) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(cx + r * Math.cos(t));
    const y = Math.round(cy + r * Math.sin(t));
    px(x, y, c); px(x + 1, y, c); px(x, y + 1, c);
  }
}

// Ellipse arc (degrees), drawn as plotted points.
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, c: RGB): void {
  for (let a = a0; a <= a1; a += 2) {
    const t = (a * Math.PI) / 180;
    px(Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t)), c);
  }
}

// Filled triangle (scanline fill between edges).
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.ceil(Math.min(...xs));
      const hi = Math.floor(Math.max(...xs));
      for (let x = lo; x <= hi; x++) px(x, y, c);
    }
  }
}

// ------------------------------------------------------- 5x7 bitmap font ----
// Each glyph: 7 rows, 5 bits each (bit 4 = leftmost pixel). Uppercase only;
// text is uppercased before drawing.

const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
};

const FONT2: Record<string, number[]> = {
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ';': [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '%': [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
  '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  '=': [0, 0, 0x1f, 0, 0x1f, 0, 0],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
};

const GLYPHS: Record<string, number[]> = { ...FONT, ...FONT2 };

function glyph(ch: string): number[] {
  return GLYPHS[ch] ?? GLYPHS['?'];
}

// Advance of one character at a scale, in pixels.
function adv(scale: number): number {
  return 6 * scale;
}

function textWidth(text: string, scale: number): number {
  const t = text.toUpperCase();
  return t.length === 0 ? 0 : t.length * adv(scale) - scale;
}

function drawText(x: number, y: number, scale: number, text: string, c: RGB): void {
  const t = text.toUpperCase();
  let cx = x;
  for (const ch of t) {
    const g = glyph(ch);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if ((g[row] >> (4 - col)) & 1) {
          rect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += adv(scale);
  }
}

// Greedy word wrap to a pixel width; returns lines (already uppercased).
function wrap(text: string, maxW: number, scale: number): string[] {
  const words = text.toUpperCase().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur === '' ? w : cur + ' ' + w;
    if (textWidth(next, scale) <= maxW || cur === '') {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function drawLines(x: number, y: number, scale: number, lh: number, lines: string[], c: RGB): void {
  lines.forEach((ln, i) => drawText(x, y + i * lh, scale, ln, c));
}

// Tint: mix a color toward white by f (0..1).
function tint(c: RGB, f: number): RGB {
  return [
    Math.round(c[0] + (255 - c[0]) * f),
    Math.round(c[1] + (255 - c[1]) * f),
    Math.round(c[2] + (255 - c[2]) * f),
  ];
}

// ------------------------------------------------------------ PNG writer ----

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ----------------------------------------------------------------- icons ----
// Each icon draws inside a 72x72 box at (ox, oy) in the accent color.

function iconGlobe(ox: number, oy: number, c: RGB): void {
  const cx = ox + 36;
  const cy = oy + 36;
  ring(cx, cy, 30, c);
  ring(cx, cy, 29, c);
  vline(cx, cy - 30, cy + 30, c);
  hline(cx - 30, cx + 30, cy, c);
  arc(cx, cy, 14, 30, 0, 360, c);
  arc(cx, cy, 14, 30, 0, 360, c);
  arc(cx, cy, 30, 13, 0, 360, c);
}

function iconRobot(ox: number, oy: number, c: RGB): void {
  vline(ox + 36, oy + 6, oy + 14, c);
  disc(ox + 36, oy + 6, 3, c);
  rect(ox + 14, oy + 14, 44, 34, c);
  rect(ox + 20, oy + 24, 8, 8, PAPER);
  rect(ox + 44, oy + 24, 8, 8, PAPER);
  hline(ox + 24, ox + 48, oy + 40, PAPER);
  hline(ox + 24, ox + 48, oy + 41, PAPER);
  rect(ox + 8, oy + 24, 4, 14, c);
  rect(ox + 60, oy + 24, 4, 14, c);
  rect(ox + 30, oy + 52, 12, 12, c);
}

function iconShip(ox: number, oy: number, c: RGB): void {
  vline(ox + 34, oy + 8, oy + 34, c);
  tri(ox + 34, oy + 8, ox + 34, oy + 30, ox + 52, oy + 30, c);
  rect(ox + 20, oy + 30, 14, 10, c);
  tri(ox + 10, oy + 40, ox + 62, oy + 40, ox + 54, oy + 54, c);
  tri(ox + 10, oy + 40, ox + 54, oy + 54, ox + 18, oy + 54, c);
  arc(ox + 14, oy + 60, 10, 4, 180, 360, c);
  arc(ox + 38, oy + 60, 10, 4, 180, 360, c);
}

function iconDrop(ox: number, oy: number, c: RGB): void {
  tri(ox + 36, oy + 8, ox + 18, oy + 36, ox + 54, oy + 36, c);
  disc(ox + 36, oy + 40, 18, c);
  arc(ox + 30, oy + 40, 8, 12, 90, 270, PAPER);
}

function iconBridge(ox: number, oy: number, c: RGB): void {
  rect(ox + 12, oy + 16, 6, 36, c);
  rect(ox + 54, oy + 16, 6, 36, c);
  arc(ox + 36, oy + 52, 24, 34, 180, 360, c);
  arc(ox + 36, oy + 52, 24, 30, 180, 360, c);
  hline(ox + 8, ox + 64, oy + 52, c);
  hline(ox + 8, ox + 64, oy + 53, c);
  vline(ox + 36, oy + 18, oy + 52, c);
  line(ox + 15, oy + 20, ox + 36, oy + 50, c);
  line(ox + 57, oy + 20, ox + 36, oy + 50, c);
}

function iconShield(ox: number, oy: number, c: RGB): void {
  tri(ox + 14, oy + 12, ox + 58, oy + 12, ox + 58, oy + 34, c);
  tri(ox + 14, oy + 12, ox + 58, oy + 34, ox + 14, oy + 34, c);
  tri(ox + 14, oy + 34, ox + 58, oy + 34, ox + 36, oy + 62, c);
  line(ox + 24, oy + 32, ox + 33, oy + 42, PAPER);
  line(ox + 33, oy + 42, ox + 50, oy + 22, PAPER);
  line(ox + 24, oy + 33, ox + 33, oy + 43, PAPER);
  line(ox + 33, oy + 43, ox + 50, oy + 23, PAPER);
}

// ---------------------------------------------------------------- panels ----

interface Panel {
  kicker: string;
  head: string[];
  body: string;
  fact: string[];
  accent: RGB;
  icon: (ox: number, oy: number, c: RGB) => void;
}

const TEAL: RGB = [14, 124, 123];
const BLUE: RGB = [29, 78, 137];
const RED: RGB = [193, 39, 45];
const GOLD: RGB = [190, 120, 0];
const PURPLE: RGB = [106, 76, 147];
const SLATE: RGB = [69, 90, 100];

const PANELS: Panel[] = [
  {
    kicker: 'CLIMATE - ANTALYA, TURKIYE',
    head: ['COP31 TALKS STALL', 'IN OVERTIME'],
    body: 'Nearly 200 nations are deadlocked over fossil fuels and climate finance as the summit runs past its Friday deadline.',
    fact: ['DRAFT DROPS FOSSIL FUELS', '$120BN AID TARGET CUT'],
    accent: TEAL,
    icon: iconGlobe,
  },
  {
    kicker: 'ARMS CONTROL - GENEVA',
    head: ['128 NATIONS BACK', 'KILLER-ROBOT RULES'],
    body: 'Delegates agree to work toward rules for lethal autonomous weapons, aiming for an accord by 2028. No binding limits yet.',
    fact: ['ACCORD AIMED FOR 2028', 'NO BINDING LIMITS YET'],
    accent: BLUE,
    icon: iconRobot,
  },
  {
    kicker: 'SHIPPING - GULF OF FINLAND',
    head: ['DRONES HIT', 'RUSSIA-BOUND SHIP'],
    body: 'A drone strike sets the cargo ship Sparta II on fire in the eastern Gulf of Finland. Finland alerts NATO.',
    fact: ['BOUND FOR KALININGRAD', 'FINLAND ALERTS NATO'],
    accent: RED,
    icon: iconShip,
  },
  {
    kicker: 'ENERGY - STRAIT OF HORMUZ',
    head: ['TANKERS STRUCK', 'NEAR OMAN'],
    body: 'Unidentified projectiles hit outbound tankers near Khasab, Oman, at the entrance to the Strait of Hormuz. No casualties.',
    fact: ['NEARLY A FIFTH OF', 'WORLD OIL PASSES HERE'],
    accent: GOLD,
    icon: iconDrop,
  },
  {
    kicker: 'UKRAINE - KYIV',
    head: ['ZELENSKY DEFENDS', 'BRIDGE STRIKES'],
    body: "President Zelensky calls Ukraine's strikes on the Crimean Bridge a fair response to Russian attacks on Ukrainian bridges.",
    fact: ['KYIV: 109 RUSSIAN', 'ATTACKS CAME FIRST'],
    accent: PURPLE,
    icon: iconBridge,
  },
  {
    kicker: 'CYBER - WASHINGTON',
    head: ['FBI PROBES BREACH', 'OF CRIME DATABASE'],
    body: 'The FBI investigates an apparent breach of its National Crime Information Center. Trump calls the hack not good.',
    fact: ['SECOND REPORTED BREACH', 'OF FBI SYSTEMS IN MONTHS'],
    accent: SLATE,
    icon: iconShield,
  },
];

function drawPanel(x: number, y: number, p: Panel): void {
  const W2 = 490;
  const H2 = 260;
  rect(x, y, W2, H2, WHITE);
  rect(x, y, W2, 8, p.accent);
  // 1 px border
  hline(x, x + W2 - 1, y + H2 - 1, LINE);
  vline(x, y, y + H2 - 1, LINE);
  vline(x + W2 - 1, y, y + H2 - 1, LINE);
  // icon box
  rect(x + 16, y + 20, 72, 72, tint(p.accent, 0.88));
  p.icon(x + 16, y + 20, p.accent);
  // kicker + headline
  drawText(x + 104, y + 26, 2, p.kicker, p.accent);
  drawLines(x + 104, y + 52, 3, 26, p.head, INK);
  // body, wrapped to 4 lines max
  const bodyLines = wrap(p.body, W2 - 32, 2).slice(0, 4);
  drawLines(x + 16, y + 116, 2, 18, bodyLines, BODY);
  // divider + fact strip
  hline(x + 16, x + W2 - 17, y + 196, LINE);
  rect(x + 16, y + 208, W2 - 32, 36, tint(p.accent, 0.92));
  drawLines(x + 28, y + 212, 2, 15, p.fact, p.accent);
}

// -------------------------------------------------------------- masthead ----

function drawMasthead(): void {
  rect(16, 16, 992, 142, INK);
  rect(16, 16, 992, 6, AMBER);
  // globe at left
  const gx = 44;
  const gy = 44;
  ring(gx + 36, gy + 36, 30, AMBER);
  ring(gx + 36, gy + 36, 29, AMBER);
  vline(gx + 36, gy + 6, gy + 66, AMBER);
  hline(gx + 6, gx + 66, gy + 36, AMBER);
  arc(gx + 36, gy + 36, 14, 30, 0, 360, AMBER);
  arc(gx + 36, gy + 36, 30, 13, 0, 360, AMBER);
  drawText(140, 40, 5, 'THE WORLD IN ONE DAY', WHITE);
  drawText(140, 92, 3, 'SATURDAY 21 NOVEMBER 2026', AMBER);
  drawText(140, 126, 2, 'SIX STORIES FROM AROUND THE GLOBE', [196, 205, 224]);
}

// ------------------------------------------------------------------ main ----

function main(): void {
  rect(0, 0, W, H, PAPER);
  drawMasthead();
  const cols = [16, 518];
  const rows = [170, 444, 718];
  PANELS.forEach((p, i) => {
    drawPanel(cols[i % 2], rows[Math.floor(i / 2)], p);
  });
  // footer: sources
  drawText(16, 992, 2, 'SOURCES: BBC, REUTERS, AP, AFP, CNN, AL JAZEERA', BODY);
  const tag = 'REPORTED 21 NOVEMBER 2026';
  drawText(1008 - textWidth(tag, 2), 992, 2, tag, BODY);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG());
}

main();
