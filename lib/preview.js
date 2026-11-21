// Link-preview text for /g/<id>, computed inside the Durable Object.
import { loadGroup, loadMembers, loadSquares } from './db.js';
import { completedLines } from '../public/js/bingo.js';

const FAR = 4102444800;
const fmtDate = (t) =>
  new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function namesText(names) {
  if (names.length <= 3) return names.join(', ').replace(/, ([^,]*)$/, ' and $1');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

export async function preview(env, id) {
  const group = await loadGroup(env, id);
  if (!group) return { status: 404, title: 'Bingo not found · Goal Bingo', desc: 'This bingo does not exist (or was deleted). Start your own: no app, no sign-up.' };
  const members = await loadMembers(env, id);
  const n = members.length;
  const title = `${group.name} · Goal Bingo`;
  const who = `${n} ${n === 1 ? 'player' : 'players'} so far: ${namesText(members.map((m) => m.name))}.`;
  const t = Math.floor(Date.now() / 1000);
  let desc;
  if (group.reveal_at > t) {
    const when = group.reveal_at >= FAR ? 'when the organiser presses reveal' : `on ${fmtDate(group.reveal_at + 43200)}`;
    desc = `${who} Make your card and write a secret square on theirs. Cards reveal ${when}.`;
  } else {
    const squares = await loadSquares(env, id);
    const stats = members.map((m) => {
      const done = new Set(squares.filter((s) => s.owner_id === m.id && s.state === 2).map((s) => s.pos));
      return { name: m.name, done: done.size, lines: completedLines(group.size, done).length, at: m.bingo_at };
    });
    const winners = stats.filter((s) => s.at).sort((a, b) => a.at - b.at);
    const lead = [...stats].sort((a, b) => b.lines - a.lines || b.done - a.done)[0];
    desc = winners.length
      ? `${winners[0].name} got bingo first! ${who} See everyone’s card.`
      : lead && lead.done
        ? `${lead.name} is in the lead with ${lead.done} ${lead.done === 1 ? 'square' : 'squares'} done. ${who}`
        : `The cards are revealed! ${who} See what everyone’s friends wrote.`;
  }
  return { status: 200, title, desc };
}
