/* Tiny shared script: closes the Tools menu when you click elsewhere or press Escape. */
(function () {
  'use strict';
  const menus = () => document.querySelectorAll('.site-header details.menu-d');
  document.addEventListener('click', e => { menus().forEach(d => { if (d.open && !d.contains(e.target)) d.open = false; }); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    menus().forEach(d => { if (d.open) { d.open = false; d.querySelector('summary').focus(); } });
  });
})();
