// ═══════════════════════════════════════════════════════════════
//  DYNAMIC SKY ENGINE — day/night + weather-aware
// ═══════════════════════════════════════════════════════════════
const CV = document.getElementById('space');
const CX = CV.getContext('2d');
let W, H;
const resize = () => { W = CV.width = innerWidth; H = CV.height = innerHeight; };
resize();
addEventListener('resize', resize);

// ── Sky palette keyframes (exact from reference) ─────────────
const SKY_KEYS = [
  [ 0.0,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
  [ 4.5,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
  [ 5.5,  [ [0,'#100830'],[0.25,'#5a1e10'],[0.55,'#b84018'],[0.78,'#e0784a'],[1,'#f5c08a'] ]],
  [ 6.5,  [ [0,'#1a1040'],[0.2,'#7b2a14'],[0.45,'#d45525'],[0.68,'#f09050'],[1,'#fcdaa0'] ]],
  [ 8.0,  [ [0,'#2e7ab8'],[0.45,'#6ab8ee'],[1,'#a8d8f8'] ]],
  [11.0,  [ [0,'#2a8ad4'],[0.45,'#65b8f0'],[1,'#a8d8f8'] ]],
  [15.0,  [ [0,'#2a8ad4'],[0.45,'#65b8f0'],[1,'#a8d8f8'] ]],
  [16.5,  [ [0,'#1e2c55'],[0.25,'#8a3520'],[0.52,'#cc5a26'],[0.72,'#e89050'],[1,'#f8ce90'] ]],
  [18.0,  [ [0,'#14183a'],[0.22,'#6a2018'],[0.50,'#b84020'],[0.72,'#d87840'],[1,'#f0b870'] ]],
  [19.0,  [ [0,'#080820'],[0.35,'#2a1428'],[0.65,'#4a1a20'],[1,'#7a3030'] ]],
  [19.8,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
  [24.0,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
];
const SKY_KEYS_OVC = [
  [ 0.0,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
  [ 4.5,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
  [ 5.5,  [ [0,'#1a1525'],[0.35,'#5a3820'],[0.65,'#9a6040'],[1,'#c89a70'] ]],
  [ 6.5,  [ [0,'#22203a'],[0.30,'#6a4030'],[0.60,'#b07050'],[1,'#d8aa80'] ]],
  [ 8.0,  [ [0,'#8898aa'],[0.5,'#aabccc'],[1,'#c8d8e4'] ]],
  [11.0,  [ [0,'#7a8c9e'],[0.5,'#a2b4c4'],[1,'#c0d0dc'] ]],
  [15.0,  [ [0,'#7a8c9e'],[0.5,'#a2b4c4'],[1,'#c0d0dc'] ]],
  [16.5,  [ [0,'#28243a'],[0.30,'#6a3828'],[0.58,'#a06040'],[1,'#cca070'] ]],
  [18.0,  [ [0,'#18162e'],[0.28,'#502a1a'],[0.55,'#885030'],[1,'#c08058'] ]],
  [19.0,  [ [0,'#060618'],[0.40,'#181018'],[1,'#241620'] ]],
  [19.8,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
  [24.0,  [ [0,'#020208'],[0.5,'#06091a'],[1,'#0a1228'] ]],
];

function hex2rgb(h) {
  const x = parseInt(h.replace('#',''),16);
  return [(x>>16)&255,(x>>8)&255,x&255];
}
function lerpStops(A, B, frac) {
  const out = [], n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const [pa,ca] = A[i], [pb,cb] = B[i];
    const pos = pa+(pb-pa)*frac;
    const ra = hex2rgb(ca), rb = hex2rgb(cb);
    out.push([pos,`rgb(${Math.round(ra[0]+(rb[0]-ra[0])*frac)},${Math.round(ra[1]+(rb[1]-ra[1])*frac)},${Math.round(ra[2]+(rb[2]-ra[2])*frac)})`]);
  }
  return out;
}
function getSkyStops(hour, overcast) {
  const keys = overcast ? SKY_KEYS_OVC : SKY_KEYS;
  let i = 0;
  while (i < keys.length-2 && keys[i+1][0] <= hour) i++;
  const [h0,s0] = keys[i], [h1,s1] = keys[i+1];
  const frac = Math.max(0, Math.min(1,(hour-h0)/(h1-h0)));
  const ef = frac < 0.5 ? 2*frac*frac : -1+(4-2*frac)*frac;
  return lerpStops(s0, s1, ef);
}
// Night alpha: 1 at night, fades to 0 by 7:12, fades back in after 18:48
function nightAlpha(hour) {
  if (hour < 5.2)  return 1;
  if (hour < 7.2)  return 1-(hour-5.2)/2.0;
  if (hour < 18.8) return 0;
  if (hour < 19.8) return (hour-18.8)/1.0;
  return 1;
}
// Cloud alpha: fades in after sunrise, fades out before sunset
function cloudAlpha(hour) {
  if (hour < 7.5)  return Math.max(0,(hour-7.0)/0.5);
  if (hour < 16.0) return 1;
  if (hour < 17.2) return 1-(hour-16.0)/1.2;
  return 0;
}
// Warm horizon glow — sin curve, rises and falls naturally
function glowAlpha(hour) {
  if (hour >= 5.0 && hour < 8.5)   return Math.sin(Math.PI*(hour-5.0)/3.5)*0.45;
  if (hour >= 15.8 && hour < 20.0) return Math.sin(Math.PI*(hour-15.8)/4.2)*0.40;
  return 0;
}

// ── Main draw loop ────────────────────────────────────────────
let _t = 0;
function draw() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Dark theme → always full night starfield, unchanged
  if (isDark) {
    CX.fillStyle = '#020205'; CX.fillRect(0,0,W,H);
    drawNebulas(); drawMilkyWay(); drawStars(_t);
    _t++; requestAnimationFrame(draw); return;
  }

  // Light theme → reference sky engine
  const now  = new Date();
  const hour = now.getHours() + now.getMinutes()/60 + now.getSeconds()/3600;

  // Sky gradient from keyframes
  const stops = getSkyStops(hour, false);
  const grd = CX.createLinearGradient(0, 0, 0, H);
  stops.forEach(([pos, col]) => grd.addColorStop(pos, col));
  CX.fillStyle = grd; CX.fillRect(0, 0, W, H);

  // Nebula ambient — fades with nightAlpha
  const na = nightAlpha(hour);
  const NB = [[0.12,0.22,0.38,22,42,145,0.045],[0.82,0.58,0.30,82,18,118,0.035],[0.50,0.88,0.44,18,78,125,0.030]];
  for (const [fx,fy,fr,r,gg,b,a] of NB) {
    const nbg = CX.createRadialGradient(fx*W,fy*H,0,fx*W,fy*H,fr*Math.max(W,H));
    nbg.addColorStop(0, `rgba(${r},${gg},${b},${(a*na).toFixed(3)})`);
    nbg.addColorStop(1, 'rgba(0,0,0,0)');
    CX.fillStyle = nbg; CX.fillRect(0,0,W,H);
  }

  // Warm horizon glow (morning left, evening right) — sin curve
  const ga = glowAlpha(hour);
  if (ga > 0.01) {
    const gx = hour < 12 ? W*0.28 : W*0.68;
    const sg = CX.createRadialGradient(gx, H*0.82, 0, gx, H*0.82, W*0.52);
    sg.addColorStop(0,   `rgba(255,195,70,${ga.toFixed(3)})`);
    sg.addColorStop(0.4, `rgba(255,130,30,${(ga*0.38).toFixed(3)})`);
    sg.addColorStop(1,   'rgba(255,90,10,0)');
    CX.fillStyle = sg; CX.fillRect(0, 0, W, H);
  }

  // Clouds — fade in after sunrise, fade out before sunset
  const ca = cloudAlpha(hour);
  if (ca > 0.01) {
    for (const cl of CLOUDS_BIG) {
      cl.x = (cl.x + cl.sp) % 1.4;
      drawCloud(CX, (cl.x-0.15)*W, cl.y*H, cl.s, cl.a*ca, 255, 255, 255);
    }
    for (const cl of CLOUDS_WISP) {
      cl.x = (cl.x + cl.sp) % 1.35;
      drawCloud(CX, (cl.x-0.1)*W, cl.y*H, cl.s, cl.a*ca*0.65, 255, 255, 255);
    }
  }
  // Warm-tinted wispy clouds during transition (glow active)
  if (ga > 0.05) {
    for (const cl of CLOUDS_WISP) {
      drawCloud(CX, (cl.x-0.1)*W, cl.y*H, cl.s*0.8, cl.a*ga*1.2, 255, 200, 140);
    }
  }

  _t++; requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
const STARS = Array.from({length:340}, () => ({
  x:   Math.random(),
  y:   Math.random(),
  r:   Math.random() * 1.5 + 0.3,
  a:   Math.random() * 0.55 + 0.45,   // high brightness floor
  tw:  Math.random() * Math.PI * 2,   // phase — every star out of sync
  ts:  0.018 + Math.random() * 0.055, // primary blink speed (much faster)
  ts2: 0.04  + Math.random() * 0.09,  // secondary flicker speed
}));
const FEATURE_STARS = Array.from({length:14}, () => ({
  x:   Math.random(),
  y:   Math.random(),
  r:   2.2 + Math.random() * 1.6,
  a:   0.7 + Math.random() * 0.3,
  tw:  Math.random() * Math.PI * 2,
  ts:  0.014 + Math.random() * 0.030, // slower blink for big stars — more dramatic
  ts2: 0.03  + Math.random() * 0.06,
}));

// ── Clouds (light mode) ──────────────────────────────────────
const CLOUDS_BIG = Array.from({length:6}, (_, i) => ({
  x: i * 0.20 + Math.random() * 0.1,
  y: 0.06 + Math.random() * 0.38,
  s: 0.65 + Math.random() * 0.55,
  sp: 0.000050 + Math.random() * 0.000060,
  a: 0.52 + Math.random() * 0.32,
}));
const CLOUDS_WISP = Array.from({length:5}, (_, i) => ({
  x: i * 0.24 + Math.random() * 0.12,
  y: 0.04 + Math.random() * 0.30,
  s: 0.35 + Math.random() * 0.30,
  sp: 0.000040 + Math.random() * 0.000050,
  a: 0.25 + Math.random() * 0.20,
}));

function drawCloud(cx, x, y, scale, alpha, r, g, b) {
  cx.save();
  cx.globalAlpha = alpha;
  cx.fillStyle = `rgb(${r},${g},${b})`;
  const s = scale;
  cx.beginPath();
  cx.arc(x,        y,       18*s, 0, Math.PI*2);
  cx.arc(x+22*s,   y- 8*s, 24*s, 0, Math.PI*2);
  cx.arc(x+48*s,   y- 4*s, 20*s, 0, Math.PI*2);
  cx.arc(x+66*s,   y+ 4*s, 16*s, 0, Math.PI*2);
  cx.arc(x+28*s,   y+10*s, 18*s, 0, Math.PI*2);
  cx.fill();
  cx.restore();
}

// ── Nebulas (night only) ─────────────────────────────────────
function drawNebulas() {
  const NB = [
    [0.12,0.22,0.38, 22, 42,145,0.072],
    [0.82,0.58,0.30, 82, 18,118,0.058],
    [0.50,0.90,0.44, 18, 78,125,0.052],
    [0.62,0.10,0.26,122, 58, 18,0.038],
    [0.28,0.72,0.22, 40, 95,160,0.034],
  ];
  for (const [fx,fy,fr,r,g,b,a] of NB) {
    const grd = CX.createRadialGradient(fx*W,fy*H,0,fx*W,fy*H,fr*Math.max(W,H));
    grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    CX.fillStyle = grd;
    CX.fillRect(0,0,W,H);
  }
}
function drawMilkyWay() {
  const g = CX.createLinearGradient(0,H*0.82,W,H*0.05);
  g.addColorStop(0,   'rgba(0,0,0,0)');
  g.addColorStop(0.22,'rgba(125,138,192,0.018)');
  g.addColorStop(0.50,'rgba(168,175,218,0.038)');
  g.addColorStop(0.78,'rgba(125,138,192,0.018)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  CX.fillStyle = g; CX.fillRect(0,0,W,H);
}
function drawStars(t) {
  // ── Regular stars — dramatic blink + glow ──
  for (const s of STARS) {
    // Two sine waves combined: one slow, one fast flicker → realistic blink
    const blink = 0.5 + 0.5 * Math.sin(s.tw + t * s.ts)
                + 0.18 * Math.sin(s.tw * 2.3 + t * s.ts2);
    // clamp 0–1, then square it so stars go truly dark between blinks
    const b = Math.max(0, Math.min(1, blink));
    const pulse = b * b;                   // squared = spends more time dim, flashes bright
    const alpha = s.a * pulse;
    if (alpha < 0.01) continue;           // skip fully dark stars (perf)

    CX.save();
    // Outer halo glow — expands and contracts with the blink
    CX.shadowColor = `rgba(160,200,255,${(pulse * 0.9).toFixed(2)})`;
    CX.shadowBlur  = s.r * 14 * pulse + 2;
    CX.beginPath();
    CX.arc(s.x * W, s.y * H, s.r, 0, 6.283);
    CX.fillStyle = `rgba(220,232,255,${alpha.toFixed(2)})`;
    CX.fill();
    // Inner bright core — flares white at peak brightness
    if (pulse > 0.55) {
      CX.shadowBlur  = s.r * 6;
      CX.shadowColor = `rgba(255,255,255,${(pulse * 0.8).toFixed(2)})`;
      CX.beginPath();
      CX.arc(s.x * W, s.y * H, s.r * 0.45, 0, 6.283);
      CX.fillStyle = `rgba(255,255,255,${(pulse * 0.9).toFixed(2)})`;
      CX.fill();
    }
    CX.restore();
  }

  // ── Feature stars — larger, cross-hair, strong pulsing glow ──
  for (const s of FEATURE_STARS) {
    const blink = 0.5 + 0.5 * Math.sin(s.tw + t * s.ts)
                + 0.15 * Math.sin(s.tw * 1.7 + t * s.ts2);
    const b = Math.max(0, Math.min(1, blink));
    const pulse = b * b;
    const alpha = s.a * (0.3 + 0.7 * pulse);  // never fully dark for big stars
    const sx = s.x * W, sy = s.y * H;

    CX.save();
    // Outer diffuse halo
    CX.shadowBlur  = s.r * 20 * pulse + 6;
    CX.shadowColor = `rgba(200,230,255,${(pulse * 0.7).toFixed(2)})`;

    // Cross-hair spike lines — grow and fade with blink
    CX.strokeStyle = `rgba(255,255,255,${(alpha * 0.55).toFixed(2)})`;
    CX.lineWidth = 0.8;
    const spikeLen = s.r * (4 + 3 * pulse);
    CX.beginPath(); CX.moveTo(sx - spikeLen, sy); CX.lineTo(sx + spikeLen, sy); CX.stroke();
    CX.beginPath(); CX.moveTo(sx, sy - spikeLen); CX.lineTo(sx, sy + spikeLen); CX.stroke();

    // Diagonal soft spikes at peak only
    if (pulse > 0.6) {
      CX.strokeStyle = `rgba(255,255,255,${(pulse * 0.25).toFixed(2)})`;
      const d = spikeLen * 0.55;
      CX.beginPath(); CX.moveTo(sx - d, sy - d); CX.lineTo(sx + d, sy + d); CX.stroke();
      CX.beginPath(); CX.moveTo(sx + d, sy - d); CX.lineTo(sx - d, sy + d); CX.stroke();
    }

    // Star core — warm white glow
    CX.shadowBlur  = s.r * 16 * pulse;
    CX.shadowColor = `rgba(255,248,210,${(pulse * 0.95).toFixed(2)})`;
    CX.beginPath();
    CX.arc(sx, sy, s.r, 0, 6.283);
    CX.fillStyle = `rgba(255,252,240,${alpha.toFixed(2)})`;
    CX.fill();

    // Bright white hot core at peak
    if (pulse > 0.5) {
      CX.shadowBlur  = s.r * 7;
      CX.shadowColor = `rgba(255,255,255,${pulse.toFixed(2)})`;
      CX.beginPath();
      CX.arc(sx, sy, s.r * 0.4, 0, 6.283);
      CX.fillStyle = `rgba(255,255,255,${pulse.toFixed(2)})`;
      CX.fill();
    }
    CX.restore();
  }
}

// ─── FEATURES TREE ────────────────────────────────────────────
(function() {
  const TREE2 = {
    id:'root2', label:'Features', type:'root',
    children:[
      { id:'sec', label:'Security', type:'branch', children:[
        //{id:'s1', label:'Authentication',        desc:'Identity verification'},
        //{id:'s2', label:'Encryption\n(TLS/AES)', desc:'Data in transit & at rest'},
        //{id:'s3', label:'Threat\nDetection',     desc:'Anomaly & intrusion alerts'},
        //{id:'s4', label:'Data\nPrivacy',          desc:'PII masking & compliance'},
        //{id:'s5', label:'Audit\nLogs',            desc:'Immutable activity trail'},
      ]},
      { id:'authz', label:'Authorization', type:'branch', children:[
        //{id:'az1', label:'RBAC',                  desc:'Role-based access control'},
        //{id:'az2', label:'OAuth 2.0',             desc:'Delegated token auth'},
        //{id:'az3', label:'JWT\nTokens',           desc:'Signed claims payload'},
        //{id:'az4', label:'Permissions\n& Scopes', desc:'Granular resource access'},
        //{id:'az5', label:'Policy\nEnforcement',   desc:'Allow/deny rule engine'},
      ]},
    ]
  };

  const NODE_W      = 120,  NODE_H_ROOT = 52;
  const NODE_H_BR   = 46,   NODE_H_LEAF = 50;
  const COL_GAP     = 40;
  const LEAF_GAP    = 12;
  const LEVEL_GAP_1 = 72;
  const LEVEL_GAP_2 = 60;

  const branches  = TREE2.children;
  const nBranches = branches.length;
  const TOTAL_W   = nBranches * NODE_W + (nBranches - 1) * COL_GAP;
  const pos = {};

  pos[TREE2.id] = { x: TOTAL_W/2 - NODE_W/2, y: 0, w: NODE_W, h: NODE_H_ROOT };
  let totalH = NODE_H_ROOT + LEVEL_GAP_1 + NODE_H_BR;

  branches.forEach((br, bi) => {
    const bx = bi * (NODE_W + COL_GAP);
    const by = NODE_H_ROOT + LEVEL_GAP_1;
    pos[br.id] = { x: bx, y: by, w: NODE_W, h: NODE_H_BR };
    let ly = by + NODE_H_BR + LEVEL_GAP_2;
    br.children.forEach(lf => {
      pos[lf.id] = { x: bx, y: ly, w: NODE_W, h: NODE_H_LEAF };
      ly += NODE_H_LEAF + LEAF_GAP;
    });
    totalH = Math.max(totalH, ly);
  });

  const wrap2 = document.getElementById('orgWrap2');
  if (!wrap2) return;
  wrap2.style.width  = TOTAL_W + 'px';
  wrap2.style.height = totalH  + 'px';

  function makeNode(data, p) {
    const d = document.createElement('div');
    d.className = 'org-node type-' + p.type;
    d.style.left   = p.x + 'px';
    d.style.top    = p.y + 'px';
    d.style.width  = p.w + 'px';
    d.style.height = p.h + 'px';
    const lbl = document.createElement('span');
    lbl.className = 'node-label';
    lbl.style.whiteSpace = 'pre-line';
    lbl.textContent = data.label;
    d.appendChild(lbl);
    if (data.desc) {
      const desc = document.createElement('span');
      desc.className = 'node-desc';
      desc.textContent = data.desc;
      d.appendChild(desc);
    }
    return d;
  }

  wrap2.appendChild(makeNode(TREE2, { ...pos[TREE2.id], type:'root' }));
  branches.forEach(br => {
    wrap2.appendChild(makeNode(br, { ...pos[br.id], type:'branch' }));
    br.children.forEach(lf =>
      wrap2.appendChild(makeNode(lf, { ...pos[lf.id], type:'leaf' }))
    );
  });

  // SVG connector lines (right-angle elbows)
  const svg2 = document.getElementById('orgSvg2');
  if (!svg2) return;

  function getTreeLineColors() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight
      ? { c1: '#1d4ed8', c2: 'rgba(29,78,216,0.4)', c3: 'rgba(29,78,216,0.55)', c4: 'rgba(29,78,216,0.2)' }
      : { c1: '#c8ff00', c2: 'rgba(200,255,0,0.4)',  c3: 'rgba(200,255,0,0.55)',  c4: 'rgba(200,255,0,0.2)'  };
  }

  function renderTreeGradients() {
    const col = getTreeLineColors();
    const defs = svg2.querySelector('defs') || svg2.insertBefore(
      document.createElementNS('http://www.w3.org/2000/svg','defs'), svg2.firstChild);
    defs.innerHTML = `
      <linearGradient id="lg3" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="${col.c1}"/>
        <stop offset="100%" stop-color="${col.c2}"/>
      </linearGradient>
      <linearGradient id="lg4" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%"   stop-color="${col.c3}"/>
        <stop offset="100%" stop-color="${col.c4}"/>
      </linearGradient>`;
  }

  svg2.innerHTML = '<defs></defs>';
  renderTreeGradients();

  // Re-colour lines whenever theme changes
  const _themeObs = new MutationObserver(() => renderTreeGradients());
  _themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function cx(p) { return p.x + p.w / 2; }
  function bot(p){ return p.y + p.h; }
  function top(p){ return p.y; }

  function addLine(x1,y1,x2,y2,grad) {
    const my = (y1 + y2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`);
    path.setAttribute('stroke', `url(#${grad})`);
    path.setAttribute('stroke-width','1.6');
    path.setAttribute('fill','none');
    path.setAttribute('opacity','0.75');
    svg2.appendChild(path);
  }

  const rp = pos[TREE2.id];
  branches.forEach(br => {
    const bp = pos[br.id];
    addLine(cx(rp), bot(rp), cx(bp), top(bp), 'lg3');
    br.children.forEach(lf => {
      const lp = pos[lf.id];
      addLine(cx(bp), bot(bp), cx(lp), top(lp), 'lg4');
    });
  });
})();

// ─── NAV ──────────────────────────────────────────────────────
const burger = document.getElementById('burger');
const mob    = document.getElementById('mob');
 
burger.addEventListener('click', () => {
  burger.classList.toggle('open');
  mob.classList.toggle('open');
});
mob.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  burger.classList.remove('open');
  mob.classList.remove('open');
}));
 
const allNavLinks = document.querySelectorAll('#nav-links a, #mob a');
allNavLinks.forEach(a => a.addEventListener('click', function() {
  allNavLinks.forEach(l => l.classList.remove('active'));
  document.querySelectorAll(`a[href="${this.getAttribute('href')}"]`).forEach(l => l.classList.add('active'));
}));
 
// ─── THEME TOGGLE ─────────────────────────────────────────────
const root       = document.documentElement;
const toggleBtn  = document.getElementById('toggle-btn');
const toggleLabel= document.getElementById('toggle-label');
 
// User override expires after 7 hours 15 minutes
const OVERRIDE_DURATION = (7 * 60 + 15) * 60 * 1000;
 
function setTheme(theme, save = false) {
  root.setAttribute('data-theme', theme);
  toggleLabel.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  if (save) {
    try {
      localStorage.setItem('bin-theme', theme);
      localStorage.setItem('bin-theme-ts', Date.now().toString());
    } catch(e) {}
  }
}
 
// Returns saved theme if still within the 7h 15min window, else clears and returns null
function getSavedTheme() {
  try {
    const saved = localStorage.getItem('bin-theme');
    const ts    = localStorage.getItem('bin-theme-ts');
    if (saved && ts) {
      if (Date.now() - parseInt(ts, 10) < OVERRIDE_DURATION) return saved;
      // Override has expired — clear it
      localStorage.removeItem('bin-theme');
      localStorage.removeItem('bin-theme-ts');
    }
  } catch(e) {}
  return null;
}
 
// User manually clicks → save preference with timestamp
toggleBtn.addEventListener('click', () => {
  const current = root.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next, true);
});
 
// On load: use saved preference if still valid, else fall back to time-based
function getTimeTheme() {
  const h = new Date().getHours();
  return (h >= 6 && h < 18) ? 'light' : 'dark';
}
 
const savedOnLoad = getSavedTheme();
setTheme(savedOnLoad || getTimeTheme());
 
// Re-check every minute — switches to time-based once override expires
setInterval(() => {
  if (!getSavedTheme()) setTheme(getTimeTheme());
}, 60000);
 
 
// Bin-logo
const wrap = document.getElementById('binWrap');
const page = document.getElementById('slidePage');
let linkTimer = null;
 
function openFolder() {
  wrap.classList.add('open');
  page.classList.add('visible');
  linkTimer = setTimeout(() => {
    window.open('https://git-binacc.github.io/bin/', '_blank');
  }, 800);
}
 
function closeFolder() {
  clearTimeout(linkTimer);
  wrap.classList.remove('open');
  page.classList.remove('visible');
}
 
wrap.addEventListener('click', () => {
  wrap.classList.contains('open') ? closeFolder() : openFolder();
});
 
wrap.addEventListener('mouseleave', () => closeFolder());

// For smooth Link effect
// ─── ULTRA SMOOTH SCROLL ──────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    const target    = document.querySelector(href);
    const scrollBox = document.querySelector('.scroll-body');
    if (!target) return;
    e.preventDefault();

    // Only use scroll-body as container if it is actually scrollable (desktop)
    const scrollBoxActive = scrollBox &&
      getComputedStyle(scrollBox).overflowY !== 'visible' &&
      scrollBox.scrollHeight > scrollBox.clientHeight;

    const navHeight = (document.querySelector('nav') || { offsetHeight: 0 }).offsetHeight;

    if (scrollBoxActive && scrollBox.contains(target)) {
      // ── Desktop: scroll inside .scroll-body ──
      const startY  = scrollBox.scrollTop;
      const targetY = target.getBoundingClientRect().top
                      - scrollBox.getBoundingClientRect().top
                      + scrollBox.scrollTop - navHeight;
      const diff     = targetY - startY;
      const duration = 1400;
      let   start    = null;

      function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

      function step(timestamp) {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        scrollBox.scrollTop = startY + diff * easeOutQuint(progress);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);

    } else {
      // ── Mobile/tablet: page itself scrolls ──
      // window.scrollY is reliable across all browsers (incl. iOS Safari)
      const startY  = window.scrollY;
      const targetY = target.getBoundingClientRect().top + window.scrollY - navHeight;
      const diff     = targetY - startY;
      const duration = 1400;
      let   start    = null;

      function easeOutQuintM(t) { return 1 - Math.pow(1 - t, 5); }

      function stepM(timestamp) {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const y = startY + diff * easeOutQuintM(progress);
        // Write to both for cross-browser support (Safari uses body, others use documentElement)
        document.documentElement.scrollTop = y;
        document.body.scrollTop = y;
        if (progress < 1) requestAnimationFrame(stepM);
      }
      requestAnimationFrame(stepM);
    }
  });
});

