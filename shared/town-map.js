// The map of Mohalla (original layout) + A* paths between places. Shared by the server (walk times) and the
// browser (drawing + animating along the same waypoints). Grid: 40 × 26 tiles.

export const COLS = 40;
export const ROWS = 26;

// Roads: [col, row, width, height] rectangles of walkable tiles.
const ROADS = [
  [0, 12, 40, 2], // Main road
  [8, 0, 2, 26], // West lane
  [26, 0, 2, 26], // East lane
  [10, 5, 16, 1], // Upper gali
  [10, 20, 16, 1], // Lower gali
  [28, 6, 12, 1], // Ground path
];

// Places: id, name, kind, rect [col, row, w, h], door [col, row] (on a road), colour key.
export const PLACES = [
  { id: 'chai', name: "Raju's Chai", kind: 'shop', rect: [10, 9, 5, 3], door: [12, 12], icon: '☕' },
  { id: 'kirana', name: 'Gupta Kirana', kind: 'shop', rect: [16, 9, 5, 3], door: [18, 12], icon: '🛒' },
  { id: 'tailor', name: "Pooja's Boutique", kind: 'shop', rect: [22, 9, 4, 3], door: [24, 12], icon: '🧵' },
  { id: 'clinic', name: 'Khan Clinic', kind: 'work', rect: [10, 14, 5, 3], door: [12, 13], icon: '🩺' },
  { id: 'autostand', name: 'Auto Stand', kind: 'work', rect: [16, 14, 4, 2], door: [17, 13], icon: '🛺' },
  { id: 'park', name: 'Banyan Park', kind: 'outdoor', rect: [20, 14, 6, 5], door: [22, 13], icon: '🌳' },
  { id: 'school', name: 'Vidya School', kind: 'work', rect: [29, 14, 9, 6], door: [27, 16], icon: '🏫' },
  { id: 'ground', name: 'Cricket Ground', kind: 'outdoor', rect: [29, 0, 11, 6], door: [33, 6], icon: '🏏' },
  { id: 'home_yadav', name: 'Yadav house', kind: 'home', rect: [1, 1, 6, 4], door: [8, 3], icon: '🏠' },
  { id: 'home_gupta', name: 'Gupta house', kind: 'home', rect: [1, 6, 6, 4], door: [8, 8], icon: '🏠' },
  { id: 'home_iyer', name: 'Iyer house', kind: 'home', rect: [1, 15, 6, 4], door: [8, 17], icon: '🏠' },
  { id: 'home_khan', name: 'Khan house', kind: 'home', rect: [1, 20, 6, 4], door: [8, 22], icon: '🏠' },
  { id: 'home_das', name: 'Das room', kind: 'home', rect: [11, 1, 5, 3], door: [13, 5], icon: '🏠' },
  { id: 'home_dsouza', name: "D'Souza cottage", kind: 'home', rect: [18, 1, 6, 3], door: [21, 5], icon: '🏠' },
  { id: 'home_sharma', name: 'Sharma flat', kind: 'home', rect: [11, 21, 6, 4], door: [13, 20], icon: '🏠' },
];
export const PLACE = Object.fromEntries(PLACES.map((p) => [p.id, p]));
export const PLACE_IDS = PLACES.map((p) => p.id);

const walkable = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
for (const [c, r, w, h] of ROADS) for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) walkable[y][x] = true;
export const isRoad = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < COLS && walkable[y][x];

/** A* on the road grid (4-neighbour). Returns tile waypoints from door to door, or null. */
export function findPath(from, to) {
  const key = (x, y) => y * COLS + x;
  const h = (x, y) => Math.abs(x - to[0]) + Math.abs(y - to[1]);
  const open = [{ x: from[0], y: from[1], g: 0, f: h(from[0], from[1]) }];
  const came = new Map();
  const g = new Map([[key(from[0], from[1]), 0]]);
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (cur.x === to[0] && cur.y === to[1]) {
      const path = [[cur.x, cur.y]];
      let k = key(cur.x, cur.y);
      while (came.has(k)) { const p = came.get(k); path.unshift(p); k = key(p[0], p[1]); }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isRoad(nx, ny)) continue;
      const ng = cur.g + 1;
      const nk = key(nx, ny);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, [cur.x, cur.y]);
        open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

/** Turn a list of tiles into corner points only (smaller to send, smooth to animate). */
export function simplify(path) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const [a, b, c] = [path[i - 1], path[i], path[i + 1]];
    if ((b[0] - a[0]) !== (c[0] - b[0]) || (b[1] - a[1]) !== (c[1] - b[1])) out.push(b);
  }
  out.push(path.at(-1));
  return out;
}

const cache = new Map();
/** Waypoints from place to place (door to door), tiles walked. */
export function route(fromId, toId) {
  const k = `${fromId}>${toId}`;
  if (!cache.has(k)) {
    const p = findPath(PLACE[fromId].door, PLACE[toId].door);
    cache.set(k, p ? { points: simplify(p), tiles: p.length - 1 } : null);
  }
  return cache.get(k);
}

/** Where along a route a walker is at fraction t (0..1), in tile coordinates. */
export function pointAt(points, t) {
  if (points.length === 1) return points[0];
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]);
    segs.push(d);
    total += d;
  }
  let dist = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? Math.min(1, dist / segs[i]) : 1;
      const [a, b] = [points[i], points[i + 1]];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    dist -= segs[i];
  }
  return points.at(-1);
}

/** A spot inside a place for the n-th person there, so people don't stand on each other. */
export function spotIn(placeId, n) {
  const [c, r, w, h] = PLACE[placeId].rect;
  const cols = Math.max(1, Math.floor(w - 0.5));
  const rows = Math.max(1, Math.floor(h - 0.8));
  return [c + 0.75 + (n % cols), r + 1.35 + (Math.floor(n / cols) % rows) * 0.95];
}

// Town time: minutes since midnight of the current town day. 1 real second = RATE town minutes.
export const RATE = 2;
export const WALK_MIN_PER_TILE = 0.6;
export const clock = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
