// The first React island (Kevin, 2026-11-26: React and Tailwind as islands so KokonutUI components can be used). Two KokonutUI components on the home page's hero,
// drawn into their own empty elements, so the page's own markup, ids and script (pages/lobby/lobby.js) are untouched:
// - DotField behind the hero: a field of dots that moves away from the pointer (the battlefields use the same dots);
// - CardFlip beside it: a card that starts face down (the site's own logo, NOT the Magic card back: the rules allow that picture only for face-down cards in play)
//   and turns over to Krenko. Krenko's picture is fetched from Scryfall only once the visitor shows interest (the pointer over the card, focus, or a flip), because
//   loading the home page must contact no other site (scripts/check-lobby-ui.mjs).
// Both stop moving under prefers-reduced-motion (the components check it themselves). Pictures come from Scryfall like every card on the site.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DotField from '@/components/kokonutui/dot-field';
import CardFlip from '@/components/kokonutui/card-flip';
import { imageUrl } from '../../../shared/card-image.mjs';

const KRENKO = '824b2d73-2151-4e5e-9f05-8f63e2bdcaa9'; // Krenko, Mob Boss: the commander of the sample deck (shared/sample-decks.mjs)
const picture = (src, alt) => <img src={src} alt={alt} draggable={false} className="block h-full w-full rounded-[4.8%/3.4%] object-cover" />;

const dots = document.getElementById('hero-dots');
if (dots) {
  createRoot(dots).render(
    <StrictMode>
      <DotField className="!absolute inset-0 !min-h-0 h-full !bg-transparent !text-inherit" spacing={20}>{null}</DotField>
    </StrictMode>,
  );
}

const logoFace = <div className="hero-card-back"><img src="/brand/logo.png" alt="" width="432" height="96" draggable={false} /></div>;

function HeroCard() {
  const [wanted, setWanted] = useState(false); // (Krenko's picture is asked for only from here on)
  const want = () => setWanted(true);
  return (
    <div onPointerEnter={want} onFocus={want}>
      <CardFlip
        label="A face-down card. Drag or press to turn it over."
        className="!w-[170px]"
        faceClassName="rounded-[4.8%/3.4%] overflow-hidden shadow-2xl"
        front={logoFace}
        back={wanted ? picture(imageUrl(KRENKO, 'normal'), 'Krenko, Mob Boss') : logoFace}
        onFlippedChange={want}
      />
    </div>
  );
}

const card = document.getElementById('hero-card');
if (card) createRoot(card).render(<StrictMode><HeroCard /></StrictMode>);
