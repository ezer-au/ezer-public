// EZER — shared interactions (light, functional only)

// Offer accordion
document.querySelectorAll('.offer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.offer-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.offer-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.offer-btn').setAttribute('aria-expanded','false');
    });
    if(!isOpen){ item.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
  });
});

// Values expand
document.querySelectorAll('.value-card').forEach(card => {
  card.addEventListener('click', () => card.classList.toggle('open'));
  card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); card.classList.toggle('open'); } });
});

// The Name — Hebrew letter reveal
const nameDetails = {
  'ayin':  { title:'ע — Ayin', body:'The first letter. In Hebrew thought an ezer isn\u2019t a lesser role \u2014 it\u2019s someone whose strength meets a real need. That\u2019s the posture EZER takes: alongside, never over.' },
  'zayin': { title:'ז — Zayin', body:'The middle letter of ezer (\u05e2\u05b5\u05d6\u05b6\u05e8) \u2014 Hebrew for \u201chelp\u201d or \u201chelper.\u201d The same word used in Genesis 2:18, of a helper who stands with, not above.' },
  'resh':  { title:'ר — Resh', body:'The final letter closes the word \u2014 and the shape of what\u2019s offered: support that completes something the church already carries, rather than replacing it.' }
};
const detailEl = document.getElementById('letterDetail');
document.querySelectorAll('.letter').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.letter').forEach(l => l.classList.remove('active'));
    el.classList.add('active');
    const d = nameDetails[el.dataset.letter];
    if(!detailEl) return;
    detailEl.style.opacity = 0;
    setTimeout(() => {
      detailEl.innerHTML = '<span class="term">'+d.title+'</span>'+d.body;
      detailEl.style.opacity = 1;
    }, 120);
  });
});
