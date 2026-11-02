(() => {
const $ = s => document.querySelector(s);
const COUNTS = [12, 24, 48, 80, 120, 180];
const FRAME = 12, MAXN = 500;

const board = $('#board'), placedEl = $('#placed'), looseEl = $('#loose'), tray = $('#tray'), dragLayer = $('#dragLayer');

/* ---------- utilities ---------- */
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gridFor(n, ar){ const cols = Math.max(2, Math.round(Math.sqrt(n * ar))); const rows = Math.max(2, Math.round(n / cols)); return [cols, rows]; }

/* ---------- jigsaw geometry: straight sides with a small round knob ---------- */
