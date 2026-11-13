export type Walk = { from: string; to: string; points: [number, number][]; start: number; end: number };
export type Resident = { id: string; name: string; short: string; colour: string; loc: string; walk: Walk | null; activity: string; busyUntil: number; planned: boolean };
export type Convo = { id: string; a: string; b: string; place: string; at: number; lines: { speaker: string; text: string }[]; ai: boolean };
export type Town = {
  day: number; minute: number; rate: number; serverTime: number; version: number;
  residents: Resident[]; convos: Convo[]; events: { at: number; text: string }[]; rumours: number;
  ai: { left: number; mode: 'ai' | 'scripted' }; busy?: boolean;
};
export type ResidentInfo = {
  id: string; name: string; age: number; job: string; traits: string; colour: string; planned: boolean;
  plan: { minute: number; place: string; activity: string }[];
  memories: { text: string; importance: number; at: number; kind: string }[];
  diaries: { day: number; text: string; ai: boolean }[];
  convos: { a: string; b: string; at: number; place: string; lines: { speaker: string; text: string }[] }[];
};
export type Rumour = { id: string; text: string; origin: string; at: number; spread: { from: string; to: string; at: number }[]; knowers: string[] };

export const LINE_MIN = 1.6; // town minutes each conversation line stays on screen

/** Town time now, predicted between server ticks. Returns absolute minutes (day 1 starts at 0). */
export function townNow(t: Town, receivedAt: number, now = Date.now()) {
  const minute = Math.min(t.minute + ((now - receivedAt) / 1000) * t.rate, t.minute + 30);
  return (t.day - 1) * 1440 + minute;
}
