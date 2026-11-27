// The lobby's seats as a React island (Kevin, 2026-11-26, step 2 of the React plan). pages/lobby/lobby.js keeps every decision (who sits where, ready,
// presence, the bracket warning, bots, name editing) and hands this the result with set(state); this only draws it. It draws the SAME markup the page drew
// before (li.seat, .seat-label, .seat-namerow, .seat-name, .seat-edit, .seat-name-input, .bot-button with data-bot and data-seat, the pills), so the page's
// listeners and the browser checks read it as before. New: each player's face, made from their name by KokonutUI's avatar generator (avatar-picker.tsx), in their
// color. Every page makes the same face from the same name, so nothing is stored; a new name morphs into its new face (not under reduced motion).
// Drawn synchronously (flushSync), so the page is up to date the moment set() returns, as it was when lobby.js built the elements itself.
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MorphingFace, avatarSeed } from '@/components/kokonutui/avatar-picker';

const PENCIL = 'M11.7 1.8a1.6 1.6 0 0 1 2.3 2.3l-8.4 8.4-3.3.9.9-3.3z';

function NameRow({ seat, editing, handlers }) {
  const input = useRef(null);
  const editingHere = seat.mine && editing;
  useEffect(() => { if (editingHere && input.current && document.activeElement !== input.current) input.current.select(); }, [editingHere]);
  if (editingHere) {
    return (
      <span className="seat-namerow">
        <input
          ref={input} className="seat-name-input" type="text" maxLength={30} defaultValue={editing.draft}
          aria-label="Your name at the table" autoComplete="nickname" spellCheck={false}
          // (the box keeps its own value, as before React, and every native input event updates the draft: onChange would skip a value set by a script)
          onInput={(event) => handlers.onDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); handlers.onSave(); }
            else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); handlers.onCancel(); }
          }}
        />
        <button type="button" className="seat-save" onClick={handlers.onSave}>Save</button>
        <button type="button" className="seat-cancel secondary" onClick={handlers.onCancel}>Cancel</button>
      </span>
    );
  }
  return (
    <span className="seat-namerow">
      <span className="seat-name">{seat.name}</span>
      {seat.mine && seat.canRename && (
        <button type="button" className="seat-edit" title="Change your name" aria-label="Change your name" onClick={handlers.onEditStart}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d={PENCIL} fill="currentColor" /></svg>
        </button>
      )}
      {seat.overLimit && <span className="seat-warn" title={`This deck is bracket ${seat.overLimit.bracket}; the table limit is ${seat.overLimit.limit}. It is only a warning: you can still play.`}>Over limit</span>}
    </span>
  );
}

const botButton = (action, seat, label, busy) => (
  <button type="button" className="secondary bot-button" data-bot={action} data-seat={seat} aria-label={`${label} for seat ${seat}`} disabled={busy}>{label}</button>
);

function Seat({ seat, editing, handlers }) {
  if (seat.empty) {
    return (
      <li className="seat empty-seat" data-seat={seat.seat}>
        <span className="seat-label">{`Seat ${seat.seat}: `}</span>
        <span className="seat-empty">Empty seat</span>
        {seat.bot && botButton(seat.bot, seat.seat, 'Add bot', seat.botBusy)}
      </li>
    );
  }
  const className = ['seat', seat.mine && 'mine', seat.art && 'has-art', seat.overLimit && 'over-limit', 'has-face'].filter(Boolean).join(' ');
  const style = { '--player-color': seat.color, ...(seat.art ? { '--seat-art': `url("${seat.art}")` } : {}) };
  return (
    <li className={className} data-uid={seat.uid} data-seat={seat.seat} data-ready={seat.ready ? '1' : undefined} style={style}>
      <span className="seat-face" aria-hidden="true"><MorphingFace seed={avatarSeed(seat.name, 0)} /></span>
      <span className="seat-label">{`Seat ${seat.seat}: `}</span>
      {seat.host && <span className="seat-host">Host</span>}
      <span className="seat-body">
        <NameRow seat={seat} editing={editing} handlers={handlers} />
        {seat.commander ? <span className="seat-deck">{seat.commander}</span> : <span className="seat-deck seat-nodeck">No deck yet</span>}
      </span>
      <span className="seat-pills">
        {seat.bracket && <span className={seat.bracket.guess ? 'bracket-pill guessed' : 'bracket-pill'} title={seat.bracket.guess ? 'Guessed from the Game Changers in the deck' : undefined}>{`Bracket ${seat.bracket.number}`}</span>}
        {seat.ready && <span className="ready-mark">Ready</span>}
        {seat.presence && <span className="presence" data-state={seat.presence.state}>{seat.presence.words}</span>}
      </span>
      {seat.bot && botButton(seat.bot, seat.seat, 'Remove bot', seat.botBusy)}
    </li>
  );
}

// mountSeats(list) takes over the <ul id="players"> and returns { set(state) }:
// state = { seats: [...in seat order], editing: null | { draft }, handlers: { onEditStart, onDraft, onSave, onCancel } }.
export function mountSeats(list) {
  const root = createRoot(list);
  return {
    set(state) {
      flushSync(() => root.render(state.seats.map((seat) => <Seat key={seat.uid ?? `empty-${seat.seat}`} seat={seat} editing={state.editing} handlers={state.handlers} />)));
    },
  };
}
