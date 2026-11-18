// Builds the build-log page, frontend/public/logs/index.html (served at /logs/), from log.md, the summaries in scripts/log-summaries.mjs and the layout in scripts/logs-template.html.
// The look and the behaviour are the two files next to the page, frontend/public/logs/logs.css and logs.js (the site's content policy allows no inline style or script).
// Run it from the project folder: node scripts/make-logs-page.mjs      Run it again whenever log.md or a summary changes, and commit the page it writes.
// The entries are split into weeks, Monday to Sunday (Kevin, 2026-11-13): Week -1 is 25 October (a Sunday, put there as an exception) to Sunday 1 November, Week 0 is Monday 2 to Sunday 8 November,
// Week 1 is Monday 9 to Sunday 15 November, and so on. A week with no entry is left out. Every week starts folded (the page opens on the list of weeks); a click, a search, a week link or an entry link opens one.
// It stops if log.md is not numbered 1, 2, 3 ... or has a section it does not know, and it checks that every word of log.md is on the page, so nothing is dropped without being noticed.
// The last two sections of the page are the feedback (docs/feedback.md: what my friends said and what it changed, for my professors, 2026-11-17) and the to-do list (docs/todo.md: how I am planning), built the same way,
// with the same word check. Run this script again after either file changes too.
import { readFileSync, writeFileSync } from 'node:fs';
import { SUMMARIES, REFLECTION_SUMMARIES } from './log-summaries.mjs';
import { versionFromLog } from '../shared/version.mjs';

const here = new URL('.', import.meta.url);
const logText = readFileSync(new URL('../log.md', here), 'utf8').replace(/\r\n/g, '\n');
const template = readFileSync(new URL('logs-template.html', here), 'utf8');

// ---------- The tiny bit of markdown the log uses: bold, code, bullets (two levels), paragraphs ----------
// Invisible and direction-changing characters in the log text (entries that talk about them) are written as numbers, so the page file has none (scripts/check-source-hygiene.mjs).
const INVISIBLE = new RegExp('[\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\u2800\\u3164\\uFEFF\\uFFA0\\uFFF9-\\uFFFB]', 'g');
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(INVISIBLE, (c) => `&#x${c.codePointAt(0).toString(16).toUpperCase()};`);

// Code spans are set aside first, so a star or an angle bracket inside backticks (like `*.local` or `<dialog>`) is left alone.
function inline(text) {
  const codes = [];
  const held = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  return esc(held)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function renderBlock(lines) {
  const html = [];
  let paragraph = [];
  let items = null; // the bullet list being read: [{ text, children: [text], extra: [text] }]
  const flushParagraph = () => {
    if (paragraph.length > 0) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (items === null) return;
    const li = (item) => {
      const nested = item.children.length > 0 ? `<ul>${item.children.map((c) => `<li>${inline(c)}</li>`).join('')}</ul>` : '';
      const extra = item.extra.map((e) => `<p>${inline(e)}</p>`).join('');
      return `<li>${inline(item.text)}${nested}${extra}</li>`;
    };
    html.push(`<ul>${items.map(li).join('')}</ul>`);
    items = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '' || line.trim() === '---') { flushParagraph(); continue; } // a blank line ends a paragraph, but not a list
    const bullet = /^( *)- (.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (items === null) items = [];
      if (bullet[1].length === 0 || items.length === 0) items.push({ text: bullet[2], children: [], extra: [] });
      else items[items.length - 1].children.push(bullet[2]);
      continue;
    }
    if (items !== null && /^ +\S/.test(line)) { items[items.length - 1].extra.push(line.trim()); continue; } // an indented line after a bullet belongs to it
    flushList();
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) { flushParagraph(); html.push(`<p class="sub">${inline(line.trim())}</p>`); } // a bold line on its own is a small heading
    else paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return html.join('\n');
}

