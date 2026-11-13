// The town, drawn on a canvas (original flat illustration, no image assets): grass, roads, places, people
// walking along the server's routes, speech bubbles, and light that changes with the time of day.
import { useEffect, useRef } from 'react';
import { COLS, ROWS, PLACES, PLACE, isRoad, pointAt, spotIn } from '../../shared/town-map.js';
import { LINE_MIN, townNow, type Town } from '../lib/types';

const T = 24; // px per tile (logical)
const W = COLS * T;
const H = ROWS * T;

const KIND_FILL: Record<string, [string, string]> = {
  shop: ['#fde68a', '#78350f'], work: ['#bfdbfe', '#1e3a8a'], outdoor: ['#86efac', '#14532d'], home: ['#fecaca', '#7f1d1d'],
};
const DARK_FILL: Record<string, [string, string]> = {
  shop: ['#92400e', '#fef3c7'], work: ['#1e3a8a', '#dbeafe'], outdoor: ['#166534', '#dcfce7'], home: ['#7f1d1d', '#fee2e2'],
};

function drawMap(ctx: CanvasRenderingContext2D, dark: boolean) {
  ctx.fillStyle = dark ? '#1f3a2a' : '#d9f2c4';
  ctx.fillRect(0, 0, W, H);
  // little grass tufts (deterministic)
  ctx.fillStyle = dark ? '#284a35' : '#c6e8ad';
  for (let i = 0; i < 260; i++) { const x = (i * 97) % W; const y = (i * 53 + (i % 7) * 31) % H; ctx.fillRect(x, y, 3, 2); }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!isRoad(x, y)) continue;
    ctx.fillStyle = dark ? '#475569' : '#e7e0d2';
    ctx.fillRect(x * T, y * T, T, T);
  }
  // main road centre line
  ctx.strokeStyle = dark ? '#94a3b8' : '#fff';
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 13 * T); ctx.lineTo(W, 13 * T); ctx.stroke();
  ctx.setLineDash([]);
  for (const p of PLACES) {
    const [c, r, w, h] = p.rect;
    const [fill, ink] = (dark ? DARK_FILL : KIND_FILL)[p.kind];
    const x = c * T + 2; const y = r * T + 2; const pw = w * T - 4; const ph = h * T - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(ctx, x + 3, y + 4, pw, ph, 8); ctx.fill();
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, pw, ph, 8); ctx.fill();
    if (p.id === 'ground') { ctx.strokeStyle = dark ? '#dcfce7' : '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x + pw / 2 - 10, y + 12, 20, ph - 24); }
    // door
    const [dx, dy] = p.door;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(dx * T + 6, dy * T + (dy < r ? T - 4 : 0), T - 12, 4);
    ctx.globalAlpha = 1;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = ink;
    ctx.fillText(`${p.icon} ${p.name}`, x + 6, y + 5);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Light over the town: warm morning, clear day, orange evening, blue night. */
function skyTint(minuteOfDay: number): string | null {
  const h = minuteOfDay / 60;
  if (h < 7) return 'rgba(255,170,90,0.18)';
  if (h < 17) return null;
  if (h < 19) return `rgba(255,140,60,${0.06 + ((h - 17) / 2) * 0.12})`;
  return `rgba(30,40,110,${Math.min(0.35, 0.12 + (h - 19) * 0.08)})`;
}

export default function TownCanvas({ town, receivedAt, selected, onSelect, dark }: { town: Town; receivedAt: number; selected: string | null; onSelect: (id: string | null) => void; dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<HTMLCanvasElement | null>(null);
  const pos = useRef(new Map<string, [number, number]>());
  const data = useRef({ town, receivedAt, selected });
  data.current = { town, receivedAt, selected };

  useEffect(() => {
    const m = document.createElement('canvas');
    m.width = W * 2; m.height = H * 2;
    const ctx = m.getContext('2d')!;
    ctx.scale(2, 2);
    drawMap(ctx, dark);
    map.current = m;
  }, [dark]);

  useEffect(() => {
    const el = canvas.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = W * dpr; el.height = H * dpr;
    const ctx = el.getContext('2d')!;
    let raf = 0;
    const frame = () => {
      const { town: t, receivedAt: rec, selected: sel } = data.current;
      const now = townNow(t, rec);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (map.current) ctx.drawImage(map.current, 0, 0, W, H);
      const counts = new Map<string, number>();
      const crowd = new Map<string, number>();
      for (const r of t.residents) if (!(r.walk && now < r.walk.end)) { const l = r.walk ? r.walk.to : r.loc; crowd.set(l, (crowd.get(l) ?? 0) + 1); }
      const speaking = new Map<string, string>();
      for (const c of t.convos) {
        const i = Math.floor((now - c.at) / LINE_MIN);
        if (i >= 0 && i < c.lines.length) speaking.set(c.lines[i].speaker, c.lines[i].text);
      }
      for (const r of t.residents) {
        let p: [number, number];
        if (r.walk && now < r.walk.end) {
          const [x, y] = pointAt(r.walk.points, (now - r.walk.start) / (r.walk.end - r.walk.start));
          p = [x + 0.5, y + 0.5];
        } else {
          const loc = r.walk ? r.walk.to : r.loc;
          const n = counts.get(loc) ?? 0;
          counts.set(loc, n + 1);
          p = spotIn(loc, n) as [number, number];
        }
        const prev = pos.current.get(r.id);
        const smooth: [number, number] = prev ? [prev[0] + (p[0] - prev[0]) * 0.25, prev[1] + (p[1] - prev[1]) * 0.25] : p;
        pos.current.set(r.id, smooth);
        const x = smooth[0] * T; const y = smooth[1] * T;
        ctx.beginPath(); ctx.arc(x, y + 9, 7, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = r.colour; ctx.fill();
        ctx.lineWidth = r.id === sel ? 3 : 2; ctx.strokeStyle = r.id === sel ? (dark ? '#fff' : '#111827') : '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(r.name[0], x, y + 0.5);
        const here = r.walk && now < r.walk.end ? 1 : crowd.get(r.walk ? r.walk.to : r.loc) ?? 1;
        if (here <= 3 || r.id === sel) {
          ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textBaseline = 'top';
          ctx.lineWidth = 3; ctx.strokeStyle = dark ? '#0f172a' : '#fff'; ctx.strokeText(r.short, x, y + 11);
          ctx.fillStyle = dark ? '#f1f5f9' : '#0f172a'; ctx.fillText(r.short, x, y + 11);
        }
        const line = speaking.get(r.id);
        if (line) bubble(ctx, x, y - 14, line, dark);
      }
      const tint = skyTint(now % 1440);
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [dark]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    let best: string | null = null; let bd = 18 * 18;
    for (const [id, [px, py]] of pos.current) { const d = (px * T - x) ** 2 + (py * T - y) ** 2; if (d < bd) { bd = d; best = id; } }
    onSelect(best);
  };

  return (
    <canvas ref={canvas} onClick={click} className="block h-auto w-full cursor-pointer rounded-2xl" style={{ aspectRatio: `${W} / ${H}` }}
      role="img" aria-label={`Map of Mohalla. ${town.residents.map((r) => `${r.name} is ${r.walk ? `walking to ${PLACE[r.walk.to]?.name}` : `at ${PLACE[r.loc]?.name}`}`).join('. ')}.`} data-testid="town" />
  );
}

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, dark: boolean) {
  ctx.font = '500 11px Inter, system-ui, sans-serif';
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) { if (ctx.measureText(`${cur} ${w}`).width > 150 && cur) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] += '…';
  const w = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 14;
  const h = shown.length * 14 + 8;
  const bx = Math.max(4, Math.min(W - w - 4, x - w / 2));
  const by = Math.max(4, y - h);
  ctx.fillStyle = dark ? '#f8fafc' : '#fff';
  ctx.strokeStyle = 'rgba(15,23,42,0.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, w, h, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, by + h); ctx.lineTo(x, by + h + 6); ctx.lineTo(x + 4, by + h); ctx.fill();
  ctx.fillStyle = '#0f172a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  shown.forEach((l, i) => ctx.fillText(l, bx + 7, by + 4 + i * 14));
}
