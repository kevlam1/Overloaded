// Docks for the table's tools (Kevin, 2026-11-23): the stack, the game history and the action bar can sit in a dock instead of floating, like windows snapped side by side. A dock is a column on
// the page; the tools in it are stacked top to bottom, and the stack takes whatever height the others leave, so a tool dropped into a dock makes the stack shorter instead of sliding under it.
// The page picks the layout (layout(mode)): 'column' is one dock on the left (2 and 4 seats), 'split' is two docks in the empty spaces beside your own area (3 seats), 'none' has no docks (Sidebar
// view: every tool floats and the stack has its tab again). Which tools are in which dock, in which order, is kept in the browser for each layout.
// A floating tool (src/floating-bar.js) asks this module, through dockingFor(name), where a drag would land: over a dock, a line shows the place, and letting go docks it there; anywhere else it floats.

const TOOLS = ['players', 'stack', 'history', 'bar'];
const DOCKS = { column: ['left'], split: ['left', 'right'], none: [] };
const DEFAULTS = { column: { left: ['players', 'stack', 'history', 'bar'] }, split: { left: ['stack', 'bar'], right: ['players', 'history'] } }; // (3 seats: the action bar under the stack, Kevin 2026-11-23)

// A stored layout, read strictly: only known docks and tools, each tool once, and the stack always docked (it has no grip of its own). Anything else gives the default. `float` lists the tools
// the player dragged out on purpose; a tool in no list (one added to the page after the layout was saved) goes where the default puts it.
export function readDockLayout(mode, raw) {
  const fallback = DEFAULTS[mode] ? structuredClone(DEFAULTS[mode]) : {};
  if (!DOCKS[mode] || DOCKS[mode].length === 0) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const seen = new Set();
  const out = {};
  for (const dock of DOCKS[mode]) {
    const list = Array.isArray(raw[dock]) ? raw[dock] : [];
    out[dock] = list.filter((tool) => TOOLS.includes(tool) && !seen.has(tool) && seen.add(tool));
  }
  out.float = (Array.isArray(raw.float) ? raw.float : []).filter((tool) => TOOLS.includes(tool) && tool !== 'stack' && !seen.has(tool) && seen.add(tool));
  if (!seen.has('stack')) { out[DOCKS[mode][0]].unshift('stack'); seen.add('stack'); }
  for (const tool of TOOLS) {
    if (seen.has(tool)) continue;
    const dock = DOCKS[mode].find((name) => fallback[name]?.includes(tool)) ?? DOCKS[mode][0];
    const after = (fallback[dock] ?? []).slice(0, (fallback[dock] ?? []).indexOf(tool)); // (in its default place among the tools that are there)
    const index = out[dock].reduce((at, name, i) => (after.includes(name) ? i + 1 : at), 0);
    out[dock].splice(index, 0, tool);
  }
  return out;
}

// What is kept in the browser (`overloaded.toolDocks`): ONE JSON text with a layout per mode. The store keeps only text (src/safe-store.js), so the layouts are written with JSON.stringify and read back
// strictly; damaged text reads as nothing stored (Kevin, 2026-11-24: an object was passed before, which stored "[object Object]" and kept nothing).
export function readDockStore(text) {
  if (typeof text !== 'string' || !text) return {};
  try { const all = JSON.parse(text); return all && typeof all === 'object' && !Array.isArray(all) ? all : {}; } catch { return {}; }
}
export function writeDockStore(text, mode, lists) { return JSON.stringify({ ...readDockStore(text), [mode]: lists }); }