// ─── TOPICS TOGGLE (mobile / tablet) ─────────────────────────
(function () {
  const topicBtn   = document.getElementById('topic-toggle-btn');
  const topicPanel = document.getElementById('topic-panel');
  if (!topicBtn || !topicPanel) return;

  let autoCloseTimer = null;

  function startAutoClose() {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = setTimeout(() => {
      if (topicPanel.classList.contains('open')) closeTopics();
    }, 5000);
  }

  function cancelAutoClose() {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }

  function openTopics() {
    topicPanel.style.display = 'block';
    // Force reflow so transition plays
    topicPanel.getBoundingClientRect();
    topicPanel.classList.add('open');
    topicBtn.classList.add('open');
    topicBtn.setAttribute('aria-expanded', 'true');
    startAutoClose();
  }

  function closeTopics() {
    cancelAutoClose();
    topicPanel.classList.remove('open');
    topicBtn.classList.remove('open');
    topicBtn.setAttribute('aria-expanded', 'false');
    // Hide after transition finishes
    topicPanel.addEventListener('transitionend', function hide() {
      if (!topicPanel.classList.contains('open')) topicPanel.style.display = 'none';
      topicPanel.removeEventListener('transitionend', hide);
    });
  }

  // Pause auto-close while user hovers over the panel
  topicPanel.addEventListener('mouseenter', cancelAutoClose);
  topicPanel.addEventListener('mouseleave', () => {
    if (topicPanel.classList.contains('open')) startAutoClose();
  });

  // Reset timer on touch interaction inside the panel
  topicPanel.addEventListener('touchstart', startAutoClose, { passive: true });

  topicBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    topicPanel.classList.contains('open') ? closeTopics() : openTopics();
  });

  // Close when clicking outside
  document.addEventListener('click', function (e) {
    if (!topicPanel.contains(e.target) && e.target !== topicBtn) {
      if (topicPanel.classList.contains('open')) closeTopics();
    }
  });
})();

