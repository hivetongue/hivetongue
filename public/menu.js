// Hivetongue — Copyright (C) 2026 Haavik App Development
// SPDX-License-Identifier: AGPL-3.0-or-later
// Top menu layout (see menu.css): on narrow screens the Info group and the radio form row 3;
// on wide screens Info joins row 2 and the radio ends row 1.
// On / the view tools ([🔍] [Autopilot · ⛶]) also get their own row on narrow screens. Nothing else ever moves.
'use strict';
(() => {
  const q = matchMedia('(max-width: 600px)'), $ = (id) => document.getElementById(id);
  const place = () => {
    const narrow = q.matches, info = $('infoseg'), radio = $('radioseg'), tools = $('viewtools');
    if (!info || !radio) return;
    // on / the first row is long: on narrow screens [🔍] [Autopilot · ⛶] get a row of their own
    if (tools && $('mr1b')) (narrow ? $('mr1b') : $('mr1')).append(tools);
    (narrow ? $('mr3') : $('mr2')).append(info);
    (narrow ? $('mr3') : $('mr1')).append(radio);
  };
  place();
  if (q.addEventListener) q.addEventListener('change', place); else q.addListener(place);
})();
