(() => {
  'use strict';
  const form = document.getElementById('controls-search');
  const input = document.getElementById('controls-query');
  const reset = document.getElementById('controls-reset');
  const count = document.getElementById('controls-count');
  const empty = document.getElementById('controls-empty');
  const cards = Array.from(document.querySelectorAll('#controls-list > article'));
  if (!form || !input || !reset || !count || !empty || !cards.length) return;
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[\s\-./]+/g, ' ').trim();
  const aliases = { 'rpg-maker': 'rpgm rpgmaker', vnm: 'vnm', unreal: 'ue4 ue5', 'nwjs': 'nwjs nodewebkit', 'cocos-creator': 'cocos' };
  const entries = cards.map(card => ({card, text: normalize(card.textContent + ' ' + (aliases[card.id] || ''))}));
  function filter() {
    const terms = normalize(input.value).split(' ').filter(Boolean);
    let visible = 0;
    entries.forEach(({card, text}) => {
      card.hidden = !terms.every(term => text.includes(term));
      if (!card.hidden) visible++;
    });
    count.textContent = visible + (visible === 1 ? ' fiche' : ' fiches') + (terms.length ? ' sur ' + cards.length : '');
    empty.hidden = visible !== 0;
  }
  function revealHash() {
    const id = window.location.hash.slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    const card = target.closest('#controls-list > article');
    if (card && card.hidden) {
      input.value = '';
      filter();
    }
    if (target.matches('details')) target.open = true;
  }
  input.addEventListener('input', filter);
  reset.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  form.addEventListener('submit', event => event.preventDefault());
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target && target.closest('#controls-list > article')) {
      input.value = '';
      filter();
    }
    if (target && target.matches('details')) target.open = true;
  });
  window.addEventListener('hashchange', () => {
    revealHash();
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView();
  });
  form.hidden = false;
  filter();
  revealHash();
})();