// Any wheel / touch anywhere on the page (except inside <nav>)
// is captured and forwarded to the content scroll container.
(function () {
  const navEl     = document.querySelector('nav');
  const scrollBox = document.querySelector('.scroll-body');
  if (!scrollBox) return;

  function isDesktop() { return window.innerWidth > 768; }

  /* ── Wheel (mouse & trackpad) ── */
  document.addEventListener('wheel', function (e) {
    if (!isDesktop()) return;
    // Allow normal scroll inside the scroll-body itself
    if (scrollBox.contains(e.target)) return;
    // Don't hijack nav interactions
    if (navEl && navEl.contains(e.target)) return;
    e.preventDefault();
    scrollBox.scrollTop += e.deltaY;
  }, { passive: false });

  /* ── Touch (tablet / touch-screen desktop) ── */
  let _ty = 0;
  document.addEventListener('touchstart', function (e) {
    _ty = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!isDesktop()) return;
    if (scrollBox.contains(e.target)) return;
    if (navEl && navEl.contains(e.target)) return;
    const dy = _ty - e.touches[0].clientY;
    _ty = e.touches[0].clientY;
    scrollBox.scrollTop += dy;
    e.preventDefault();
  }, { passive: false });
})();

// ─── UNIQUE CONSTRAINT ────────────────────────────────────────
//   • Grey dashed overlay → City column  (shows which col has the constraint)
//   • Red arrow           → Degree column (shows the mismatch / violation)
(function positionUniqueArrow() {
  function run() {
    const tbl = document.getElementById('rdbms-t1');
    if (!tbl) return;

    const wrap      = tbl.closest('.rdbms-tables-wrap');
    const svg       = document.getElementById('degree-arrow-svg');
    const arrowPath = document.getElementById('deg-arrow-path');
    const labelEl   = document.getElementById('deg-arrow-label');
    const l1        = document.getElementById('deg-text-l1');
    const l2        = document.getElementById('deg-text-l2');
    const overlay   = document.getElementById('name-overlay');
    if (!wrap || !svg || !arrowPath || !overlay) return;

    const wrapRect = wrap.getBoundingClientRect();
    const tblRect  = tbl.getBoundingClientRect();
    const tblBot   = tblRect.bottom - wrapRect.top;

    // ── Grey dashed overlay → City column (4th col) ──
    const cityTh = tbl.querySelector('thead tr th:nth-child(4)');
    if (!cityTh) return;
    const cityRect = cityTh.getBoundingClientRect();
    overlay.style.left        = (cityRect.left - wrapRect.left) + 'px';
    overlay.style.top         = (cityRect.top  - wrapRect.top)  + 'px';
    overlay.style.width       = cityRect.width  + 'px';
    overlay.style.height      = (tblRect.bottom - cityRect.top) + 'px';
    overlay.style.borderColor = '#888888';   // grey

    // ── Arrow → Degree column (3rd col) — shows the violation ──
    const degTh = tbl.querySelector('thead tr th:nth-child(3)');
    if (!degTh) return;
    const degRect = degTh.getBoundingClientRect();
    const degCx   = degRect.left + degRect.width / 2 - wrapRect.left;

    const svgH = tblBot + 100;
    svg.setAttribute('width',  wrap.offsetWidth);
    svg.setAttribute('height', svgH);

    const ay1  = tblBot;
    const ay2  = tblBot + 31;
    const mid  = (ay1 + ay2) / 2;
    const bend = 10;
    // Quadratic Bézier: control point at the elbow → smooth bend at centre
    arrowPath.setAttribute('d',
      `M${degCx},${ay1} Q${degCx + bend},${mid} ${degCx},${ay2}`
    );

    labelEl.setAttribute('x', degCx);
    labelEl.setAttribute('y', ay2 + 30);
    l1.setAttribute('x', degCx);
    l2.setAttribute('x', degCx);
    l2.setAttribute('dy', '18');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 120));
  } else {
    setTimeout(run, 120);
  }
  window.addEventListener('resize', () => setTimeout(run, 80));
})();


