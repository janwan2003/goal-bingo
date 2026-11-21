// Shared rules for Goal Bingo (used by the browser and by the Functions).
// A card is size x size. Some cells are "friend squares": only another member can write them,
// first come, first served, and they stay hidden until the reveal. A 5x5 card has a free centre.

export const SIZES = [3, 4, 5];

// One friend square per row and per column, so nobody can get bingo without a friend's square
// (on 3x3 and 4x4 the pattern also touches both diagonals; on 5x5 the free centre does).
const SLOTS = {
  3: [2, 4, 6],
  4: [1, 7, 10, 12],
  5: [1, 8, 10, 19, 22],
};

export const freeCell = (size) => (size === 5 ? 12 : -1);
export const friendSlots = (size) => SLOTS[size] || [];
export const cellKind = (size, pos) =>
  pos === freeCell(size) ? 'free' : friendSlots(size).includes(pos) ? 'friend' : 'own';
export const ownCount = (size) => size * size - friendSlots(size).length - (freeCell(size) >= 0 ? 1 : 0);

// All rows, columns and both diagonals, as lists of positions.
export function lines(size) {
  const out = [];
  for (let r = 0; r < size; r++) out.push([...Array(size)].map((_, c) => r * size + c));
  for (let c = 0; c < size; c++) out.push([...Array(size)].map((_, r) => r * size + c));
  out.push([...Array(size)].map((_, i) => i * size + i));
  out.push([...Array(size)].map((_, i) => i * size + (size - 1 - i)));
  return out;
}

// done: Set of positions marked done (the free centre counts automatically).
export function completedLines(size, done) {
  const f = freeCell(size);
  return lines(size).filter((line) => line.every((p) => p === f || done.has(p)));
}

export function clean(v, max) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const MAX_SQUARE = 60;
export const MAX_NAME = 24;

// A few ideas so nobody stares at 19 empty squares. Personal, upbeat, nothing that reads as advice.
export const IDEAS = [
  'Read 12 books', 'Run a 5k', 'Visit a new country', 'Learn to cook a new dish', 'Go on a solo trip',
  'Try a pottery class', 'Watch a sunrise', 'Go camping', 'Learn 50 words of a new language',
  'Host a dinner party', 'Do a digital detox weekend', 'Take a dance class', 'See a live concert',
  'Swim in the sea', 'Plant something and keep it alive', 'Write a letter by hand', 'Go to a museum alone',
  'Do 30 days of stretching', 'Try a new sport', 'Make a photo album', 'Climb a mountain',
  'Volunteer for a day', 'Learn a song on an instrument', 'Bake bread from scratch', 'Visit a friend in another city',
  'Have a no-spend weekend', 'Finish a puzzle with 1000 pieces', 'Go to the cinema alone', 'Call grandparents every month',
  'Try a new restaurant every month', 'Sleep 8 hours for a week', 'Ride a bike somewhere new', 'Learn to juggle',
  'Do a karaoke night', 'Make a playlist for every month', 'Go stargazing', 'Take a cold plunge',
  'Spend a day with no phone', 'Learn to draw a portrait', 'Pick up litter on a walk', 'Take a road trip',
  'Read a classic novel', 'Go to a comedy show', 'Make something with my hands', 'Keep a journal for a month',
];

// Ideas for a friend's square: playful, written to someone.
export const WILD_IDEAS = [
  'Visit me', 'Finally book the dentist', 'Learn to make a proper roast', 'Go on a date night once a month',
  'Sing at karaoke (a full song)', 'Send me a postcard', 'Try a food you swore you hate', 'Take a day fully off',
  'Teach me something you are good at', 'Wear the outfit you never dare to', 'Beat me at chess', 'Go to a gig with me',
];

export const TEMPLATES = {
  year: { label: 'New Year', size: 5 },
  summer: { label: 'Summer', size: 4 },
  trip: { label: 'Trip', size: 3 },
  term: { label: 'Uni term', size: 4 },
};

// Pick n ideas not already on the card, deterministic for a given seed string.
export function pickIdeas(n, exclude = [], seed = 'x', list = IDEAS) {
  const have = new Set(exclude.map((s) => s.toLowerCase()));
  const pool = list.filter((s) => !have.has(s.toLowerCase()));
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [];
  while (out.length < n && pool.length) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}
