// The patterns of the foils (Kevin, 2026-11-18). A CSS gradient cannot make glitter, streaks or shards, so those patterns are drawn once on a canvas, from a seeded random source (the same pattern every time),
// and handed to the style sheet as a custom property holding an image: --tex-glitter and so on. They tile without seams. A pattern is only made when a foil that needs it is first drawn.
// Reference: photos of the real cards (mtgrocks.com's foil guide, mtg.wiki's foil page; looked at only) and the Ponder foil article's descriptions: surge is long wavy spectral streaks on a diagonal, galaxy is scattered multi-coloured
// glitter and soft bokeh circles, confetti is a dense mosaic of coloured specks, etched is a fine matte grain, halo is thin wavy strands, fracture is a faceted mosaic, mana and step-and-Compleat
// repeat a small pattern, dragonscale is overlapping scales. The colours of the drawing are our own.
const rng = (start) => {
  let seed = start;
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function canvasOf(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

// Draws something at every wrap-around offset, so what leaves one edge comes back in at the other and the tile has no seam.
function wrapped(ctx, size, draw) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { ctx.save(); ctx.translate(dx, dy); draw(); ctx.restore(); }
}

const GLITTER_HUES = [28, 330, 205, 140, 52, 275];
const spark = (ctx, x, y, length, alpha) => {
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - length, y); ctx.lineTo(x + length, y);
  ctx.moveTo(x, y - length); ctx.lineTo(x, y + length);
  ctx.stroke();
};