// ─── NOT NULL CONSTRAINT ───────────────────────────────────────
//   • Grey dashed overlay → Degree column (shows which col has the constraint)
//   • Red arrow           → City column / NULL cell (shows the violation)
(function positionNotNullArrow() {
  function run() {
    const tbl = document.getElementById('rdbms-t2');
    if (!tbl) return;

    const wrap      = tbl.closest('.rdbms-tables-wrap');
    const svg       = document.getElementById('city-arrow-svg');
    const arrowPath = document.getElementById('city-arrow-path');
    const labelEl   = document.getElementById('city-arrow-label');
    const l1        = document.getElementById('city-text-l1');
    const l2        = document.getElementById('city-text-l2');
    const overlay   = document.getElementById('name-overlay-2');
    if (!wrap || !svg || !arrowPath || !overlay) return;

    const wrapRect = wrap.getBoundingClientRect();
    const tblRect  = tbl.getBoundingClientRect();
    const tblBot   = tblRect.bottom - wrapRect.top;

    // ── Grey dashed overlay → Degree column (3rd col) ──
    const degTh = tbl.querySelector('thead tr th:nth-child(3)');
    if (!degTh) return;
    const degRect = degTh.getBoundingClientRect();
    overlay.style.left        = (degRect.left - wrapRect.left) + 'px';
    overlay.style.top         = (degRect.top  - wrapRect.top)  + 'px';
    overlay.style.width       = degRect.width  + 'px';
    overlay.style.height      = (tblRect.bottom - degRect.top) + 'px';
    overlay.style.borderColor = '#888888';   // grey

    // ── Arrow → City column / NULL cell (shows the violation) ──
    const cityTh = tbl.querySelector('thead tr th:nth-child(4)');
    if (!cityTh) return;
    const nullCell   = tbl.querySelector('tbody tr:first-child td:nth-child(4)');
    const nullRect   = nullCell ? nullCell.getBoundingClientRect() : cityTh.getBoundingClientRect();
    const nullCellCx = nullRect.left + nullRect.width / 2 - wrapRect.left;

    const svgH = tblBot + 100;
    svg.setAttribute('width',  wrap.offsetWidth);
    svg.setAttribute('height', svgH);

    const ay1  = tblBot;
    const ay2  = tblBot + 31;
    const mid  = (ay1 + ay2) / 2;
    const bend = 10;
    // Quadratic Bézier: control point at the elbow → smooth bend at centre
    arrowPath.setAttribute('d',
      `M${nullCellCx},${ay1} Q${nullCellCx + bend},${mid} ${nullCellCx},${ay2}`
    );

    labelEl.setAttribute('x', nullCellCx);
    labelEl.setAttribute('y', ay2 + 30);
    l1.setAttribute('x', nullCellCx);
    l2.setAttribute('x', nullCellCx);
    l2.setAttribute('dy', '18');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 120));
  } else {
    setTimeout(run, 120);
  }
  window.addEventListener('resize', () => setTimeout(run, 80));
})();