// ---------- Split log.md into its "##" sections ----------
const sections = [];
for (const line of logText.split('\n')) {
  if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), lines: [] });
  else if (sections.length > 0) sections[sections.length - 1].lines.push(line);
}
const numbered = [];
let setOut = null; let misread = null; let decisions = null;
for (const section of sections) {
  const match = /^(\d+)\. (.+?) \((\d{4}-\d{2}-\d{2})\)$/.exec(section.title);
  if (match) numbered.push({ ...section, number: Number(match[1]), name: match[2], date: match[3] });
  else if (/^what i set out to build$/i.test(section.title)) setOut = section;
  else if (/^where ai misread me/i.test(section.title)) misread = section;
  else if (/^decisions and abandoned ideas$/i.test(section.title)) decisions = section;
  else throw new Error(`Unexpected section in log.md: "${section.title}". Add it to scripts/make-logs-page.mjs.`);
}
if (!setOut || !misread || !decisions) throw new Error('log.md is missing "What I set out to build", "Where AI misread me" or "Decisions and abandoned ideas".');
numbered.forEach((section, i) => { if (section.number !== i + 1) throw new Error(`Log sections should count 1, 2, 3 ... but found ${section.number} after ${i}.`); });

// ---------- Summaries: mine if there is one, else the first sentence of "What I asked for" ----------
const plain = (text) => text.replace(/`([^`]+)`/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1');
function derivedSummary(section) {
  const at = section.lines.findIndex((line) => /^\*\*what i asked for\*\*$/i.test(line.trim()));
  const bullet = section.lines.slice(at + 1).find((line) => /^- /.test(line));
  const source = at >= 0 && bullet ? bullet.replace(/^- /, '') : section.name;
  const text = plain(source).replace(/\s+/g, ' ').trim();
  const sentence = /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
  if (sentence.length <= 240) return sentence;
  const cut = sentence.slice(0, 240);
  return `${cut.slice(0, cut.lastIndexOf(' '))}...`;
}
const summaryOf = (section) => SUMMARIES[section.number] ?? derivedSummary(section);

// ---------- Weeks, Monday to Sunday ----------
const DAY = 24 * 60 * 60 * 1000;
const asDate = (date) => new Date(`${date}T12:00:00Z`);
const WEEK_ONE_MONDAY = asDate('2026-11-09'); // Week 1 starts here
const FIRST_SUNDAY = '2026-10-25'; // the exception: it goes with the week that starts the next day
function weekOf(date) {
  if (date === FIRST_SUNDAY) return -1;
  return Math.floor((asDate(date) - WEEK_ONE_MONDAY) / (7 * DAY)) + 1;
}
const part = (date, options) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(date);
const short = (date) => `${part(date, { month: 'short' })} ${part(date, { day: 'numeric' })}`;
function weekRange(week) {
  const monday = new Date(WEEK_ONE_MONDAY.getTime() + (week - 1) * 7 * DAY);
  const sunday = new Date(monday.getTime() + 6 * DAY);
  const start = week === -1 ? asDate(FIRST_SUNDAY) : monday; // Week -1 is the exception: it takes in Sunday 25 October
  return `${short(start)} to ${short(sunday)}`;
}
const weekId = (week) => (week < 0 ? `week-m${-week}` : `week-${week}`);
const weekName = (week) => `Week ${week}`;
const dayLabel = (date) => `${part(asDate(date), { weekday: 'long' })} ${part(asDate(date), { day: 'numeric' })} ${part(asDate(date), { month: 'long' })}`;

const weeks = [];
for (const section of numbered) {
  const week = weekOf(section.date);
  let w = weeks.find((entry) => entry.week === week);
  if (!w) { w = { week, days: [] }; weeks.push(w); }
  let d = w.days.find((entry) => entry.date === section.date);
  if (!d) { d = { date: section.date, sections: [] }; w.days.push(d); }
  d.sections.push(section);
}
weeks.sort((a, b) => a.week - b.week);
for (const w of weeks) w.days.sort((a, b) => a.date.localeCompare(b.date));

// ---------- The pieces of the page ----------
const checks = []; // [name, markdown lines, html] for the word check at the end
function entryHtml({ id, badge, title, summary, lines, render = renderBlock, comparable = (l) => l }) {
  const body = render(lines);
  checks.push([title, comparable(lines), body]);
  return `<article class="entry" id="${id}" data-n="${esc(badge)}">
  <h4 class="entry-head"><button type="button" aria-expanded="false" aria-controls="${id}-body">
    <span class="num">${esc(badge)}</span>
    <span class="head-text"><span class="title">${esc(title)}</span><span class="sum">${esc(summary)}</span></span>
    <span class="caret" aria-hidden="true"></span>
  </button></h4>
  <div class="body" id="${id}-body"><div class="body-in"><div class="body-pad">
