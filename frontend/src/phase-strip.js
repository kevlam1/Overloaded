// The phase strip in the top bar (the redesign, step 4; shared/phase.mjs): the seven steps of a turn, the current one marked. The player whose turn it is clicks a step to set it;
// for everyone else the steps are only shown. Plain DOM.
import { PHASES } from '../../shared/phase.mjs';

// root: the #phase-strip element. onPick(step): called when a step is clicked while the strip can be changed.
export function mountPhaseStrip({ root, onPick }) {
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Step of the turn');
  const buttons = PHASES.map((phase, step) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'phase-step';
    button.dataset.step = String(step);
    button.textContent = phase.name;
    button.addEventListener('click', () => { if (root.dataset.mine === 'true') onPick(step); });
    return button;
  });
  root.replaceChildren(...buttons);
  return {
    // step: 0 to 6; mine: true when this page's player may change it; whose: the words for the title ("Bob's turn")
    update({ step, mine, whose = '' }) {
      root.hidden = false;
      root.dataset.mine = String(Boolean(mine));
      buttons.forEach((button, index) => {
        const here = index === step;
        button.classList.toggle('current', here);
        button.classList.toggle('done', index < step);
        if (here) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
        button.disabled = !mine;
        button.title = mine ? `Go to ${PHASES[index].name}` : `${PHASES[index].name}${whose ? ` (${whose})` : ''}`;
      });
    },
  };
}