// ─── PRIMARY KEY CONSTRAINT ────────────────────────────────────
//   • Grey dashed overlay → ID column (1st col) — the Primary Key column
(function positionPrimaryKeyOverlay() {
  function run() {
    const tbl = document.getElementById('rdbms-t3');
    if (!tbl) return;

    const wrap    = tbl.closest('.rdbms-tables-wrap');
    const overlay = document.getElementById('name-overlay-3');
    if (!wrap || !overlay) return;

    const wrapRect = wrap.getBoundingClientRect();
    const tblRect  = tbl.getBoundingClientRect();

    // ── Grey dashed overlay → ID column (1st col / Primary Key) ──
    const idTh = tbl.querySelector('thead tr th:nth-child(1)');
    if (!idTh) return;
    const idRect = idTh.getBoundingClientRect();

    overlay.style.left        = (idRect.left - wrapRect.left) + 'px';
    overlay.style.top         = (idRect.top  - wrapRect.top)  + 'px';
    overlay.style.width       = idRect.width  + 'px';
    overlay.style.height      = (tblRect.bottom - idRect.top) + 'px';
    overlay.style.borderColor = '#888888';   // grey (same as other overlays)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 120));
  } else {
    setTimeout(run, 120);
  }
  window.addEventListener('resize', () => setTimeout(run, 80));
})();

