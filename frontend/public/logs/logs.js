// Behaviour of the /logs/ page: open and close entries, open the one named in the address, search, expand all, and mark the week in view.
(function () {
  'use strict';
  var entries = Array.prototype.slice.call(document.querySelectorAll('.entry'));
  var search = document.getElementById('log-search');
  var note = document.getElementById('search-note');
  var none = document.getElementById('no-results');

  function setOpen(entry, open) {
    entry.classList.toggle('open', open);
    entry.querySelector('.entry-head button').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  entries.forEach(function (entry) {
    entry.querySelector('.entry-head button').addEventListener('click', function () {
      var open = !entry.classList.contains('open');
      setOpen(entry, open);
      if (open && entry.id) { try { history.replaceState(null, '', '#' + entry.id); } catch (e) { /* storage of the address is optional */ } }
    });
  });

  // Weeks fold too: the button in a week's heading hides or shows its days.
  var weekEls = Array.prototype.slice.call(document.querySelectorAll('.week'));
  function setWeek(week, open) {
    week.classList.toggle('collapsed', !open);
    week.querySelector('.week-head button').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  weekEls.forEach(function (week) {
    week.querySelector('.week-head button').addEventListener('click', function () { setWeek(week, week.classList.contains('collapsed')); markCurrent(); });
  });
  function openWeekOf(el) { var week = el.closest('.week'); if (week) setWeek(week, true); }

  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var target = document.getElementById(id);
    if (target && target.classList.contains('entry')) { openWeekOf(target); setOpen(target, true); target.scrollIntoView(); }
    else if (target && target.classList.contains('week')) { setWeek(target, true); target.scrollIntoView(); }
  }
  openFromHash();
  window.addEventListener('hashchange', openFromHash);

  document.getElementById('expand-all').addEventListener('click', function () {
    weekEls.forEach(function (week) { setWeek(week, true); });
    entries.forEach(function (entry) { if (!entry.hidden) setOpen(entry, true); });
  });
  document.getElementById('collapse-all').addEventListener('click', function () {
    entries.forEach(function (entry) { setOpen(entry, false); });
    weekEls.forEach(function (week) { setWeek(week, false); });
  });

  // Search: hides entries that do not contain every typed word, then hides days and weeks left empty.
  var haystacks = entries.map(function (entry) { return (entry.textContent || '').toLowerCase(); });
  function clearMarks() {
    Array.prototype.forEach.call(document.querySelectorAll('mark'), function (m) {
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
  }
  function markWords(root, words) {
    var escaped = words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    var pattern = new RegExp('(' + escaped.join('|') + ')', 'gi');
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var pieces = node.nodeValue.split(pattern);
      if (pieces.length < 2) return;
      var frag = document.createDocumentFragment();
      pieces.forEach(function (piece, i) {
        if (i % 2 === 1) { var m = document.createElement('mark'); m.textContent = piece; frag.appendChild(m); }
        else if (piece) frag.appendChild(document.createTextNode(piece));
      });
      node.parentNode.replaceChild(frag, node);
    });
  }
  function runSearch() {
    var words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    clearMarks();
    var shown = 0;
    entries.forEach(function (entry, i) {
      var match = words.every(function (w) { return haystacks[i].indexOf(w) >= 0; });
      entry.hidden = !match;
      if (match) shown += 1;
      if (words.length > 0 && match) {
        setOpen(entry, true);
        openWeekOf(entry);
        markWords(entry.querySelector('.body-pad'), words);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.day'), function (day) {
      day.hidden = !day.querySelector('.entry:not([hidden])');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.week'), function (week) {
      week.hidden = !week.querySelector('.entry:not([hidden])');
    });
    var setout = document.getElementById('setout');
    if (setout) setout.hidden = words.length > 0;
    none.hidden = !(words.length > 0 && shown === 0);
    note.textContent = words.length > 0 ? shown + (shown === 1 ? ' entry matches' : ' entries match') : '';
  }
  var timer = null;
  search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runSearch, 150); });

  // The week bar marks the week that is on screen.
  var links = Array.prototype.slice.call(document.querySelectorAll('.week-link'));
  links.forEach(function (link) { link.addEventListener('click', function () { var week = document.getElementById(link.getAttribute('data-target')); if (week) setWeek(week, true); }); });
  function markCurrent() {
    var current = null;
    links.forEach(function (link) {
      var section = document.getElementById(link.getAttribute('data-target'));
      if (section && !section.hidden && section.getBoundingClientRect().top <= 160) current = link;
    });
    links.forEach(function (link) { link.classList.toggle('current', link === current); if (link === current) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current'); });
    if (current) { var row = current.parentNode; row.scrollLeft = current.offsetLeft - row.clientWidth / 2 + current.clientWidth / 2; }
  }
  window.addEventListener('scroll', markCurrent, { passive: true });
  markCurrent();
})();