${body}
  </div></div></div>
</article>`;
}

const weeksHtml = weeks.map((w) => {
  const count = w.days.reduce((n, d) => n + d.sections.length, 0);
  const daysHtml = w.days.map((d) => `<div class="day">
<h3 class="day-title">${esc(dayLabel(d.date))} <span class="day-count">${d.sections.length}</span></h3>
<div class="entries">
${d.sections.map((s) => entryHtml({ id: `entry-${s.number}`, badge: String(s.number), title: s.name, summary: summaryOf(s), lines: s.lines })).join('\n')}
</div>
</div>`).join('\n');
  return `<section class="week collapsed" id="${weekId(w.week)}" aria-labelledby="${weekId(w.week)}-title">
<h2 class="week-head" id="${weekId(w.week)}-title"><button type="button" aria-expanded="false" aria-controls="${weekId(w.week)}-days"><span class="wname">${weekName(w.week)}</span><span class="range">${esc(weekRange(w.week))}</span><span class="week-count">${count} ${count === 1 ? 'entry' : 'entries'}</span><span class="caret" aria-hidden="true"></span></button></h2>
<div class="days" id="${weekId(w.week)}-days">
${daysHtml}
</div>
</section>`;
}).join('\n');

const reflectionHtml = `<section class="week collapsed" id="reflection" aria-labelledby="reflection-title">
<h2 class="week-head" id="reflection-title"><button type="button" aria-expanded="false" aria-controls="reflection-days"><span class="wname">Reflection</span><span class="range">the whole project</span><span class="caret" aria-hidden="true"></span></button></h2>
<div class="days" id="reflection-days"><div class="day"><div class="entries">
${entryHtml({ id: 'reflection-misread', badge: '•', title: misread.title, summary: REFLECTION_SUMMARIES.misread, lines: misread.lines })}
${entryHtml({ id: 'reflection-decisions', badge: '•', title: decisions.title, summary: REFLECTION_SUMMARIES.decisions, lines: decisions.lines })}
</div></div></div>
</section>`;

// ---------- The feedback, from docs/feedback.md: the same kind of file as the log (paragraphs and bullets, one entry for each "##" part) ----------
const feedbackText = readFileSync(new URL('../docs/feedback.md', here), 'utf8').replace(/\r\n/g, '\n');
const feedbackIntro = []; const feedbackSections = [];
for (const line of feedbackText.split('\n')) {
  if (line.startsWith('# ')) continue; // the title of the file: the section has its own
  if (line.startsWith('## ')) feedbackSections.push({ title: line.slice(3).trim(), lines: [] });
  else if (feedbackSections.length > 0) feedbackSections[feedbackSections.length - 1].lines.push(line);
  else feedbackIntro.push(line);
}
if (feedbackSections.length === 0) throw new Error('docs/feedback.md has no "##" section.');
const bulletsIn = (lines) => lines.filter((line) => /^- /.test(line)).length;
const feedbackIntroBody = renderBlock(feedbackIntro);
checks.push(['Feedback, introduction', feedbackIntro, feedbackIntroBody]);
const feedbackEntries = feedbackSections.map((section, i) => entryHtml({
  id: `feedback-${i + 1}`, badge: '\u2022', title: section.title,
  summary: `${bulletsIn(section.lines)} ${bulletsIn(section.lines) === 1 ? 'item' : 'items'}`, lines: section.lines,
})).join('\n');
const feedbackItems = feedbackSections.slice(1).reduce((sum, section) => sum + bulletsIn(section.lines), 0); // the first part says who played; the rest are things they asked for
const feedbackHtml = `<section class="week collapsed" id="feedback" aria-labelledby="feedback-title">
<h2 class="week-head" id="feedback-title"><button type="button" aria-expanded="false" aria-controls="feedback-days"><span class="wname">Feedback</span><span class="range">${feedbackItems} things my friends asked for, and what changed</span><span class="caret" aria-hidden="true"></span></button></h2>
<div class="days" id="feedback-days"><div class="day">
<div class="todo-intro">${feedbackIntroBody}</div>
<div class="entries">
${feedbackEntries}
</div></div></div>
</section>`;

// ---------- The to-do list, from docs/todo.md ----------
const todoText = readFileSync(new URL('../docs/todo.md', here), 'utf8').replace(/\r\n/g, '\n');
const todoIntro = []; const todoSections = [];
for (const line of todoText.split('\n')) {
  if (line.startsWith('# ')) continue; // the title of the file: the section has its own
  if (line.startsWith('## ')) todoSections.push({ title: line.slice(3).trim(), lines: [] });
  else if (todoSections.length > 0) todoSections[todoSections.length - 1].lines.push(line);
  else todoIntro.push(line);
}
if (todoSections.length === 0) throw new Error('docs/todo.md has no "##" section.');
const BOX = /^- \[( |x)\] /;
const withoutBoxes = (lines) => lines.map((line) => line.replace(BOX, '- '));
// "- [x] text" is a finished item and "- [ ] text" an open one (a box drawn by the style sheet, and the word Done or Open for a screen reader); "### text" is a small heading; any other "- text" is a plain item.
function renderTodoBlock(lines) {
  const html = []; let paragraph = []; let items = null;
  const flushParagraph = () => { if (paragraph.length > 0) html.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; };
  const flushList = () => { if (items !== null) html.push(`<ul class="todo-list">${items.join('')}</ul>`); items = null; };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') { flushParagraph(); continue; }
    const heading = /^### (.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); html.push(`<p class="sub"><strong>${inline(heading[1])}</strong></p>`); continue; }
    const boxed = BOX.exec(line);
    const plain = /^- (.*)$/.exec(line);
    if (boxed || plain) {
      flushParagraph();
      if (items === null) items = [];
      if (boxed) {
        const done = boxed[1] === 'x';
        items.push(`<li class="todo ${done ? 'todo-done' : 'todo-open'}"><span class="visually-hidden">${done ? 'Done' : 'Open'}: </span>${inline(line.slice(boxed[0].length))}</li>`);
      } else items.push(`<li>${inline(plain[1])}</li>`);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList();
  return html.join('\n');
}
const countIn = (lines, pattern) => lines.filter((line) => pattern.test(line)).length;
const todoOpen = countIn(todoText.split('\n'), /^- \[ \] /);
const todoDone = countIn(todoText.split('\n'), /^- \[x\] /);
const todoSummary = (lines) => {
  const open = countIn(lines, /^- \[ \] /); const done = countIn(lines, /^- \[x\] /); const plainItems = countIn(lines, /^- (?!\[)/);
  const parts = [open ? `${open} open` : null, done ? `${done} done` : null, plainItems ? `${plainItems} ${plainItems === 1 ? 'item' : 'items'}` : null].filter(Boolean);
  return parts.join(', ');
};
const introBody = renderBlock(todoIntro);
checks.push(['To-do list, introduction', todoIntro, introBody]);
const todoEntries = todoSections.map((section, i) => entryHtml({
  id: `todo-${i + 1}`,
  badge: countIn(section.lines, /^- \[ \] /) > 0 ? String(countIn(section.lines, /^- \[ \] /)) : (countIn(section.lines, /^- \[x\] /) > 0 ? '\u2713' : '\u2022'),
  title: section.title, summary: todoSummary(section.lines), lines: section.lines, render: renderTodoBlock, comparable: withoutBoxes,
})).join('\n');
const todoHtml = `<section class="week collapsed" id="todo" aria-labelledby="todo-title">
<h2 class="week-head" id="todo-title"><button type="button" aria-expanded="false" aria-controls="todo-days"><span class="wname">To-do list</span><span class="range">${todoOpen} open, ${todoDone} done</span><span class="caret" aria-hidden="true"></span></button></h2>
<div class="days" id="todo-days"><div class="day">
<div class="todo-intro">${introBody}</div>
<div class="entries">
${todoEntries}
</div></div></div>
</section>`;

const setOutBody = renderBlock(setOut.lines);
checks.push(['What I set out to build', setOut.lines, setOutBody]);
const setOutHtml = `<section class="setout" id="setout"><h2>${esc(setOut.title)}</h2>${setOutBody}</section>`;

// The week bar: one link per week with its dates and how many entries, then the reflection.
const weekNav = [
  ...weeks.map((w) => {
    const count = w.days.reduce((n, d) => n + d.sections.length, 0);
    return `<a class="week-link" href="#${weekId(w.week)}" data-target="${weekId(w.week)}"><span class="wl-name">${weekName(w.week)}</span><span class="wl-range">${esc(weekRange(w.week))}</span><span class="wl-count">${count}</span></a>`;
  }),
  '<a class="week-link" href="#reflection" data-target="reflection"><span class="wl-name">Reflection</span><span class="wl-range">misreads and decisions</span></a>',
  `<a class="week-link" href="#feedback" data-target="feedback"><span class="wl-name">Feedback</span><span class="wl-range">${feedbackItems} things friends asked for</span></a>`,
  `<a class="week-link" href="#todo" data-target="todo"><span class="wl-name">To-do list</span><span class="wl-range">${todoOpen} open, ${todoDone} done</span></a>`,
].join('\n');

// ---------- The word check: everything in log.md has to be on the page ----------
const words = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fromMarkdown = (lines) => words(lines.join(' ').replace(/`/g, ''));
const fromHtml = (html) => words(html.replace(/<span class="visually-hidden">[^<]*<\/span>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x[0-9A-F]+;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
for (const [name, lines, html] of checks) {
  if (fromMarkdown(lines) !== fromHtml(html)) throw new Error(`The page text for "${name}" does not match log.md. The converter dropped or changed something.`);
}

// ---------- Write the page ----------
// The pieces go in through functions, never as plain strings: String.replace treats "$'" and "$`" in a plain replacement string as patterns, and the log has text like ${...} in it.
const sortedDates = numbered.map((s) => s.date).sort();
const parts = {
  COUNT: String(numbered.length),
  VERSION: versionFromLog(logText),
  DATES: `${short(asDate(sortedDates[0]))} to ${short(asDate(sortedDates.at(-1)))}, ${part(asDate(sortedDates.at(-1)), { year: 'numeric' })}`,
  WEEKNAV: weekNav,
  SETOUT: setOutHtml,
  WEEKS: weeksHtml,
  REFLECTION: reflectionHtml,
  FEEDBACK: feedbackHtml,
  TODO: todoHtml,
};
let page = template;
for (const [name, value] of Object.entries(parts)) page = page.replace(`{{${name}}}`, () => value);
if (/\{\{[A-Z]+\}\}/.test(page)) throw new Error('The template has a placeholder that was not filled in.');
const expectedLength = template.length - Object.keys(parts).reduce((sum, name) => sum + `{{${name}}}`.length, 0) + Object.values(parts).reduce((sum, value) => sum + value.length, 0);
if (page.length !== expectedLength) throw new Error(`The page is ${page.length} characters but should be ${expectedLength}. Something was added or repeated.`);
writeFileSync(new URL('../frontend/public/logs/index.html', here), page);
console.log(`Wrote frontend/public/logs/index.html: ${numbered.length} entries in ${weeks.length} weeks (${weeks.map((w) => weekName(w.week)).join(', ')}), plus the reflection, the feedback (${feedbackItems} items) and the to-do list (${todoOpen} open, ${todoDone} done). Every word of log.md, docs/feedback.md and docs/todo.md is on the page.`);
