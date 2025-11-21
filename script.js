// GeoClicker - simple circle clicker
// Saves to localStorage. No external libs.

(() => {
  // --- Game state (persisted) ---
  const DEFAULT_STATE = {
    score: 0,
    perClick: 1,
    perSec: 0,
    upgrades: {},
    boosts: [],
    lastTick: Date.now()
  };

  const UPGRADE_DEFS = [
    { id: 'cursor', title: 'Cursor', description: 'Auto-generate shapes', baseCost: 15, perSec: 0.1 },
    { id: 'brush', title: 'Brush', description: 'Better clicks', baseCost: 100, perClick: 1 },
    { id: 'wheel',  title: 'Wheel', description: 'Faster shapes/sec', baseCost: 500, perSec: 2 },
    { id: 'factory',title: 'Factory', description: 'Big auto production', baseCost: 3000, perSec: 15 },
  ];

  const SCENARIOS = [
    { id: 'inspire', title: 'Inspiration!', effect: { perClickMul: 2 }, duration: 15, text: 'Clicks are twice as powerful for a while.' },
    { id: 'rush', title: 'Production Rush', effect: { perSecMul: 2 }, duration: 20, text: 'Auto production doubled!' },
    { id: 'market', title: 'Market Boom', effect: { scoreAdd: 250 }, duration: 0, text: 'You found extra shapes!' },
    { id: 'cold', title: 'Slowdown', effect: { perSecMul: 0.5 }, duration: 18, text: 'Production slowed temporarily.' }
  ];

  // --- DOM ---
  const $score = document.getElementById('score');
  const $perClick = document.getElementById('perClick');
  const $perSec = document.getElementById('perSec');
  const $bigCircle = document.getElementById('bigCircle');
  const $upgrades = document.getElementById('upgrades');
  const $boosts = document.getElementById('boosts');
  const $currentScenario = document.getElementById('currentScenario');
  const $scenarioLog = document.getElementById('scenarioLog');
  const $nextScenario = document.getElementById('nextScenario');
  const $saveBtn = document.getElementById('saveBtn');
  const $resetBtn = document.getElementById('resetBtn');

  // --- Utilities ---
  const saveKey = 'geoclicker_v1';
  function loadState() {
    const raw = localStorage.getItem(saveKey);
    if (!raw) return {...DEFAULT_STATE};
    try {
      const s = JSON.parse(raw);
      // ensure fields
      return Object.assign({}, DEFAULT_STATE, s);
    } catch (e) {
      console.warn('Failed to load save, resetting.', e);
      return {...DEFAULT_STATE};
    }
  }
  function saveState() {
    state.lastTick = Date.now();
    localStorage.setItem(saveKey, JSON.stringify(state));
    flashSave();
  }
  function resetState(){
    localStorage.removeItem(saveKey);
    Object.assign(state, {...DEFAULT_STATE});
    recompute();
    renderAll();
  }
  function format(n){
    if (n < 1000) return Math.round(n*100)/100;
    const suffixes = ['k','M','B','T'];
    let i = 0;
    while (n >= 1000 && i < suffixes.length - 1){
      n /= 1000; i++;
    }
    return (Math.round(n*100)/100) + suffixes[i-1] ?? suffixes[i];
  }

  // small save visual
  let saveTimeout;
  function flashSave(){
    $saveBtn.textContent = 'Saved';
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(()=> $saveBtn.textContent = 'Save', 800);
  }

  // --- Game logic ---
  const state = loadState();

  // initialize missing upgrade counts
  UPGRADE_DEFS.forEach(u => {
    if (state.upgrades[u.id] == null) state.upgrades[u.id] = 0;
  });

  // compute derived stats
  function recompute(){
    // perClick base + upgrades
    let perClick = 1;
    perClick += (state.upgrades['brush'] || 0) * (UPGRADE_DEFS.find(u=>u.id==='brush')?.perClick || 0);

    // perSec from upgrades
    let perSec = 0;
    perSec += (state.upgrades['cursor'] || 0) * (UPGRADE_DEFS.find(u=>u.id==='cursor')?.perSec || 0);
    perSec += (state.upgrades['wheel'] || 0) * (UPGRADE_DEFS.find(u=>u.id==='wheel')?.perSec || 0);
    perSec += (state.upgrades['factory'] || 0) * (UPGRADE_DEFS.find(u=>u.id==='factory')?.perSec || 0);

    // apply active boosts
    const now = Date.now();
    state.boosts = (state.boosts || []).filter(b => !b.expires || b.expires > now);

    let perClickMul = 1, perSecMul = 1;
    state.boosts.forEach(b => {
      if (b.perClickMul) perClickMul *= b.perClickMul;
      if (b.perSecMul) perSecMul *= b.perSecMul;
    });

    state.perClick = perClick * perClickMul;
    state.perSec = perSec * perSecMul;
  }

  function addScore(amount){
    state.score += amount;
    renderScore();
  }

  function buyUpgrade(def){
    const cost = calcCost(def);
    if (state.score < cost) return;
    state.score -= cost;
    state.upgrades[def.id] = (state.upgrades[def.id] || 0) + 1;
    recompute();
    renderAll();
    saveState();
    logScenario(`Bought ${def.title}`);
  }

  function calcCost(def){
    const owned = state.upgrades[def.id] || 0;
    // exponential cost curve
    const cost = Math.floor(def.baseCost * Math.pow(1.6, owned));
    return cost;
  }

  // scenario / boost system
  function spawnRandomScenario(manual=false){
    // choose random with weights
    const pick = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    triggerScenario(pick, manual);
  }

  function triggerScenario(scenario, manual=false){
    const s = {
      id: scenario.id,
      title: scenario.title,
      text: scenario.text,
      start: Date.now(),
      duration: scenario.duration
    };

    // apply immediate effect if scoreAdd
    if (scenario.effect && scenario.effect.scoreAdd){
      state.score += scenario.effect.scoreAdd;
    }

    // apply persistent boost if multiplier and duration > 0
    if (scenario.duration && (scenario.effect.perClickMul || scenario.effect.perSecMul)) {
      const boost = {
        id: scenario.id + '_' + Date.now(),
        perClickMul: scenario.effect.perClickMul || 1,
        perSecMul: scenario.effect.perSecMul || 1,
        expires: Date.now() + scenario.duration * 1000,
        title: scenario.title
      };
      state.boosts.push(boost);
      logScenario(`${scenario.title}: ${scenario.text} (for ${scenario.duration}s)`);
    } else {
      logScenario(`${scenario.title}: ${scenario.text}`);
    }

    recompute();
    renderAll();
    if (!manual) saveState();
  }

  function logScenario(msg){
    const line = document.createElement('div');
    line.textContent = `${new Date().toLocaleTimeString()}: ${msg}`;
    $scenarioLog.prepend(line);
    // keep only last 50
    while ($scenarioLog.children.length > 50) $scenarioLog.removeChild($scenarioLog.lastChild);
  }

  // --- Rendering ---
  function renderScore(){
    $score.textContent = format(state.score);
    $perClick.textContent = `+${format(state.perClick)} / click`;
    $perSec.textContent = `${format(state.perSec)} / sec`;
  }

  function renderUpgrades(){
    $upgrades.innerHTML = '';
    UPGRADE_DEFS.forEach(def => {
      const wrapper = document.createElement('div');
      wrapper.className = 'upgrade';
      const left = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = `${def.title} x${state.upgrades[def.id] || 0}`;
      title.style.fontWeight = '700';
      const desc = document.createElement('div');
      desc.className = 'meta';
      desc.textContent = def.description + (def.perSec ? ` • +${def.perSec}/s` : '') + (def.perClick ? ` • +${def.perClick}/click` : '');
      left.appendChild(title);
      left.appendChild(desc);

      const right = document.createElement('div');
      const cost = calcCost(def);
      const costDiv = document.createElement('div');
      costDiv.className = 'meta';
      costDiv.textContent = `${format(cost)} shapes`;
      const btn = document.createElement('button');
      btn.textContent = 'Buy';
      btn.className = 'buy-btn';
      btn.disabled = state.score < cost;
      btn.onclick = () => buyUpgrade(def);
      right.appendChild(costDiv);
      right.appendChild(btn);

      wrapper.appendChild(left);
      wrapper.appendChild(right);
      $upgrades.appendChild(wrapper);
    });
  }

  function renderBoosts(){
    $boosts.innerHTML = '';
    if (!state.boosts || state.boosts.length === 0){
      const el = document.createElement('div');
      el.className = 'meta';
      el.textContent = 'No active boosts';
      $boosts.appendChild(el);
      return;
    }
    state.boosts.slice().reverse().forEach(b => {
      const wrap = document.createElement('div');
      wrap.className = 'boost';
      const left = document.createElement('div');
      left.innerHTML = `<div style="font-weight:700">${b.title}</div><div class="meta">${b.perClickMul ? `×${b.perClickMul} click` : ''} ${b.perSecMul ? `×${b.perSecMul} sec` : ''}</div>`;
      const right = document.createElement('div');
      const rem = b.expires ? Math.max(0, Math.round((b.expires - Date.now()) / 1000)) + 's' : '';
      right.innerHTML = `<div class="meta">${rem}</div>`;
      wrap.appendChild(left); wrap.appendChild(right);
      $boosts.appendChild(wrap);
    });
  }

  function renderAll(){
    renderScore();
    renderUpgrades();
    renderBoosts();
    // current scenario (next expiring)
    const soon = state.boosts && state.boosts.length ? state.boosts.reduce((a,b)=>a.expires && b.expires ? (a.expires < b.expires ? a : b) : a) : null;
    $currentScenario.textContent = soon ? `${soon.title} — ${Math.max(0, Math.round((soon.expires - Date.now())/1000))}s left` : 'No active scenario';
  }

  // --- Ticking / production ---
  let lastTick = Date.now();
  function tick(){
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    if (dt <= 0) return;
    // add perSec * dt
    if (state.perSec > 0) state.score += state.perSec * dt;
    lastTick = now;
    recompute();
    renderAll();
  }

  // autosave
  setInterval(() => {
    saveState();
  }, 10000);

  // game loop tick
  setInterval(tick, 1000 / 4);

  // occasionally spawn random scenarios
  setInterval(() => {
    // 12% chance every 12s
    if (Math.random() < 0.12) spawnRandomScenario(false);
  }, 12000);

  // --- Events ---
  $bigCircle.addEventListener('click', () => {
    addScore(state.perClick);
    // gentle pop animation
    $bigCircle.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 140, easing: 'ease-out' });
  });

  // keyboard: space or enter triggers click
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      $bigCircle.click();
    }
  });

  $nextScenario.addEventListener('click', () => spawnRandomScenario(true));
  $saveBtn.addEventListener('click', saveState);
  $resetBtn.addEventListener('click', () => {
    if (!confirm('Reset game and clear save?')) return;
    resetState();
  });

  // initial compute & render
  recompute();
  renderAll();

  // expose minimal controls for console debugging
  window.GeoClicker = {
    state,
    spawnRandomScenario,
    saveState,
    resetState
  };

  // grace: compute offline progress
  (function offlineTick(){
    const now = Date.now();
    const delta = (now - (state.lastTick || now)) / 1000;
    if (delta > 1){
      // add perSec * seconds (approx)
      recompute();
      state.score += state.perSec * delta;
      state.lastTick = now;
      saveState();
    }
  })();

})();
