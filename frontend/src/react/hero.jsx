// The first React island (Kevin, 2026-11-26: React and Tailwind as islands so KokonutUI components can be used). Two KokonutUI components on the home page's hero,
// drawn into their own empty elements, so the page's own markup, ids and script (pages/lobby/lobby.js) are untouched:
// - DotField behind the hero: a field of dots that moves away from the pointer (the battlefields use the same dots);
// - CardFlip beside it: a random commander from the top 1,000 (/data/commanders.json, shared/top-commanders.mjs) face up, which turns over to the real card back
//   (Kevin, 2026-11-26: he asked for both, so the home page now loads a Scryfall picture on arrival, and its check allows that one host). Until the list
//   arrives, or if it cannot load, there is no card (Kevin, 2026-11-28: no Krenko by default).
// Both stop moving under prefers-reduced-motion (the components check it themselves). Pictures come from Scryfall like every card on the site.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DotField from '@/components/kokonutui/dot-field';
import CardFlip from '@/components/kokonutui/card-flip';
import { imageUrl, cardBackUrl } from '../../../shared/card-image.mjs';
import { pickCommander } from '../../../shared/top-commanders.mjs';

const picture = (src, alt) => <img src={src} alt={alt} draggable={false} className="block h-full w-full rounded-[4.8%/3.4%] object-cover" />;

const dots = document.getElementById('hero-dots');
if (dots) {
  createRoot(dots).render(
    <StrictMode>
      <DotField className="!absolute inset-0 !min-h-0 h-full !bg-transparent !text-inherit" spacing={20}>{null}</DotField>
    </StrictMode>,
  );
}

function HeroCard() {
  const [commander, setCommander] = useState(null); // [id, name] once the list has arrived
  useEffect(() => {
    let live = true;
    fetch('/data/commanders.json').then((response) => (response.ok ? response.json() : null)).then((rows) => { if (live) setCommander(pickCommander(rows)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!commander) return null;
  const [id, name] = commander;
  return (
    <CardFlip
      label={`${name}. Drag or press to turn it over.`}
      className="!w-[170px]"
      faceClassName="rounded-[4.8%/3.4%] overflow-hidden shadow-2xl"
      front={picture(imageUrl(id, 'normal'), name)}
      back={picture(cardBackUrl('normal'), 'The back of a card')}
    />
  );
}

const card = document.getElementById('hero-card');
if (card) createRoot(card).render(<StrictMode><HeroCard /></StrictMode>);