// elements: { stack, history, bar } (the tools' root elements); stackWindow: its pin(on); onFloat(name): a tool left a dock and floats again (place it); store: safe browser storage.
export function createToolDocks({ elements, stackWindow, onFloat = () => {}, store = null, key = 'overloaded.toolDocks' }) {
  const host = elements.bar.parentElement;
  const home = Object.fromEntries(TOOLS.map((name) => [name, { parent: elements[name].parentElement, next: elements[name].nextSibling }]));
  const docks = {};
  for (const name of ['left', 'right']) {
    const dock = document.createElement('div');
    dock.className = 'tool-dock';
    dock.dataset.dock = name;
    dock.hidden = true;
    host.append(dock);
    docks[name] = dock;
  }
  const line = document.createElement('div'); line.className = 'dock-drop-line'; line.hidden = true;
  let mode = 'none';
  let lists = {};
  const readAll = () => readDockStore(store?.get(key));

  function goHome(name) {
    const element = elements[name];
    element.classList.remove('tool-docked');
    if (element.parentElement === home[name].parent) return;
    const next = home[name].next;
    home[name].parent.insertBefore(element, next && next.parentElement === home[name].parent ? next : null);
  }
  // every tool where the layout puts it: in its dock in order, or back home (floating)
  function render() {
    for (const [dockName, dock] of Object.entries(docks)) {
      const list = lists[dockName] ?? [];
      dock.hidden = !DOCKS[mode].includes(dockName);
      list.forEach((name, index) => {
        const element = elements[name];
        element.classList.add('tool-docked');
        if (dock.children[index] !== element) dock.insertBefore(element, dock.children[index] ?? null);
      });
    }
    const docked = new Set(Object.entries(lists).filter(([dock]) => dock !== 'float').flatMap(([, list]) => list));
    for (const name of TOOLS) if (!docked.has(name) && elements[name].classList.contains('tool-docked')) { goHome(name); if (name !== 'stack') onFloat(name); }
    stackWindow.pin(docked.has('stack'));
  }
  function save() { store?.set(key, writeDockStore(store?.get(key), mode, lists)); }

  // Over which dock, and before which tool, a pointer at (x, y) is: { dock, index } or null. The dragged tool itself does not count.
  function over(name, x, y) {
    for (const [dockName, dock] of Object.entries(docks)) {
      if (dock.hidden) continue;
      const box = dock.getBoundingClientRect();
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      const others = (lists[dockName] ?? []).filter((tool) => tool !== name);
      let index = others.length;
      for (let i = 0; i < others.length; i += 1) { const r = elements[others[i]].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
      return { dock: dockName, index, others };
    }
    return null;
  }
  function preview(plan) {
    if (!plan) { line.hidden = true; return; }
    const dock = docks[plan.dock];
    if (line.parentElement !== dock) dock.append(line);
    const box = dock.getBoundingClientRect();
    const before = plan.others[plan.index] ? elements[plan.others[plan.index]].getBoundingClientRect() : null;
    const after = plan.index > 0 ? elements[plan.others[plan.index - 1]].getBoundingClientRect() : null;
    const y = before ? before.top - 3 : after ? after.bottom + 1 : box.top + 6;
    line.style.top = `${Math.round(y - box.top)}px`;
    line.hidden = false;
  }

  return {
    layout(next) {
      const wanted = DOCKS[next] ? next : 'none';
      if (wanted === mode) return;
      mode = wanted;
      lists = readDockLayout(mode, readAll()[mode]);
      render();
    },
    mode: () => mode,
    // what a floating tool passes to mountFloatingBar({ docking })
    dockingFor(name) {
      return {
        isDocked: () => elements[name].classList.contains('tool-docked'),
        // the drag starts: the tool leaves its dock (the others close up) and floats where it was
        lift() {
          for (const dock of Object.keys(lists)) lists[dock] = lists[dock].filter((tool) => tool !== name);
          lists.float = [...(lists.float ?? []), name]; // (floating on purpose, until it is dropped on a dock)
          goHome(name);
        },
        over: (x, y) => over(name, x, y),
        preview,
        // let go: docked at the plan's place (true), or left floating (false)
        drop(plan) {
          line.hidden = true;
          if (plan) {
            lists.float = (lists.float ?? []).filter((tool) => tool !== name);
            const list = (lists[plan.dock] ?? []).filter((tool) => tool !== name);
            list.splice(Math.min(plan.index, list.length), 0, name);
            lists[plan.dock] = list;
          }
          save();
          render();
          return Boolean(plan);
        },
      };
    },
  };
}