// ─── FOREIGN KEY CONSTRAINT ────────────────────────────────────
//   • Grey dashed overlay → ID col of Student Table (parent)
//   • Grey dashed overlay → ID col of Marks Table (child)
//   • Blue dashed arrow   → connects ID col of parent to ID col of child
(function positionForeignKeyOverlay() {
  function run() {
    const parentTbl = document.getElementById('rdbms-fk-parent');
    const childTbl  = document.getElementById('rdbms-fk-child');
    if (!parentTbl || !childTbl) return;

    const wrap          = parentTbl.closest('.rdbms-tables-wrap');
    const overlayParent = document.getElementById('name-overlay-fk-parent');
    const overlayChild  = document.getElementById('name-overlay-fk-child');
    const svg           = document.getElementById('fk-connector-svg');
    const path          = document.getElementById('fk-connector-path');
    if (!wrap || !overlayParent || !overlayChild || !svg || !path) return;

    const wrapRect       = wrap.getBoundingClientRect();
    const parentTblRect  = parentTbl.getBoundingClientRect();
    const childTblRect   = childTbl.getBoundingClientRect();

    // ── Overlay on parent ID column (1st col) ──
    const parentIdTh = parentTbl.querySelector('thead tr th:nth-child(1)');
    if (!parentIdTh) return;
    const pRect = parentIdTh.getBoundingClientRect();
    overlayParent.style.left        = (pRect.left - wrapRect.left) + 'px';
    overlayParent.style.top         = (pRect.top  - wrapRect.top)  + 'px';
    overlayParent.style.width       = pRect.width  + 'px';
    overlayParent.style.height      = (parentTblRect.bottom - pRect.top) + 'px';
    overlayParent.style.borderColor = '#888888';

    // ── Overlay on child ID column (1st col) ──
    const childIdTh = childTbl.querySelector('thead tr th:nth-child(1)');
    if (!childIdTh) return;
    const cRect = childIdTh.getBoundingClientRect();
    overlayChild.style.left        = (cRect.left - wrapRect.left) + 'px';
    overlayChild.style.top         = (cRect.top  - wrapRect.top)  + 'px';
    overlayChild.style.width       = cRect.width  + 'px';
    overlayChild.style.height      = (childTblRect.bottom - cRect.top) + 'px';
    overlayChild.style.borderColor = '#888888';

    // ── Solid bracket line with dots: left edge of parent ID → left → down → right into child ID ──
    const svgH = childTblRect.bottom - wrapRect.top + 20;
    svg.setAttribute('width',  wrap.offsetWidth);
    svg.setAttribute('height', svgH);

    // Key x/y points — 3px gap from table left edges
    const xStart  = pRect.left  - wrapRect.left  - 3;     // 3px left of parent ID header
    const xEnd    = cRect.left  - wrapRect.left  - 3;     // 3px left of child  ID header
    const elbowX  = Math.min(xStart, xEnd) - 18;          // go 18px further left
    const y1      = pRect.top    + pRect.height / 2 - wrapRect.top;  // mid of parent ID header
    const y2      = cRect.top    + cRect.height / 2  - wrapRect.top; // mid of child  ID header

    // Path: start at left of parent ID → go left → go down → go right to child ID
    path.setAttribute('d',
      `M${xStart},${y1} L${elbowX},${y1} L${elbowX},${y2} L${xEnd},${y2}`
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 120));
  } else {
    setTimeout(run, 120);
  }
  window.addEventListener('resize', () => setTimeout(run, 80));
})();