const MAKERS = {
  // Galaxy: a dense field of tiny white stars, small bright coloured sparkles, and a few larger glassy discs (a pale colour with a highlight and a rim), after the photo of the real foil: black sky, hundreds of
  // pin-points, a handful of round "planets" and a few tiny crosses.
  glitter() {
    const size = 320; const { canvas, ctx } = canvasOf(size);
    wrapped(ctx, size, () => { const q = rng(11);
      for (let i = 0; i < 520; i++) { const x = q() * size; const y = q() * size; const rad = 0.35 + q() * q() * 0.9; const tint = q() < 0.2 ? '170,210,255' : q() < 0.3 ? '255,236,170' : '255,255,255';
        ctx.fillStyle = `rgba(${tint},${0.45 + q() * 0.55})`; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); }
      for (let i = 0; i < 80; i++) { const hue = GLITTER_HUES[Math.floor(q() * GLITTER_HUES.length)] + (q() - 0.5) * 24; const x = q() * size; const y = q() * size; const rad = 1 + q() * 1.6;
        ctx.fillStyle = `hsla(${hue},95%,${64 + q() * 16}%,${0.7 + q() * 0.3})`; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); }
      for (let i = 0; i < 13; i++) { const hue = GLITTER_HUES[Math.floor(q() * GLITTER_HUES.length)]; const x = q() * size; const y = q() * size; const rad = 3.5 + q() * 5.5;
        const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, 0.5, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, `hsla(${hue},80%,76%,0.85)`); g.addColorStop(1, `hsla(${hue},85%,58%,0.7)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.strokeStyle = `hsla(${hue},90%,86%,0.6)`; ctx.lineWidth = 0.8; ctx.stroke(); }
      for (let i = 0; i < 5; i++) spark(ctx, q() * size, q() * size, 2 + q() * 2.5, 0.8);
    });
    return canvas;
  },
  // Confetti: a dense mosaic of small coloured facets, each its own colour.
  confetti() {
    const size = 150; const { canvas, ctx } = canvasOf(size);
    wrapped(ctx, size, () => { const q = rng(23);
      for (let i = 0; i < 560; i++) { const x = q() * size; const y = q() * size; const rad = 1.3 + q() * 2.3; const sides = 3 + Math.floor(q() * 3); const turn = q() * 6.3;
        ctx.fillStyle = `hsla(${q() * 360},92%,${54 + q() * 14}%,${0.72 + q() * 0.28})`; ctx.beginPath();
        for (let s = 0; s < sides; s++) { const a = turn + (s * 6.2832) / sides; const px = x + Math.cos(a) * rad * (0.7 + q() * 0.5); const py = y + Math.sin(a) * rad * (0.7 + q() * 0.5); if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.closePath(); ctx.fill(); }
    });
    return canvas;
  },
  // Etched: a fine, matte grain: tiny specks, mostly pale blue and white with a little warm, and a few sparkles. No glare.
  grain() {
    const size = 220; const { canvas, ctx } = canvasOf(size);
    wrapped(ctx, size, () => { const q = rng(37);
      for (let i = 0; i < 1900; i++) { const pick = q(); const colour = pick < 0.5 ? '235,242,255' : pick < 0.8 ? '150,205,255' : '255,214,160'; const rad = 0.45 + q() * 0.75;
        ctx.fillStyle = `rgba(${colour},${0.22 + q() * 0.55})`; ctx.beginPath(); ctx.arc(q() * size, q() * size, rad, 0, 7); ctx.fill(); }
      for (let i = 0; i < 140; i++) { const colour = ['90,220,255', '190,140,255', '255,170,90'][Math.floor(q() * 3)]; ctx.fillStyle = `rgba(${colour},${0.55 + q() * 0.4})`; ctx.beginPath(); ctx.arc(q() * size, q() * size, 0.6 + q() * 0.7, 0, 7); ctx.fill(); }
      for (let i = 0; i < 9; i++) spark(ctx, q() * size, q() * size, 2 + q() * 3, 0.7);
    });
    return canvas;
  },
  // Surge: long, thin, gently wavy streaks, all on the same diagonal, each a band of spectrum with a bright core. The colour depends on where a streak lies across the diagonal, so neighbouring
  // streaks run through the spectrum (cyan, green, gold, orange, magenta, blue) the way the light does on the real card. Most of the card is left dark between them.
  streaks() {
    const size = 420; const { canvas, ctx } = canvasOf(size); const q0 = rng(41);
    const stops = [[84, 200, 244], [176, 240, 104], [255, 200, 96], [255, 134, 58], [255, 80, 150], [120, 176, 255]];
    const spectrum = (u) => { const x = (((u % 1) + 1) % 1) * stops.length; const i = Math.floor(x); const f = x - i; const p = stops[i]; const n = stops[(i + 1) % stops.length]; return p.map((v, k) => Math.round(v + (n[k] - v) * f)).join(','); };
    const streaks = [];
    for (let i = 0; i < 62; i++) {
      const angle = ((-58 + (q0() - 0.5) * 10) * Math.PI) / 180; const x = q0() * size; const y = q0() * size;
      streaks.push({ x, y, dx: Math.cos(angle), dy: Math.sin(angle), length: 90 + q0() * 150, width: 3 + q0() * q0() * 16, amp: 2 + q0() * 5, freq: 1 + q0() * 1.2, phase: q0() * 6.3, colour: spectrum(((x * -Math.sin(-58 * Math.PI / 180) + y * Math.cos(-58 * Math.PI / 180)) / size) * 1.5), alpha: 0.5 + q0() * 0.45 });
    }
    wrapped(ctx, size, () => {
      for (const s of streaks) {
        const points = []; const steps = 22;
        for (let n = 0; n <= steps; n++) { const t = n / steps; const along = (t - 0.5) * s.length; const wobble = Math.sin(t * s.freq * 6.283 + s.phase) * s.amp; points.push([s.x + s.dx * along - s.dy * wobble, s.y + s.dy * along + s.dx * wobble, Math.sin(t * Math.PI)]); }
        for (const [core, mult, fade] of [[false, 3.4, 0.2], [false, 1, 1], [true, 0.3, 1]]) {
          ctx.lineCap = 'round';
          for (let n = 0; n < steps; n++) { const p = points[n]; const q = points[n + 1]; ctx.strokeStyle = core ? `rgba(255,255,255,${s.alpha * 0.75})` : `rgba(${s.colour},${s.alpha * fade})`; ctx.lineWidth = Math.max(0.6, s.width * mult * p[2]); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
        }
      }
    });
    return canvas;
  },
  // Halo: thin, glowing, wavy strands that cross the card, pastel (pink, mint, lilac, sky).
  strands() {
    const size = 320; const { canvas, ctx } = canvasOf(size);
    wrapped(ctx, size, () => { const q = rng(53);
      for (let i = 0; i < 34; i++) { const k = 1 + Math.floor(q() * 3); const amp = 5 + q() * 22; const phase = q() * 6.3; const amp2 = q() * 8; const phase2 = q() * 6.3; const y0 = q() * size; const hue = 150 + q() * 190;
        ctx.strokeStyle = `hsla(${hue},85%,80%,${0.5 + q() * 0.3})`; ctx.shadowColor = `hsla(${hue},90%,75%,0.9)`; ctx.shadowBlur = 5; ctx.lineWidth = 1 + q() * 2.2; ctx.beginPath();
        for (let x = 0; x <= size; x += 4) { const y = y0 + amp * Math.sin((x / size) * k * 6.283 + phase) + amp2 * Math.sin((x / size) * k * 12.566 + phase2); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke(); }
    });
    return canvas;
  },
  // Fracture: a mosaic of small triangular facets, mostly pastel (pink, lilac, cyan, mint) with a few bright white ones, after the photo of the real foil, whose shards are tiny.
  shards() {
    const size = 288; const n = 20; const cell = size / n; const { canvas, ctx } = canvasOf(size); const q = rng(67);
    const points = [];
    for (let i = 0; i < n; i++) { points[i] = []; for (let j = 0; j < n; j++) points[i][j] = [(i + 0.5 + (q() - 0.5) * 0.9) * cell, (j + 0.5 + (q() - 0.5) * 0.9) * cell]; }
    const at = (i, j) => { const p = points[((i % n) + n) % n][((j % n) + n) % n]; return [p[0] + Math.floor(i / n) * size, p[1] + Math.floor(j / n) * size]; };
    const hues = [320, 280, 190, 160, 45, 340];
    for (let i = -1; i < n; i++) for (let j = -1; j < n; j++) {
      const corners = q() < 0.5 ? [[at(i, j), at(i + 1, j), at(i + 1, j + 1)], [at(i, j), at(i + 1, j + 1), at(i, j + 1)]] : [[at(i, j), at(i + 1, j), at(i, j + 1)], [at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]];
      for (const tri of corners) {
        const bright = q() < 0.14;
        ctx.fillStyle = bright ? `rgba(255,255,255,${0.55 + q() * 0.4})` : `hsla(${hues[Math.floor(q() * hues.length)] + (q() - 0.5) * 30},${55 + q() * 30}%,${66 + q() * 16}%,${0.3 + q() * 0.5})`; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(...tri[0]); ctx.lineTo(...tri[1]); ctx.lineTo(...tri[2]); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    return canvas;
  },
  // Mana: a repeating pattern of five small discs in the five colours of mana (our own drawing, not the symbols).
  pips() {
    const size = 110; const { canvas, ctx } = canvasOf(size);
    const spots = [[18, 18, '251,244,194'], [72, 12, '107,182,242'], [100, 66, '170,150,185'], [44, 82, '239,106,80'], [8, 62, '89,194,122']];
    wrapped(ctx, size, () => { for (const [x, y, colour] of spots) { const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 11); g.addColorStop(0, `rgba(255,255,255,0.95)`); g.addColorStop(0.45, `rgba(${colour},0.9)`); g.addColorStop(1, `rgba(${colour},0.55)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke(); } });
    return canvas;
  },
  // Step-and-Compleat: small rainbow glints (a leaf of spectrum) repeated over the card.
  glints() {
    const size = 150; const { canvas, ctx } = canvasOf(size);
    const glints = [[30, 40, 22, 7, 20], [102, 28, 20, 6, -35], [72, 112, 24, 7, 80], [128, 96, 14, 5, 55], [14, 118, 12, 4, -20]];
    wrapped(ctx, size, () => { for (const [x, y, ry, rx, turn] of glints) { ctx.save(); ctx.translate(x, y); ctx.rotate((turn * Math.PI) / 180); const g = ctx.createLinearGradient(0, -ry, 0, ry); [['#ff4d6d', 0], ['#ff9a3c', 0.2], ['#ffe14d', 0.4], ['#5be37a', 0.6], ['#4db5ff', 0.8], ['#9b6bff', 1]].forEach(([c, s]) => g.addColorStop(s, c)); ctx.fillStyle = g; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill(); ctx.restore(); } });
    return canvas;
  },
  // Dragonscale: rows of large, slightly irregular scales (rounded at the bottom) with a dark gap between them and a pale metallic face, after the photo of the real foil.
  scalemosaic() {
    const size = 240; const cols = 5; const rows = 6; const cw = size / cols; const ch = size / rows; const { canvas, ctx } = canvasOf(size);
    wrapped(ctx, size, () => { const q = rng(97);
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const cx = col * cw + (row % 2 ? cw / 2 : 0) + cw / 2 + (q() - 0.5) * 5; const cy = row * ch + ch * 0.5 + (q() - 0.5) * 4; const w = cw * (0.9 + q() * 0.14); const h = ch * 1.28; const turn = (q() - 0.5) * 0.1;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(turn);
        ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w * 0.47, h * 0.22); ctx.quadraticCurveTo(0, h * 0.62, -w * 0.47, h * 0.22); ctx.closePath();
        const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, 'rgba(238,246,255,0.8)'); g.addColorStop(1, 'rgba(140,160,196,0.55)');
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(8,12,26,0.85)'; ctx.lineWidth = 2.3; ctx.stroke(); ctx.restore();
      }
    });
    return canvas;
  },
  // Ripple: thin rings, yellow into lime, spreading out from a few centres, with a few faint diamond outlines, after the photo of the real foil. One picture the shape of a card (not a tile).
  rings() {
    const width = 544; const height = 760; const { canvas, ctx } = canvasOf(width, height); const q = rng(83);
    for (const [cx, cy, strength] of [[0.2, 0.28, 1], [0.74, 0.5, 0.85], [0.42, 0.82, 0.7]]) {
      const reach = width * 0.78; const phase = q() * 6.3;
      for (let r = 14; r < reach; r += 12 + q() * 5) {
        const t = r / reach; const hue = 56 + t * 52; ctx.strokeStyle = `hsla(${hue},90%,66%,${strength * 0.62 * (1 - t * 0.75)})`; ctx.shadowColor = `hsla(${hue},95%,60%,0.7)`; ctx.shadowBlur = 3; ctx.lineWidth = 1.5 + (1 - t) * 1.2;
        ctx.beginPath();
        for (let a = 0; a <= 6.2832; a += 0.05) { const rad = r * (1 + 0.012 * Math.sin(3 * a + phase)); const x = cx * width + Math.cos(a) * rad; const y = cy * height + Math.sin(a) * rad * 0.96; if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    for (let i = 0; i < 6; i++) { const x = q() * width; const y = q() * height; const half = 34 + q() * 50; ctx.strokeStyle = `rgba(255,226,120,${0.28 + q() * 0.2})`; ctx.lineWidth = 1.5; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.strokeRect(-half / 2, -half / 2, half, half); ctx.restore(); }
    return canvas;
  },
  // Textured: fine ridges like a fingerprint, in whorls round a few centres (one picture the shape of a card).
  fingers() {
    const width = 544; const height = 760; const { canvas, ctx } = canvasOf(width, height); const image = ctx.createImageData(width, height);
    const centres = [[0.28, 0.3], [0.72, 0.62], [0.4, 0.88]].map(([x, y]) => [x * width, y * height]);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let d = 1e9; for (const [cx, cy] of centres) d = Math.min(d, Math.hypot(x - cx, (y - cy) * 1.15));
      const f = Math.sin(((d + 7 * Math.sin(x * 0.021) + 6 * Math.sin(y * 0.026 + 1)) / 5.4) * 6.2832); const v = f > 0 ? f * f : 0; const at = (y * width + x) * 4;
      image.data[at] = 255; image.data[at + 1] = 255; image.data[at + 2] = 255; image.data[at + 3] = Math.round(v * 150);
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  },
  // Gold: the fine stipple of a gold foil (dark and light specks), to lie over a gold gradient.
  stipple() {
    const size = 180; const { canvas, ctx } = canvasOf(size);
    wrapped(ctx, size, () => { const q = rng(101);
      for (let i = 0; i < 1100; i++) { ctx.fillStyle = `rgba(70,45,10,${0.25 + q() * 0.35})`; ctx.beginPath(); ctx.arc(q() * size, q() * size, 0.5 + q() * 1.1, 0, 7); ctx.fill(); }
      for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(255,238,170,${0.3 + q() * 0.4})`; ctx.beginPath(); ctx.arc(q() * size, q() * size, 0.5 + q() * 1.0, 0, 7); ctx.fill(); }
    });
    return canvas;
  },
  // Singularity: the spectrum winding in a spiral round the middle of the card (one picture the shape of a card).
  spiral() {
    const width = 512; const height = 512; const { canvas, ctx } = canvasOf(width, height); const image = ctx.createImageData(width, height);
    const hsl = (h, s, l) => { const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0) * 255, f(8) * 255, f(4) * 255]; };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const dx = (x - width * 0.5) / width; const dy = (y - height * 0.46) / height; const r = Math.hypot(dx, dy); const phase = Math.atan2(dy, dx) - Math.log(r + 0.02) * 2.4;
      const band = 0.5 + 0.5 * Math.sin(phase * 5); const [rr, gg, bb] = hsl((((phase / 6.2832) * 540) % 360 + 360) % 360, 0.85, 0.38 + 0.3 * band); const at = (y * width + x) * 4;
      image.data[at] = rr; image.data[at + 1] = gg; image.data[at + 2] = bb; image.data[at + 3] = Math.round(255 * Math.max(0, Math.min(1, 1.25 - 1.7 * r)));
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  },
};

// Which patterns each look needs (the names of the looks are in shared/foil-looks.mjs).
export const TEXTURES_OF = {
  galaxy: ['glitter'], confetti: ['confetti'], etched: ['grain'], surge: ['streaks'], halo: ['strands'], fracture: ['shards'], ripple: ['rings'], textured: ['fingers'], mana: ['pips'], compleat: ['glints'], scales: ['scalemosaic'], gold: ['stipple'], singularity: ['spiral'],
};

const made = new Set();
const declared = []; // the --tex-NAME declarations made so far
let sheet = null;
// Makes the patterns a look needs (once each) and gives them to the style sheet as --tex-NAME on :root. A constructed style sheet is used, so no style attribute or <style> element is added to the page.
export function ensureFoilTextures(look) {
  const wanted = (TEXTURES_OF[look] ?? []).filter((name) => !made.has(name));
  if (!wanted.length || typeof document === 'undefined' || typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in document)) return;
  for (const name of wanted) {
    made.add(name);
    try { declared.push(`--tex-${name}: url("${MAKERS[name]().toDataURL('image/png')}");`); } catch { /* no canvas here: the look is drawn without its pattern */ }
  }
  if (!sheet) { sheet = new CSSStyleSheet(); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }
  sheet.replaceSync(`:root { ${declared.join(' ')} }`);
}
