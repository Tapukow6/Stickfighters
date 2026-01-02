(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();
  try{ const ds = document.getElementById && document.getElementById('debug-status'); if(ds) ds.textContent = 'app.js running'; }catch(e){}

  // on-screen error capture
  const errors = [];
  window.addEventListener('error', (ev) => {
    try {
      const msg = ev.message || String(ev.error || ev);
      const where = ev.filename ? `${ev.filename}:${ev.lineno}` : '';
      errors.push(`${msg} ${where}`);
    } catch (e) {
      errors.push(String(ev));
    }
    });
  window.addEventListener('unhandledrejection', (ev) => {
    try { errors.push('PromiseRejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason))); }
    catch(e){ errors.push(String(ev)); }
  });

  // reset button rect (will be calculated on resize)
  let resetRect = {x:10,y:40,w:120,h:32};

  // Inputs for the players
  const keys1 = {left:false,right:false,up:false,shoot:false}; // player 1 (W A S D)
  const keys2 = {left:false,right:false,up:false,shoot:false}; // AI / player 2 (internal)

  // double-tap timing trackers (ms)
  const lastTap1 = {left:0, right:0};
  const lastTap2 = {left:0, right:0};
  const DOUBLE_TAP_MS = 300;

  // dash constants
  const DASH_DURATION = 0.18; // seconds
  const DASH_COOLDOWN = 0.6; // seconds
  const DASH_SPEED = 900; // px/s

  function attemptDash(owner, dir){
    if(!owner || !owner.alive) return;
    if(owner.dashCooldown && owner.dashCooldown > 0) return;
    if(owner.dashing) return;
    owner.dashing = true;
    owner.dashTime = DASH_DURATION;
    owner.dashDir = dir;
    owner.dashCooldown = DASH_COOLDOWN;
    owner.vx = dir * DASH_SPEED;
  }

  window.addEventListener('keydown', (e)=>{
    if(isOverlayVisible()) return;
    const k = e.key;
    const now = performance.now();
    const isRepeat = !!e.repeat;
    // allow Space to reset the round
    if(k === ' ' || k === 'Space' || k === 'Spacebar'){ resetGame(); return; }
    // player 1 (WASD)
    if(k === 'a'){
      keys1.left = true;
      if(!isRepeat && now - lastTap1.left <= DOUBLE_TAP_MS) attemptDash(player1, -1);
      lastTap1.left = now;
    }
    else if(k === 'd'){
      keys1.right = true;
      if(!isRepeat && now - lastTap1.right <= DOUBLE_TAP_MS) attemptDash(player1, 1);
      lastTap1.right = now;
    }
    else if(k === 'w') keys1.up = true;
    else if(k === 's') { keys1.shoot = true; if (player1.alive) spawnPunch(player1); }
    else if(k === 'i'){
      // toggle infinite ammo for player1
      player1.gunAmmo = (player1.gunAmmo === Infinity) ? 0 : Infinity;
      popups.push({x: player1.x, y: player1.y - 80, text: player1.gunAmmo === Infinity ? 'Infinite Ammo ON' : 'Infinite Ammo OFF', time: 2.2});
    }
    else if(k === 'q'){
      // toggle player1 inventory popup
      player1.invOpen = !player1.invOpen;
      e.preventDefault();
      return;
    }
    else if(k === 'o'){
      // toggle infinite ammo for player2
      player2.gunAmmo = (player2.gunAmmo === Infinity) ? 0 : Infinity;
      popups.push({x: player2.x, y: player2.y - 80, text: player2.gunAmmo === Infinity ? 'Infinite Ammo ON (P2)' : 'Infinite Ammo OFF (P2)', time: 2.2});
    }
    else if(k === '>' || k === '?'){
      // toggle player2 inventory popup (support '>' and '?')
      player2.invOpen = !player2.invOpen;
      e.preventDefault();
      return;
    }
    // arrow keys for player2 when in PvP mode
    else if(k === 'ArrowLeft'){
      keys2.left = true;
      if(!isRepeat && now - lastTap2.left <= DOUBLE_TAP_MS) attemptDash(player2, -1);
      lastTap2.left = now;
    }
    else if(k === 'ArrowRight'){
      keys2.right = true;
      if(!isRepeat && now - lastTap2.right <= DOUBLE_TAP_MS) attemptDash(player2, 1);
      lastTap2.right = now;
    }
    else if(k === 'ArrowUp'){
      keys2.up = true;
    }
    else if(k === 'ArrowDown'){
      keys2.shoot = true; if(player2.alive) spawnPunch(player2);
    }

    if(['a','d','w','s',' ','Space','Spacebar','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','i','o'].includes(k)) e.preventDefault();
  });

  window.addEventListener('keyup', (e)=>{
    if(isOverlayVisible()) return;
    const k = e.key;
    if(k === 'a') keys1.left = false;
    else if(k === 'd') keys1.right = false;
    else if(k === 'w') keys1.up = false;
    else if(k === 's') keys1.shoot = false;
    else if(k === 'ArrowLeft') keys2.left = false;
    else if(k === 'ArrowRight') keys2.right = false;
    else if(k === 'ArrowUp') keys2.up = false;
    else if(k === 'ArrowDown') keys2.shoot = false;
    if(['a','d','w','s','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k)) e.preventDefault();
  });

  // handle mouse clicks for reset button
  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    // account for potential CSS -> canvas pixel scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;
    if(x >= resetRect.x && x <= resetRect.x + resetRect.w && y >= resetRect.y && y <= resetRect.y + resetRect.h){
      resetGame();
      return;
    }

    // handle level-up choice clicks for player1 and player2
    // player1 buttons (same layout as drawHealthBars)
    const pad = 12; const h = 16; const bh = 22; const bw = 72; const gap = 8;
    const p1bx = pad + 6; const p1by = pad + h + 34; // match drawHealthBars layout
    if(player1.pendingLevelUps && player1.pendingLevelUps > 0){
      // HP button
      if(x >= p1bx && x <= p1bx + bw && y >= p1by && y <= p1by + bh){ applyLevelChoice(player1, 'hp'); return; }
      // DMG button
      if(x >= p1bx + bw + gap && x <= p1bx + bw + gap + bw && y >= p1by && y <= p1by + bh){ applyLevelChoice(player1, 'dmg'); return; }
    }
    // player2 level-up choice clicks (right HUD)
    const p2bx = canvas.width - pad - 200 + 6; const p2by = pad + h + 34;
    if(player2.pendingLevelUps && player2.pendingLevelUps > 0){
      // HP button
      if(x >= p2bx && x <= p2bx + bw && y >= p2by && y <= p2by + bh){ applyLevelChoice(player2, 'hp'); return; }
      // DMG button
      if(x >= p2bx + bw + gap && x <= p2bx + bw + gap + bw && y >= p2by && y <= p2by + bh){ applyLevelChoice(player2, 'dmg'); return; }
    }
  });

  // world / players
  // scale factor for world rendering (less than 1 = zoomed out)
  const ZOOM = 0.7;
  // groundY is in world coordinates (we render the world at a larger virtual size
  // then scale it by ZOOM to fill the canvas). Compute initial ground in world units.
  let groundY = Math.max(120, Math.round(canvas.height / ZOOM) - 120);
  const GRAV = 700; // px/s^2
  const JUMP_V = 520; // px/s
  const FEET_OFFSET = 46; // pixels from player.y to feet
  const BASE_HP = 100;
  const BASE_DAMAGE = 10;

  // Stats are driven by base values plus chosen bonuses only; leveling itself
  // no longer grants automatic +1 to both stats.
  function getMaxHp(pl){ return BASE_HP + (pl.bonusHp || 0); }
  function getDamage(pl){ return BASE_DAMAGE + (pl.bonusDamage || 0); }

  // round control: prevent multiple resets and allow a brief pause when someone dies
  let roundOver = false;
  function endRound(winner){
    if(roundOver) return;
    roundOver = true;
    // small delay so death/award visuals register before reset
    setTimeout(()=>{
      roundOver = false;
      resetGame();
    }, 1100);
  }

  const player1 = {id:1, x:120, y:groundY - FEET_OFFSET, vx:0, vy:0, speed:240, grounded:true, color:'#ffffff', level:1, xp:0, hp:BASE_HP, alive:true, dashing:false, dashTime:0, dashCooldown:0, dashDir:0, facing:1, punching:0, punchCooldown:0, pendingLevelUps:0, bonusHp:0, bonusDamage:0, ai:false, _aiTimer:0, gunAmmo:0, gunCount:0, gunDamage:10};
  // player2 will be an AI-controlled enemy
  const player2 = {id:2, x:Math.max(220, Math.round(canvas.width / ZOOM) - 120), y:groundY - FEET_OFFSET, vx:0, vy:0, speed:240, grounded:true, color:'#ffd36a', level:1, xp:0, hp:BASE_HP, alive:true, dashing:false, dashTime:0, dashCooldown:0, dashDir:0, facing:-1, punching:0, punchCooldown:0, pendingLevelUps:0, bonusHp:0, bonusDamage:0, ai:true, aiLevel:'normal', _aiTimer:0, gunAmmo:0, gunCount:0, gunDamage:10};

  // punches (short melee hitboxes)
  const punches = [];
  // spikes that pop out of platforms
  const spikes = [];
  // chests that drop periodically
  const chests = [];
  // bullets (ranged shots) and homing missiles
  const bullets = [];
  const missiles = [];
  // floating popup messages (world coordinates)
  const popups = [];
  // obstacles (platforms)
  let obstacles = [];
  function buildObstacles(){
    // Create randomized, non-overlapping platforms each time this is called.
    const w = Math.round(canvas.width / ZOOM);
    obstacles = [];
    const centerX = Math.round(w * 0.5);

    // always keep a central pillar near ground
    obstacles.push({x: centerX - 24, y: groundY - 100, w: 48, h: 100});

    // helper to test overlap with a buffer; also avoid spawning too close to players
    function overlapsAny(px, py, pw, bufferX=80, bufferY=120){
      // avoid near player positions to prevent trapping
      const PLAYER_SAFE_X = 180; const PLAYER_SAFE_Y = 160;
      const centerXPlat = px + pw * 0.5;
      try{
        if(typeof player1 !== 'undefined'){
          if(Math.abs(centerXPlat - player1.x) < PLAYER_SAFE_X && Math.abs(py - player1.y) < PLAYER_SAFE_Y) return true;
        }
        if(typeof player2 !== 'undefined'){
          if(Math.abs(centerXPlat - player2.x) < PLAYER_SAFE_X && Math.abs(py - player2.y) < PLAYER_SAFE_Y) return true;
        }
      }catch(e){ /* ignore if players not ready */ }
      for(const ob of obstacles){
        const noOverlap = (px + pw + bufferX < ob.x) || (ob.x + ob.w + bufferX < px);
        if(!noOverlap){
          if(Math.abs(py - ob.y) < bufferY) return true;
        }
      }
      return false;
    }

    // target total platforms (including central pillar), attempt to place randomly
    const TARGET = 13;
    let attempts = 0;
    while(obstacles.length < TARGET && attempts < 800){
      attempts++;
      const pw = 100 + Math.floor(Math.random() * 90); // 100-190
      const px = Math.floor(40 + Math.random() * (w - pw - 80));
      // bias y so more platforms are near the ground: use pow for skew
      const t = Math.random();
      const py = Math.floor(groundY - 60 - Math.pow(t, 1.2) * Math.max(120, groundY - 220));
      if(py < 60) continue; // avoid very top
      if(!overlapsAny(px, py, pw)){
        obstacles.push({x: px, y: py, w: pw, h: 18});
      }
    }

    // ensure at least 10 platforms are near the arena (close to ground)
    const VISIBLE_RANGE = 500;
    let visible = obstacles.filter(ob => ob.y >= groundY - VISIBLE_RANGE && ob.y <= groundY);
    let safe = 0;
    while(visible.length < 10 && safe < 300){
      safe++;
      const pw = 120 + Math.floor(Math.random() * 60);
      const px = Math.floor(40 + Math.random() * (w - pw - 80));
      const py = groundY - Math.floor(40 + Math.random() * 260);
      if(py < 60) continue;
      if(!overlapsAny(px, py, pw, 60, 100)){
        obstacles.push({x: px, y: py, w: pw, h: 18});
        visible = obstacles.filter(ob => ob.y >= groundY - VISIBLE_RANGE && ob.y <= groundY);
      }
    }

    // keep at most one platform at the very top
    const TOP_LIMIT = 80;
    const topCandidates = obstacles.filter(ob => ob.y <= TOP_LIMIT);
    if(topCandidates.length > 1){
      let keep = topCandidates.reduce((a,b)=>{
        const ax = a.x + a.w/2, bx = b.x + b.w/2;
        return Math.abs(ax - centerX) < Math.abs(bx - centerX) ? a : b;
      });
      obstacles = obstacles.filter(ob => !(ob.y <= TOP_LIMIT && ob !== keep));
    }
  }
  // create spikes on a random subset of platforms (skip tall pillars)
  function spawnSpikes(){
    spikes.length = 0;
    for(let i=0;i<obstacles.length;i++){
      const ob = obstacles[i];
      // higher chance to have spikes
      const spawnChance = 0.75;
      if(Math.random() > spawnChance) continue;
      // determine number of spikes across this platform (1-4)
      const count = Math.min(4, Math.max(1, Math.floor(ob.w / 100)));
      for(let j=0;j<count;j++){
        const sx = ob.x + ob.w * ((j+1)/(count+1));
        const sy = ob.y - 6; // top surface
        // random period around ~5s (3-7s) and out duration around ~1s (0.6-1.4s)
        const period = 3 + Math.random() * 4;
        const outDuration = 0.6 + Math.random() * 0.8;
        spikes.push({obIndex:i, x:sx, y:sy, out:false, timer: Math.random()*period, period: period, outDuration: outDuration, outTime:0, hit:{}});
      }
    }
  }

  // spawn a chest on a random platform (or on ground) for players to pick up
  let chestTimer = 0;
  // next chest interval in seconds (randomized between 3 and 7)
  let chestInterval = 3 + Math.random() * 4;
  function spawnChest(){
    const pickIdx = Math.floor(Math.random() * obstacles.length);
    let cx = 120, cy = groundY - FEET_OFFSET;
    if(obstacles.length > 0 && Math.random() < 0.9){ const ob = obstacles[pickIdx]; cx = ob.x + ob.w*0.5; cy = ob.y - FEET_OFFSET; }
    // larger, more decorative chest (bigger size)
    const w = 80; const h = 64; const pickupRadius = 110;
    chests.push({x: cx, y: cy, w: w, h: h, pickupRadius: pickupRadius, timer: 0});
  }

  function openChest(player, chest){
    if(!player || !player.alive) return;
    // choose reward: heal, homing missile (target other), gun, or speed boost
    const choices = ['heal','missile','gun','speed'];
    const pick = choices[Math.floor(Math.random() * choices.length)];
    let popupMsg = '';
    if(pick === 'heal'){
      player.hp = Math.min(getMaxHp(player), (player.hp || 0) + 20);
      popupMsg = 'Healed +20 HP';
    } else if(pick === 'missile'){
      const target = player.id === 1 ? player2 : player1;
      spawnMissile(player, target);
      popupMsg = 'Launched homing missile!';
    } else if(pick === 'gun'){
      // grant a gun: +3 ammo and increase gun count
      player.gunAmmo = (player.gunAmmo || 0) + 3;
      player.gunCount = (player.gunCount || 0) + 1;
      player.gunDamage = 10;
      popupMsg = 'Picked up Gun (+3 ammo)';
    } else if(pick === 'speed'){
      player._speedBase = player._speedBase || player.speed;
      player.speed = (player._speedBase || player.speed) * 1.3;
      player._speedBoostTime = 6.0; // seconds
      popupMsg = 'Speed x1.3 (6s)';
    }
    // add a floating popup above the player
    if(popupMsg){ popups.push({x: player.x, y: player.y - 80, text: popupMsg, time: 2.2}); }
  }

  function drawBackground(){
    const worldW = Math.round(canvas.width / ZOOM);
    const worldH = Math.round(canvas.height / ZOOM);
    // sky
    const sky = ctx.createLinearGradient(0,0,0,worldH);
    sky.addColorStop(0, '#9bd3ff');
    sky.addColorStop(0.6, '#dff3ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,worldW,worldH);

    // sun
    const sx = worldW - 120, sy = 100, sr = 64;
    const sunGrad = ctx.createRadialGradient(sx,sy,8,sx,sy,sr);
    sunGrad.addColorStop(0, '#fff8b8');
    sunGrad.addColorStop(0.4, '#ffe58a');
    sunGrad.addColorStop(1, 'rgba(255,210,60,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill();

    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    drawCloud(160,90,40);
    drawCloud(320,70,36);
    drawCloud(520,110,30);

    // grass
    const grassH = worldH - groundY + 20;
    const gGrad = ctx.createLinearGradient(0,groundY,0,worldH);
    gGrad.addColorStop(0, '#62c55e');
    gGrad.addColorStop(1, '#2f8a2f');
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, groundY, worldW, grassH);

    // blades
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for(let i=0;i<worldW;i+=16){ ctx.beginPath(); ctx.moveTo(i, groundY+6); ctx.lineTo(i+6, groundY-6); ctx.stroke(); }
  }

  function resetGame(){
    // reset players to starting positions and state
    player1.x = 120; player1.y = groundY - FEET_OFFSET; player1.vx = 0; player1.vy = 0; player1.hp = getMaxHp(player1); player1.alive = true; player1.dashing = false; player1.dashTime = 0; player1.dashCooldown = 0; player1.punching = 0; player1.facing = 1;
    player2.x = Math.max(220, Math.round(canvas.width / ZOOM) - 120); player2.y = groundY - FEET_OFFSET; player2.vx = 0; player2.vy = 0; player2.hp = getMaxHp(player2); player2.alive = true; player2.dashing = false; player2.dashTime = 0; player2.dashCooldown = 0; player2.punching = 0; player2.facing = -1; player2.aiLevel = player2.aiLevel || 'normal';
    // clear active attacks
    punches.length = 0;
    // clear chests, projectiles and popups on reset
    chests.length = 0;
    bullets.length = 0;
    missiles.length = 0;
    popups.length = 0;
    // reset chest timer/interval
    chestTimer = 0;
    chestInterval = 3 + Math.random() * 4;
    // rebuild obstacles and spikes
    buildObstacles();
    spawnSpikes();
    // clear errors
    errors.length = 0;
    // allow rounds again
    roundOver = false;
  }

  function spawnPunch(owner){
    if(!owner || !owner.alive) return;
    if(owner.punchCooldown && owner.punchCooldown > 0) return;
    // if owner has ranged ammo, fire a bullet instead
    if(owner.gunAmmo && owner.gunAmmo > 0){ spawnBullet(owner); return; }
    const dir = (owner.facing !== undefined && owner.facing !== 0) ? owner.facing : (owner.vx < 0 ? -1 : 1);
    const px = owner.x + dir * 34;
    const py = owner.y - 28;
    const life = 0.13;
    punches.push({x: px, y: py, dir: dir, life: life, owner: owner.id});
    owner.punching = life;
    owner.punchCooldown = 0.5;
  }

  function spawnBullet(owner){
    if(!owner || !owner.alive) return;
    // allow infinite ammo when owner.gunAmmo is Infinity
    if(Number.isFinite(owner.gunAmmo) && owner.gunAmmo <= 0) return;
    const dir = (owner.facing !== undefined && owner.facing !== 0) ? owner.facing : (owner.vx < 0 ? -1 : 1);
    const speed = 720;
    const bx = owner.x + dir * 28;
    const by = owner.y - 30;
    bullets.push({x: bx, y: by, vx: dir * speed, vy: 0, life: 2.0, owner: owner.id, damage: 10});
    // decrement ammo only if it's a finite number (Infinity means unlimited)
    if(Number.isFinite(owner.gunAmmo)){
      owner.gunAmmo = Math.max(0, owner.gunAmmo - 1);
      // update gunCount: each gun represents 3 ammo; recalculate remaining guns
      owner.gunCount = Math.max(0, Math.ceil((owner.gunAmmo || 0) / 3));
    } else if(owner.gunAmmo === Infinity){
      owner.gunCount = Infinity;
    }
  }

  function spawnMissile(owner, target){
    if(!owner || !owner.alive || !target || !target.alive) return;
    const mx = owner.x; const my = owner.y - 30;
    missiles.push({x: mx, y: my, vx: 0, vy: 0, life: 6.0, owner: owner.id, targetId: target.id, speed: 420, damage: 20});
  }

  function applyLevelChoice(player, choice){
    if(!player || player.pendingLevelUps <= 0) return;
    if(choice === 'hp'){
      // grant +10 max HP
      player.bonusHp = (player.bonusHp || 0) + 10;
      // heal up to 10 on level
      player.hp = Math.min(getMaxHp(player), (player.hp || 0) + 10);
    } else if(choice === 'dmg'){
      // grant +1 damage
      player.bonusDamage = (player.bonusDamage || 0) + 1;
    }
    player.pendingLevelUps = Math.max(0, player.pendingLevelUps - 1);
  }

  // initial obstacles/spikes
  buildObstacles();
  spawnSpikes();

  // helper: find index of platform under a position (returns -1 for ground)
  function platformUnder(x, y){
    for(let i=0;i<obstacles.length;i++){
      const ob = obstacles[i];
      if(x >= (ob.x - 18) && x <= (ob.x + ob.w + 18) && Math.abs((y + FEET_OFFSET) - ob.y) < 12) return i;
    }
    return -1;
  }

  // helper: decide whether AI should jump toward a target coordinate
  function aiShouldJump(pl, targetX, targetY){
    if(!pl.grounded) return false;
    const horiz = Math.abs(targetX - pl.x);
    const vertDiff = pl.y - targetY; // positive if target is higher (smaller y)
    // jump if the target is meaningfully higher
    if(vertDiff > 20) return true;
    // if target is roughly same height and close horizontally, no jump needed
    if(Math.abs(vertDiff) < 40 && horiz < 90) return false;
    // avoid jumping for long horizontal distances unless the target is higher
    return false;
  }

  // helper: detect if an obstacle is directly blocking movement in `dir` (1 = right, -1 = left)
  function isObstacleBlocking(pl, dir){
    const checkAhead = 48; // px ahead to check
    const bodyTop = pl.y - 40; const bodyBottom = pl.y + FEET_OFFSET;
    for(const ob of obstacles){
      const left = ob.x; const right = ob.x + ob.w;
      if(dir > 0){
        const gap = left - (pl.x + 18);
        if(gap >= 0 && gap <= checkAhead){
          // vertical overlap
          if(bodyBottom > ob.y - 8 && bodyTop < ob.y + ob.h + 8) return true;
        }
      } else {
        const gap = (pl.x - 18) - right;
        if(gap >= 0 && gap <= checkAhead){ if(bodyBottom > ob.y - 8 && bodyTop < ob.y + ob.h + 8) return true; }
      }
    }
    return false;
  }

  // main menu / lobby wiring (DOM exists because script is placed at end of body)
  let gameMode = null; // reserved for menu use
  const menuEl = document.getElementById('menu');
  const lobbyEl = document.getElementById('lobby');
  const btnTwo = document.getElementById('btn-two-player');
  const btnBot = document.getElementById('btn-vs-bot');
  const btnLobbyBack = document.getElementById('lobby-back');
  const btnLobbyStart = document.getElementById('lobby-start');
  const inpP1 = document.getElementById('p1-name');
  const inpP2 = document.getElementById('p2-name');
  const chkBot = document.getElementById('p2-bot');
  const selDiff = document.getElementById('bot-diff');

  // helper: return true if any UI overlay (main menu or lobby) is visible
  function isOverlayVisible(){
    try{
      const mainMenuEl = document.getElementById('main-menu');
      if(mainMenuEl){ const ds = window.getComputedStyle(mainMenuEl); if(ds && ds.display !== 'none' && ds.visibility !== 'hidden') return true; }
      if(lobbyEl){ const ds2 = window.getComputedStyle(lobbyEl); if(ds2 && ds2.display !== 'none' && ds2.visibility !== 'hidden') return true; }
    }catch(e){}
    return false;
  }

  function openLobby(mode){
    gameMode = mode;
    if(menuEl) menuEl.style.display = 'none';
    if(lobbyEl) lobbyEl.style.display = 'block';
    document.body.classList.add('menu-visible');
    // populate defaults
    if(inpP1) inpP1.value = inpP1.value || 'P1';
    if(inpP2) inpP2.value = inpP2.value || 'P2';
    if(chkBot) chkBot.checked = (mode === 'bot');
    if(inpP2) inpP2.disabled = chkBot && chkBot.checked;
  }

  function closeLobby(){
    if(lobbyEl) lobbyEl.style.display = 'none';
    if(menuEl) menuEl.style.display = 'block';
    document.body.classList.remove('menu-visible');
  }

  function startFromLobby(){
    // apply lobby selections
    const useBot = chkBot && chkBot.checked;
    const diff = selDiff ? selDiff.value : 'normal';
    player1.ai = false;
    player1.name = inpP1 ? inpP1.value : 'P1';
    // configure player2 according to lobby selections / gameMode
    if(gameMode === 'bot' || useBot){
      player2.ai = true;
      player2.name = inpP2 ? inpP2.value : 'P2';
    } else {
      player2.ai = false;
      player2.name = inpP2 ? inpP2.value : 'P2';
      // ensure manual player2 doesn't inherit previous AI input or momentum
      keys2.left = keys2.right = keys2.up = keys2.shoot = false;
      player2.vx = 0; player2.dashing = false; player2.dashTime = 0; player2.dashCooldown = 0;
    }
    if(lobbyEl) lobbyEl.style.display = 'none';
    document.body.classList.remove('menu-visible');
    resetGame();
  }

  if(btnTwo) btnTwo.addEventListener('click', ()=> openLobby('two'));
  if(btnBot) btnBot.addEventListener('click', ()=> openLobby('bot'));
  if(btnLobbyBack) btnLobbyBack.addEventListener('click', ()=> closeLobby());
  if(btnLobbyStart) btnLobbyStart.addEventListener('click', ()=> startFromLobby());
  if(chkBot) chkBot.addEventListener('change', ()=> { if(inpP2) inpP2.disabled = chkBot.checked; });

  function drawCloud(cx,cy,size){
    ctx.beginPath();
    ctx.arc(cx,cy,size*0.6,Math.PI*0.5,Math.PI*1.5);
    ctx.arc(cx+size*0.6,cy-size*0.3,size*0.7,Math.PI*1.0,Math.PI*1.85);
    ctx.arc(cx+size*1.05,cy+size*0.1,size*0.55,Math.PI*1.2,Math.PI*2.2);
    ctx.closePath(); ctx.fill();
  }

  function drawStick(x,y,color='#fff', facing=1, punching=0){
    const headR = 14;
    ctx.save(); ctx.translate(x,y);
    // shadow
    ctx.beginPath(); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.ellipse(2,62,22,6,0,0,Math.PI*2); ctx.fill();
    // head
    ctx.beginPath(); ctx.fillStyle = color; ctx.arc(0,-40,headR,0,Math.PI*2); ctx.fill();
    // eyes indicating facing direction
    try{
      const eyeForward = 6 * facing;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(-6 + eyeForward, -44, 2.6, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(6 + eyeForward, -44, 2.6, 0, Math.PI*2); ctx.fill();
    }catch(e){ /* ignore drawing errors */ }
    // body/arms/legs
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0,-26); ctx.lineTo(0,12); ctx.stroke();
    // arms: if punching, extend the fist on the facing side
    if(punching && punching > 0){
      const reach = 34;
      if(facing > 0){
        // left arm neutral
        ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(-18,-6); ctx.stroke();
        // right arm extended
        ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(reach,-6); ctx.stroke();
        // draw fist
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(reach, -6, 6, 0, Math.PI*2); ctx.fill();
      } else {
        // right arm neutral
        ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(18,-6); ctx.stroke();
        // left arm extended
        ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(-reach,-6); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-reach, -6, 6, 0, Math.PI*2); ctx.fill();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(-28,-6); ctx.lineTo(28,-6); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0,12); ctx.lineTo(-18,46); ctx.moveTo(0,12); ctx.lineTo(18,46); ctx.stroke();
    ctx.restore();
  }

  

  function drawObstacles(){
    ctx.save();
    for(const ob of obstacles){
      // platform base
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
      // grassy top
      ctx.fillStyle = '#2f8a2f';
      ctx.fillRect(ob.x, ob.y-6, ob.w, 6);
      // subtle edge
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
    }
    ctx.restore();
  }

  function drawChestsBulletsAndMissiles(){
    // chests (fancier): bobbing, glow, lid + lock
    for(const c of chests){
      const bob = Math.sin(c.timer * 2.0) * 4; // subtle bob
      ctx.save(); ctx.translate(c.x, c.y + bob);
      // shadow
      ctx.globalAlpha = 0.5; ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, c.h*0.5 + 6, c.w*0.6, 8, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
      // glow/ring beneath chest
      const glow = ctx.createRadialGradient(0, 0, c.w*0.15, 0, 0, c.w*0.9);
      glow.addColorStop(0, 'rgba(255,220,120,0.18)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(0, c.h*0.15, c.w*0.9, c.h*0.5, 0, 0, Math.PI*2); ctx.fill();
      // chest base (wood)
      ctx.fillStyle = '#7a4f2a'; ctx.fillRect(-c.w*0.5, -c.h*0.5, c.w, c.h*0.6);
      // gold band
      ctx.fillStyle = '#ffd66a'; ctx.fillRect(-c.w*0.5, -c.h*0.5 + 6, c.w, 6);
      // lid (slightly open when timer pulses)
      const lidTilt = Math.sin(c.timer * 3.2) * 6; // small tilt effect
      ctx.save(); ctx.translate(0, -c.h*0.18); ctx.rotate(-lidTilt * Math.PI/180);
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-c.w*0.5, -c.h*0.25, c.w, c.h*0.28);
      ctx.restore();
      // lock / keyhole
      ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(0, -c.h*0.04, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(-3, -c.h*0.02, 6, 8);
      // subtle highlight on top
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(-c.w*0.5 + 4, -c.h*0.5 + 6, c.w - 8, 6);
      ctx.restore();
    }
    // bullets
    for(const b of bullets){ ctx.save(); ctx.fillStyle = '#fff69b'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
    // missiles
    for(const m of missiles){ ctx.save(); ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
    // popups (floating text in world space)
    for(const pp of popups){
      ctx.save(); ctx.translate(pp.x, pp.y);
      ctx.globalAlpha = Math.min(1, pp.time / 1.2);
      const pad = 8; ctx.font = '14px sans-serif'; ctx.textBaseline = 'middle';
      const w = Math.max(60, ctx.measureText(pp.text).width + pad*2);
      // rounded background
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.moveTo(-w/2+6, -14); ctx.arcTo(w/2-6, -14, w/2-6, 14, 6); ctx.arcTo(w/2-6, 14, -w/2+6, 14, 6); ctx.arcTo(-w/2+6, 14, -w/2+6, -14, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(pp.text, -ctx.measureText(pp.text).width/2, 0);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  const DAMAGE = 10;

  function awardXP(winner){
    if(!winner) return;
    winner.xp = (winner.xp || 0) + 10;
    // level up while enough xp
    while(winner.xp >= winner.level * 10){
      winner.xp -= winner.level * 10;
      winner.level += 1;
      // grant a pending level-up; player chooses +10 HP or +1 damage
      winner.pendingLevelUps = (winner.pendingLevelUps || 0) + 1;
    }
  }

  function drawHealthBars(){
    const w = 200, h = 16, pad = 12;
    // player1 left
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(pad, pad, w, h);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(pad, pad, Math.max(0, (player1.hp/getMaxHp(player1)) * w), h);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(`P1: ${player1.hp} HP`, pad + 6, pad + h/2);
    // xp / level
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '11px sans-serif';
    const xpNeed1 = player1.level * 10;
    ctx.fillText(`Lv${player1.level} XP ${player1.xp}/${xpNeed1}`, pad + 6, pad + h + 14);
    // ammo & guns display for player1 (hide details unless inventory open)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '11px sans-serif';
    const ammo1 = player1.invOpen ? ((player1.gunAmmo === Infinity) ? '∞' : (player1.gunAmmo || 0)) : '--';
    const guns1 = player1.invOpen ? (player1.gunCount || 0) : '--';
    ctx.fillText(`Ammo: ${ammo1}  Guns: ${guns1}`, pad + 6, pad + h + 28);
    // vertical inventory slots (left side) styled like a hotbar — centered vertically
    (function(){
      const maxDisplay = 6;
      const slotW = 26; const slotH = 18; const gap = 8;
      const invX = 12; // near left edge
      const show = Math.min(guns1, maxDisplay);
      if(show <= 0){ if(guns1 > maxDisplay){ const overflowY = Math.round(canvas.height * 0.5); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '12px sans-serif'; ctx.fillText(`+${guns1 - maxDisplay}`, invX + slotW + 8, overflowY); } return; }
      const totalH = show * slotH + Math.max(0, show - 1) * gap;
      const invYTop = Math.round(canvas.height * 0.5 - totalH / 2);
      for(let i=0;i<show;i++){
        const iy = invYTop + i * (slotH + gap);
        roundRect(ctx, invX, iy, slotW, slotH, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
        roundRect(ctx, invX + 2, iy + 2, slotW - 4, slotH - 4, 3);
        const grad = ctx.createLinearGradient(0, iy + 2, 0, iy + slotH - 2);
        grad.addColorStop(0, 'rgba(255,255,255,0.04)'); grad.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = grad; ctx.fill();
        roundRect(ctx, invX + 1, iy + 1, slotW - 2, slotH - 2, 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#ffd66a'; ctx.fillRect(invX + 6, iy + 5, slotW - 12, slotH - 10);
      }
      if(guns1 > maxDisplay){ ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '12px sans-serif'; ctx.fillText(`+${guns1 - maxDisplay}`, invX + slotW + 8, invYTop + totalH + 6); }
    })();
    // level-up choice buttons for player1
    if(player1.pendingLevelUps && player1.pendingLevelUps > 0){
      const bx = pad + 6; const by = pad + h + 34; const bw = 72; const bh = 22; const gap = 8;
      // HP button
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('+HP', bx + 10, by + bh/2 + 4);
      // DMG button
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx + bw + gap, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.fillText('+DMG', bx + bw + gap + 10, by + bh/2 + 4);
      // draw notice
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '11px sans-serif';
      ctx.fillText('Choose +1 for this level', bx, by - 14);
    }

    // player2 right (status)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width - pad - w, pad, w, h);
    ctx.fillStyle = '#ffd36a';
    ctx.fillRect(canvas.width - pad - w, pad, Math.max(0, (player2.hp/getMaxHp(player2)) * w), h);
    ctx.fillStyle = '#000'; ctx.font = '12px sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(`P2: ${player2.hp} HP`, canvas.width - pad - w + 6, pad + h/2);
    // xp / level
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.font = '11px sans-serif';
    const xpNeed2 = player2.level * 10;
    ctx.fillText(`Lv${player2.level} XP ${player2.xp}/${xpNeed2}`, canvas.width - pad - w + 6, pad + h + 14);
    // ammo & guns display for player2 (hide details unless inventory open)
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.font = '11px sans-serif';
    const ammo2 = player2.invOpen ? ((player2.gunAmmo === Infinity) ? '∞' : (player2.gunAmmo || 0)) : '--';
    const guns2 = player2.invOpen ? (player2.gunCount || 0) : '--';
    ctx.fillText(`Ammo: ${ammo2}  Guns: ${guns2}`, canvas.width - pad - w + 6, pad + h + 28);
    // vertical inventory slots (right side) styled like a hotbar — centered vertically
    (function(){
      const maxDisplay = 6;
      const slotW = 26; const slotH = 18; const gap = 8;
      const invX = canvas.width - 12 - slotW; // near right edge
      const show = Math.min(guns2, maxDisplay);
      if(show <= 0){ if(guns2 > maxDisplay){ const overflowY = Math.round(canvas.height * 0.5); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '12px sans-serif'; ctx.fillText(`+${guns2 - maxDisplay}`, invX - 8, overflowY); } return; }
      const totalH = show * slotH + Math.max(0, show - 1) * gap;
      const invYTop = Math.round(canvas.height * 0.5 - totalH / 2);
      for(let i=0;i<show;i++){
        const iy = invYTop + i * (slotH + gap);
        roundRect(ctx, invX, iy, slotW, slotH, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
        roundRect(ctx, invX + 2, iy + 2, slotW - 4, slotH - 4, 3);
        const grad = ctx.createLinearGradient(0, iy + 2, 0, iy + slotH - 2);
        grad.addColorStop(0, 'rgba(255,255,255,0.04)'); grad.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = grad; ctx.fill();
        roundRect(ctx, invX + 1, iy + 1, slotW - 2, slotH - 2, 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#ffd36a'; ctx.fillRect(invX + 6, iy + 5, slotW - 12, slotH - 10);
      }
      if(guns2 > maxDisplay){ ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '12px sans-serif'; ctx.fillText(`+${guns2 - maxDisplay}`, invX - 8, invYTop + totalH + 6); }
    })();
    // level-up choice buttons for player2
    if(player2.pendingLevelUps && player2.pendingLevelUps > 0){
      const bx = canvas.width - pad - w + 6; const by = pad + h + 34; const bw = 72; const bh = 22; const gap = 8;
      // HP button
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('+HP', bx + 10, by + bh/2 + 4);
      // DMG button
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx + bw + gap, by, bw, bh);
      ctx.fillStyle = '#fff'; ctx.fillText('+DMG', bx + bw + gap + 10, by + bh/2 + 4);
      // draw notice
      ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.font = '11px sans-serif';
      ctx.fillText('Choose +1 for this level', bx, by - 14);
    }
    // draw inventory strips if open
    try{
      if(player1.invOpen) drawInventoryStrip(player1, 'left');
      if(player2.invOpen) drawInventoryStrip(player2, 'right');
    }catch(e){}
  }

  // helper to draw rounded rectangles (path only)
  function roundRect(ctx, x, y, w, h, r){
    const radius = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // draw a vertical inventory strip on the left or right side with 6 slots
  function drawInventoryStrip(player, side){
    const cols = 1; const rows = 6;
    const slotW = 42; const slotH = 30; const gap = 10;
    const stripW = slotW + 24;
    const x = (side === 'left') ? 8 : (canvas.width - 8 - stripW);
    // compute total height and top to center vertically
    const totalH = rows * slotH + (rows - 1) * gap;
    const invYTop = Math.round(canvas.height * 0.5 - totalH / 2);
    // background strip
    roundRect(ctx, x, invYTop - 12, stripW, totalH + 24, 8); ctx.fillStyle = 'rgba(6,6,10,0.6)'; ctx.fill();
    // draw slots down the strip
    let have = player.gunCount || 0;
    for(let i=0;i<rows;i++){
      const iy = invYTop + i * (slotH + gap);
      const sx = x + 12; const sy = iy;
      roundRect(ctx, sx, sy, slotW, slotH, 6); ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fill();
      roundRect(ctx, sx + 2, sy + 2, slotW - 4, slotH - 4, 5); const grad = ctx.createLinearGradient(0, sy + 2, 0, sy + slotH - 2); grad.addColorStop(0, 'rgba(255,255,255,0.03)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; roundRect(ctx, sx + 1, sy + 1, slotW - 2, slotH - 2, 5); ctx.stroke();
      if(i < have){ ctx.fillStyle = '#ffd66a'; ctx.fillRect(sx + 8, sy + 6, slotW - 16, slotH - 12); }
    }
    if(have > rows){ ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '12px sans-serif'; const ox = (side === 'left') ? x + stripW + 6 : x - 6; const alignX = (side === 'left') ? 'left' : 'right'; ctx.textAlign = (side === 'left') ? 'left' : 'right'; ctx.fillText(`+${have - rows}`, ox, invYTop + totalH + 6); ctx.textAlign = 'start'; }
  }

  function drawErrors(){
    if(!errors || errors.length === 0) return;
    ctx.save();
    // draw over HUD so visible
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(8, canvas.height - 120, canvas.width - 16, 112);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textBaseline = 'top';
    for(let i=0;i<Math.min(6, errors.length); i++){
      ctx.fillText(errors[errors.length-1-i].toString().slice(0,200), 16, canvas.height - 116 + i*18);
    }
    ctx.restore();
  }

  function loop(now){
    const dt = Math.min(0.05, (now - (loop.last||now))/1000); loop.last = now;
    // world width/height in world coordinates (virtual size before scaling)
    const worldW = Math.round(canvas.width / ZOOM);
    const worldH = Math.round(canvas.height / ZOOM);
    try {
    // simple AI input decisions (set keys for AI-controlled players)
    [[player1, keys1], [player2, keys2]].forEach(([pl, ks]) => {
      if(!pl.ai || !pl.alive) return;
      const other = pl.id === 1 ? player2 : player1;
      pl._aiTimer = (pl._aiTimer || 0) + dt;
      // if AI has pending level-ups, choose upgrades automatically
      if(pl.pendingLevelUps && pl.pendingLevelUps > 0){
        while(pl.pendingLevelUps > 0){
          // prefer HP when below half health, otherwise prefer damage
          if(pl.hp < getMaxHp(pl) * 0.5) applyLevelChoice(pl, 'hp');
          else applyLevelChoice(pl, 'dmg');
        }
      }
      // clear AI inputs by default
      ks.left = ks.right = ks.up = ks.shoot = false;

      // If this is the bot (player2) and low on HP, enter flee/parkour mode
      const FLEE_JUMP_REACH = 380;
      if(pl.id === 2 && pl.hp < getMaxHp(pl) * 0.5){
        let dirAway = (pl.x < other.x) ? -1 : 1; // run away from opponent
        if(dirAway < 0) { ks.left = true; ks.right = false; } else { ks.right = true; ks.left = false; }
        // attempt to dash away when on ground and dash is available
        if(pl.grounded && !pl.dashing && pl.dashCooldown <= 0){ attemptDash(pl, dirAway); }

        // if the bot is at a platform/world edge while being chased, flip direction and keep running
        const EDGE_MARGIN = 36; const PAD = 20;
        const curPlatIdx = platformUnder(pl.x, pl.y);
        let atEdge = false;
        if(curPlatIdx !== -1){
          const ob = obstacles[curPlatIdx];
          if((pl.x - ob.x) < EDGE_MARGIN && dirAway < 0) atEdge = true;
          if((ob.x + ob.w - pl.x) < EDGE_MARGIN && dirAway > 0) atEdge = true;
        } else {
          const worldW = Math.round(canvas.width / ZOOM);
          if(pl.x < PAD + EDGE_MARGIN && dirAway < 0) atEdge = true;
          if(pl.x > worldW - PAD - EDGE_MARGIN && dirAway > 0) atEdge = true;
        }
        const distToOther = Math.hypot(pl.x - other.x, pl.y - other.y);
        // if the pursuer is very close while fleeing, retaliate with a punch
        if(distToOther < 90 && pl.punching === 0 && pl.punchCooldown <= 0){
          pl.facing = (other.x > pl.x) ? 1 : -1;
          spawnPunch(pl);
        }
        if(atEdge){
          // if very close and cornered, sometimes perform a dash-attack toward the player
          if(distToOther < 120 && pl.grounded && pl.dashCooldown <= 0 && Math.random() < 0.45){
            const toward = (other.x > pl.x) ? 1 : -1;
            attemptDash(pl, toward);
          } else if(distToOther < 340){
            // reverse and sprint away instead of staying stuck at edge
            dirAway = -dirAway;
            if(dirAway < 0) { ks.left = true; ks.right = false; } else { ks.right = true; ks.left = false; }
            if(pl.grounded && pl.dashCooldown <= 0){ attemptDash(pl, dirAway); }
          }
          // continue fleeing in new direction (skip aggressive pursuit logic)
        }

        // parkour: pick a platform in the away direction and plan a reachable path to it
        const startIdx = platformUnder(pl.x, pl.y);
        const JUMP_HORIZ = FLEE_JUMP_REACH; const MAX_CLIMB = 220;
        // if too close to the player, be more aggressive about creating distance
        const MIN_SAFE_DIST = 300;

        // gather candidate platforms in the away direction within reach, preferring those
        // that increase horizontal distance from the opponent
        const candidates = [];
        for(let i=0;i<obstacles.length;i++){
          const ob = obstacles[i];
          const cx = ob.x + ob.w*0.5; const dxp = cx - pl.x;
          if(dxp * dirAway <= 60) continue; // must be ahead in away direction
          if(Math.abs(dxp) > JUMP_HORIZ) continue;
          if(Math.abs(ob.y - pl.y) > 360) continue;
          const newDist = Math.abs(cx - other.x);
          const curDist = Math.abs(pl.x - other.x);
          // prefer platforms that move the bot farther from the opponent
          const distGain = newDist - curDist;
          if(distToOther < MIN_SAFE_DIST && distGain < 40) continue; // only consider platforms that meaningfully increase distance when we're too close
          const awayScore = dirAway * (cx - other.x) + Math.max(0, distGain);
          candidates.push({i, cx, y: ob.y, score: awayScore - Math.max(0, ob.y - pl.y) * 0.001});
        }
        candidates.sort((a,b)=> b.score - a.score);

        function findPathBFS(sIdx, tIdx){
          const q = [sIdx]; const seen = new Set(); const parent = {};
          seen.add(String(sIdx));
          while(q.length){
            const cur = q.shift();
            if(cur === tIdx) break;
            const curX = (cur === -1) ? pl.x : (obstacles[cur].x + obstacles[cur].w*0.5);
            const curY = (cur === -1) ? groundY : obstacles[cur].y;
            for(let ni=0; ni<obstacles.length; ni++){
              if(ni === cur) continue; if(seen.has(String(ni))) continue;
              const nx = obstacles[ni].x + obstacles[ni].w*0.5; const ny = obstacles[ni].y;
              const horiz = Math.abs(nx - curX); const climb = curY - ny;
              if(horiz <= JUMP_HORIZ && climb <= MAX_CLIMB){ seen.add(String(ni)); parent[ni] = cur; q.push(ni); }
            }
          }
          if(!seen.has(String(tIdx))) return null;
          const path = []; let cur = tIdx; while(cur !== undefined){ path.unshift(cur); if(cur === sIdx) break; cur = parent[cur]; }
          return path;
        }

        let used = false;
        for(const c of candidates){
          const path = findPathBFS(startIdx, c.i);
          if(!path) continue;
          // determine next platform to move toward (first different from start)
          let nextIdx = path[0] === startIdx && path.length > 1 ? path[1] : path[0];
          if(nextIdx === undefined) nextIdx = path[path.length-1];
          const nextPlat = obstacles[nextIdx]; const targetCX = nextPlat.x + nextPlat.w*0.5;
          const dxp = targetCX - pl.x; const dirp = dxp > 0 ? 1 : -1; const absdxp = Math.abs(dxp);
          if(absdxp > 110){ if(dirp > 0) ks.right = true; else ks.left = true; }
          else { ks.left = ks.right = false; if(aiShouldJump(pl, targetCX, nextPlat.y)) ks.up = true; }
          // dash away (in away direction) if it's helpful to reach the platform quickly
          if(pl.grounded && pl.dashCooldown <= 0 && Math.abs(pl.x - targetCX) > 160){ attemptDash(pl, dirp); }
          used = true; break;
        }

        if(used) { return; }

        // fallback: if we're dangerously close, dash/jump away and keep moving away on ground
        if(distToOther < MIN_SAFE_DIST){
          if(pl.grounded && pl.dashCooldown <= 0) attemptDash(pl, dirAway);
          // try to find a higher platform ahead; only jump if there's a useful platform
          let aheadPlat = null;
          for(const ob of obstacles){ const cx = ob.x + ob.w*0.5; const dx = (cx - pl.x) * dirAway; if(dx > 40 && dx < FLEE_JUMP_REACH && Math.abs(ob.y - pl.y) < 360 && (pl.y - ob.y) > 10){ aheadPlat = ob; break; } }
          if(pl.grounded && aheadPlat && Math.random() < 0.12 && aiShouldJump(pl, aheadPlat.x + aheadPlat.w*0.5, aheadPlat.y)) ks.up = true;
          ks.shoot = false;
          return;
        }
        // don't run the aggressive logic below when fleeing
        return;
      }
      const dx = other.x - pl.x;
      const dist = Math.abs(dx);
      const dir = dx > 0 ? 1 : -1;
      const level = pl.aiLevel || 'normal';
      // smarter strategy: plan a way to reach the opponent rather than blindly follow
      // constants for reach/tuning
      const JUMP_HORIZ_REACH = 380; // approximate horizontal range while jumping
      const DASH_CLOSE_DIST = 100000; // distance where dash is useful
      // find if opponent is on a platform
      let targetX = other.x;
      const platformUnderOther = obstacles.find(ob => (other.x >= (ob.x - 18) && other.x <= (ob.x + ob.w + 18)) && Math.abs((other.y + FEET_OFFSET) - ob.y) < 8);
      const otherOnPlatform = !!platformUnderOther;

      if(otherOnPlatform){
        // attempt to plan: can we reach opponent's platform directly by jump/dash?
        targetX = platformUnderOther.x + platformUnderOther.w * 0.5;
        const dxToPlat = targetX - pl.x;
        const absDx = Math.abs(dxToPlat);
        const dirToPlat = dxToPlat > 0 ? 1 : -1;

        // direct reach test (single jump reach)
        const canReachDirect = absDx <= JUMP_HORIZ_REACH;

        if(canReachDirect){
          // move toward platform center
          if(absDx > 110) { if(dirToPlat > 0) ks.right = true; else ks.left = true; }
          else if(absDx > 60) { if(dirToPlat > 0) ks.right = true; else ks.left = true; }
          else { ks.left = ks.right = false; }
          // if aligned horizontally and on ground, dash then jump to cover distance
          if(pl.grounded){
            if(Math.abs(pl.x - targetX) > DASH_CLOSE_DIST && pl.dashCooldown <= 0){ attemptDash(pl, dirToPlat); }
            if(Math.abs(pl.x - targetX) < 90 && aiShouldJump(pl, targetX, platformUnderOther.y)){ ks.up = true; }
          }
        } else {
          // need to chain platforms: use a simple BFS over platforms to find a reachable path
          const JUMP_HORIZ_REACH = 380;
          const MAX_CLIMB = 220; // max vertical climb (px) per jump

          function platformCenter(ob){ return {x: ob.x + ob.w*0.5, y: ob.y}; }

          const targetIdx = obstacles.indexOf(platformUnderOther);
          // BFS from AI's current platform (or ground) to target platform
          const startIdx = platformUnder(pl.x, pl.y);
          function findPathBFS(startIdx, targetIdx){
            const q = [];
            const seen = new Set();
            const parent = {};
            // push start (can be -1 meaning ground)
            q.push(startIdx);
            seen.add(String(startIdx));
            while(q.length){
              const cur = q.shift();
              if(cur === targetIdx) break;
              // determine neighbors (platform indices) reachable from cur
              const curX = (cur === -1) ? pl.x : (obstacles[cur].x + obstacles[cur].w*0.5);
              const curY = (cur === -1) ? groundY : obstacles[cur].y;
              for(let ni=0; ni<obstacles.length; ni++){
                if(ni === cur) continue;
                if(seen.has(String(ni))) continue;
                const nx = obstacles[ni].x + obstacles[ni].w*0.5;
                const ny = obstacles[ni].y;
                const horiz = Math.abs(nx - curX);
                const climb = curY - ny; // positive if neighbor is higher
                if(horiz <= JUMP_HORIZ_REACH && climb <= MAX_CLIMB){
                  seen.add(String(ni)); parent[ni] = cur; q.push(ni);
                }
              }
            }
            if(!seen.has(String(targetIdx))) return null;
            // reconstruct path
            const path = [];
            let cur = targetIdx;
            while(cur !== undefined){ path.unshift(cur); if(cur === startIdx) break; cur = parent[cur]; }
            return path;
          }

          const path = findPathBFS(startIdx, targetIdx);
          if(path && path.length > 0){
            // next step is either the next platform in path or the target directly
            const nextIdx = (path[0] === startIdx && path.length > 1) ? path[1] : path[0];
            const nextPlat = obstacles[nextIdx];
            const cx = nextPlat.x + nextPlat.w*0.5;
            const dxp = cx - pl.x; const dirp = dxp > 0 ? 1 : -1; const absdxp = Math.abs(dxp);
            if(absdxp > 110) { if(dirp > 0) ks.right = true; else ks.left = true; }
            else { ks.left = ks.right = false; }
            if(pl.grounded){ if(Math.abs(pl.x - cx) > DASH_CLOSE_DIST && pl.dashCooldown <= 0){ attemptDash(pl, dirp); } if(Math.abs(pl.x - cx) < 90 && aiShouldJump(pl, cx, nextPlat.y)){ ks.up = true; } }
          } else {
            // fallback: head toward player's x on ground and try dashing/jumping opportunistically
            if(dist > 110) { if(dir > 0) ks.right = true; else ks.left = true; }
            else { ks.left = ks.right = false; }
            if(pl.grounded && pl.dashCooldown <= 0 && Math.abs(other.x - pl.x) > 140){ attemptDash(pl, dir); }
          }
        }
      } else {
        // opponent on ground: approach and attack
        if(dist > 110) { if(dir > 0) ks.right = true; else ks.left = true; }
        else if(dist > 60) { if(dir > 0) ks.right = true; else ks.left = true; }
        else { ks.left = ks.right = false; }
        const jumpChance = level === 'easy' ? 0.015 : level === 'hard' ? 0.06 : 0.03;
        if(pl.grounded && Math.random() < jumpChance && aiShouldJump(pl, other.x, other.y)) ks.up = true;
        const attackChance = level === 'easy' ? 0.65 : level === 'hard' ? 0.98 : 0.8;
        if(dist < 70 && pl.punching === 0 && Math.random() < attackChance){ spawnPunch(pl); }
        if(level === 'hard' && !pl.dashing && pl.dashCooldown <= 0 && Math.random() < 0.06){ attemptDash(pl, dir); }
      }
    });
    // if an inventory is open, block that player's input while it's open
    if(player1.invOpen){ keys1.left = keys1.right = keys1.up = keys1.shoot = false; }
    if(player2.invOpen){ keys2.left = keys2.right = keys2.up = keys2.shoot = false; }

    // update players (with platform landing and dash lifecycle)
    [[player1, keys1], [player2, keys2]].forEach(([pl, ks]) => {
      if(!pl.alive) return; // dead players don't move or act
      const prevY = pl.y;
      const prevX = pl.x;
      let ax = 0; if(ks.left) ax -= 1; if(ks.right) ax += 1;

      // update facing based on input (unless currently dashing)
      if(!pl.dashing && ax !== 0){ pl.facing = ax > 0 ? 1 : -1; }

      // handle dash timing and cooldown
      if(pl.dashing){
        pl.dashTime -= dt;
        pl.facing = pl.dashDir;
        if(pl.dashTime <= 0){ pl.dashing = false; pl.vx = 0; }
        else { pl.vx = pl.dashDir * DASH_SPEED; }
      } else {
        pl.vx = ax * pl.speed;
      }
      pl.dashCooldown = Math.max(0, (pl.dashCooldown || 0) - dt);
      pl.punchCooldown = Math.max(0, (pl.punchCooldown || 0) - dt);

      if(ks.up && pl.grounded){ pl.vy = -JUMP_V; pl.grounded = false; }
      pl.vy += GRAV * dt;
      pl.x += pl.vx * dt; pl.y += pl.vy * dt;

      // one-way platforms: land when feet cross from above
      const prevFeet = prevY + FEET_OFFSET;
      const currFeet = pl.y + FEET_OFFSET;
      for(const ob of obstacles){
        const withinX = pl.x >= (ob.x - 18) && pl.x <= (ob.x + ob.w + 18);
        // prevent passing upward through platform bottoms (head collision)
        const headOffset = 40; // distance from pl.y to top of head
        const prevTop = prevY - headOffset;
        const currTop = pl.y - headOffset;
        const platformBottom = ob.y + ob.h;
        if(withinX && prevTop >= platformBottom && currTop <= platformBottom && pl.vy < 0){
          // collided from below -- place player just below platform bottom
          pl.y = platformBottom + headOffset;
          pl.vy = 0;
        }
        // one-way landing: land when feet cross from above
        if(withinX && prevFeet <= ob.y && currFeet >= ob.y){
          pl.y = ob.y - FEET_OFFSET;
          pl.vy = 0;
          pl.grounded = true;
        }
      }
      // side collision: prevent moving through the sides of platforms
      for(const ob of obstacles){
        const left = ob.x;
        const right = ob.x + ob.w;
        // vertical overlap check (approximate player's body)
        const bodyTop = pl.y - 40; // head region
        const bodyBottom = pl.y + FEET_OFFSET;
        const verticalOverlap = bodyBottom > ob.y - 8 && bodyTop < ob.y + ob.h + 8;
        if(!verticalOverlap) continue;
        // collided from left
        if(prevX + 18 <= left && pl.x + 18 > left){
          pl.x = left - 18;
          pl.vx = 0;
        }
        // collided from right
        if(prevX - 18 >= right && pl.x - 18 < right){
          pl.x = right + 18;
          pl.vx = 0;
        }
      }

      if(pl.y + FEET_OFFSET > groundY){ pl.y = groundY - FEET_OFFSET; pl.vy = 0; pl.grounded = true; }
      const pad = 20; pl.x = Math.max(pad, Math.min(worldW - pad, pl.x));
    });

      // spikes update: timers and collisions
      for(const s of spikes){
        s.timer += dt;
        if(!s.out && s.timer >= s.period){
          s.out = true; s.outTime = s.outDuration; s.timer = 0; s.hit = {};
        }
        if(s.out){
          s.outTime -= dt;
          if(s.outTime <= 0){
            // retract and schedule next pop with a new random period/duration
            s.out = false; s.outTime = 0; s.timer = 0;
            s.period = 3 + Math.random() * 4; // 3-7s next
            s.outDuration = 0.6 + Math.random() * 0.8; // 0.6-1.4s
          }
              // check collisions with players while out
              const ob = obstacles[s.obIndex];
              if(!ob) continue;
              const left = ob.x - 6, right = ob.x + ob.w + 6;
              [player1, player2].forEach(p => {
                if(!p.alive) return;
                if(s.hit[p.id]) return;
                const feetY = p.y + FEET_OFFSET;
                const withinX = p.x >= left && p.x <= right;
                // if player's feet are on or below top of platform while spike is out -> hit
                if(withinX && feetY >= ob.y - 8 && feetY <= ob.y + ob.h){
                      p.hp = Math.max(0, p.hp - DAMAGE);
                      if(p.hp === 0){
                        p.alive = false;
                        // award xp to the other player if present
                        const other = p.id === 1 ? player2 : player1;
                        if(other) awardXP(other);
                        endRound(other);
                      }
                      s.hit[p.id] = true;
                }
              });
        }
      }

    

    // punches (update + player collisions)
    for(let i = punches.length-1; i >= 0; --i){
      const p = punches[i];
      p.life -= dt;
      let hit = false;
      const targets = [player1, player2];
      for(const t of targets){
        if(p.owner === t.id) continue;
        if(!t.alive) continue;
        const dx = p.x - t.x;
        const dy = p.y - (t.y - 20);
        const dist = Math.hypot(dx, dy);
        if(dist < 36){
            const attacker = p.owner === 1 ? player1 : player2;
            const dmg = getDamage(attacker);
            t.hp = Math.max(0, t.hp - dmg);
            if(t.hp === 0){ t.alive = false; awardXP(attacker); endRound(attacker); }
          hit = true;
          break;
        }
      }
      if(hit || p.life <= 0){
        // clear owner's punching flag
        const owner = p.owner === 1 ? player1 : player2;
        if(owner) owner.punching = 0;
        punches.splice(i,1);
      }
    }

    // bullets update
    for(let i = bullets.length-1; i >= 0; --i){
      const b = bullets[i];
      b.life -= dt; if(b.life <= 0){ bullets.splice(i,1); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // check collision against players
      [player1, player2].forEach(p => {
        if(!p.alive) return;
        if(p.id === b.owner) return;
        const dx = b.x - p.x; const dy = b.y - (p.y - 20);
        if(Math.hypot(dx,dy) < 22){ p.hp = Math.max(0, p.hp - b.damage); bullets.splice(i,1); if(p.hp === 0){ p.alive = false; const other = p.id === 1 ? player2 : player1; if(other) awardXP(other); endRound(other); } }
      });
    }

    // missiles update (homing)
    for(let i = missiles.length-1; i >= 0; --i){
      const m = missiles[i];
      m.life -= dt; if(m.life <= 0){ missiles.splice(i,1); continue; }
      const target = m.targetId === 1 ? player1 : player2;
      if(!target || !target.alive){ missiles.splice(i,1); continue; }
      // steer toward target
      const dx = (target.x) - m.x; const dy = (target.y - 20) - m.y;
      const dist = Math.hypot(dx,dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      // smooth steering
      m.vx += (nx * m.speed - m.vx) * Math.min(1, dt * 3);
      m.vy += (ny * m.speed - m.vy) * Math.min(1, dt * 3);
      m.x += m.vx * dt; m.y += m.vy * dt;
      if(Math.hypot(m.x - target.x, m.y - (target.y - 20)) < 26){
        target.hp = Math.max(0, target.hp - m.damage);
        if(target.hp === 0){ target.alive = false; const other = target.id === 1 ? player2 : player1; if(other) awardXP(other); endRound(other); }
        missiles.splice(i,1);
      }
    }

    // chests timer + pickup checks (randomized interval between 3 and 7 seconds)
    chestTimer += dt;
    if(chestTimer >= chestInterval){
      chestTimer = 0;
      spawnChest();
      // schedule next chest at a random interval between 3 and 7 seconds
      chestInterval = 3 + Math.random() * 4;
    }
    for(let i = chests.length-1; i >= 0; --i){ const c = chests[i]; c.timer += dt; // pickup if player overlaps
      [player1, player2].forEach(p => { if(!p || !p.alive) return; const dx = p.x - c.x; const dy = (p.y - 20) - c.y; if(Math.hypot(dx,dy) < (c.pickupRadius || 36)){ openChest(p, c); chests.splice(i,1); } }); }
    // update popups
    for(let i = popups.length-1; i >= 0; --i){ const pp = popups[i]; pp.time -= dt; pp.y -= dt * 18; if(pp.time <= 0) popups.splice(i,1); }

    // draw (world scaled by ZOOM)
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    // position camera to show ground near the bottom and center horizontally on players
    const centerX = (player1.x + player2.x) * 0.5;
    const translateX = Math.round(canvas.width * 0.5 - centerX * ZOOM);
    const bottomMargin = 60;
    const translateY = Math.round(canvas.height - bottomMargin - groundY * ZOOM);
    ctx.setTransform(ZOOM, 0, 0, ZOOM, translateX, translateY);
    drawBackground();
    drawObstacles();
    // draw spikes (visible when popped)
    for(const s of spikes){
      const ob = obstacles[s.obIndex];
      if(!ob) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      if(s.out){
        // draw 3 triangular spikes
        ctx.fillStyle = 'rgba(200,50,50,0.95)';
        const spikeW = Math.min(ob.w*0.18, 28);
        for(let i=-1;i<=1;i++){
          ctx.beginPath(); ctx.moveTo(i*spikeW*1.5 - spikeW*0.5, 0);
          ctx.lineTo(i*spikeW*1.5 + spikeW*0.5, 0);
          ctx.lineTo(i*spikeW*1.5, -spikeW); ctx.closePath(); ctx.fill();
        }
      } else {
        // small retracted sliver
        ctx.fillStyle = 'rgba(120,120,120,0.6)';
        ctx.fillRect(-10, -4, 20, 4);
      }
      ctx.restore();
    }
    // draw chests, bullets and missiles (world coordinates)
    drawChestsBulletsAndMissiles();
    // draw punches (quick melee visuals)
    for(const p of punches){
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(255,160,80,0.95)';
      ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // draw players (dead players are dimmed)
    drawStick(player1.x, player1.y, player1.alive ? player1.color : '#666666', player1.facing, player1.punching);
    drawStick(player2.x, player2.y, player2.alive ? player2.color : '#666666', player2.facing, player2.punching);
    ctx.restore();
    // UI health bars (not scaled)
    drawHealthBars();
    // draw reset button
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(resetRect.x, resetRect.y, resetRect.w, resetRect.h);
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText('Reset Round', resetRect.x + 10, resetRect.y + resetRect.h/2);
    ctx.restore();

    } catch(err) {
      // capture and display error but keep the loop running
      console.error(err);
      try{ errors.push((err && err.stack) ? err.stack : String(err)); }catch(e){}
      // clear and show errors on canvas
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      drawBackground();
      drawErrors();
      requestAnimationFrame(loop);
      return;
    }
    // draw any captured errors overlay (non-fatal)
    drawErrors();
    // update debug-status element with runtime counts
    try{
      const ds = document.getElementById && document.getElementById('debug-status');
      if(ds){ ds.textContent = `running | errors:${errors.length} chests:${chests.length} bullets:${bullets.length} missiles:${missiles.length}`; }
    }catch(e){}
    requestAnimationFrame(loop);
  }

  // resize handler updates ground and keeps players on ground
  function onResize(){
    resize();
    groundY = Math.max(120, Math.round(canvas.height / ZOOM) - 120);
    buildObstacles();
    if(player1.y + FEET_OFFSET > groundY) player1.y = groundY - FEET_OFFSET;
    if(player2.y + FEET_OFFSET > groundY) player2.y = groundY - FEET_OFFSET;
    const worldW = Math.round(canvas.width / ZOOM);
    if(player2.x > worldW - 60) player2.x = worldW - 120;
    updateResetRect();
  }
  window.addEventListener('resize', onResize);

  // update resetRect on resize so button scales/positions nicely
  function updateResetRect(){ resetRect.w = 140; resetRect.h = 36; resetRect.x = Math.round((canvas.width - resetRect.w)/2); resetRect.y = Math.round((canvas.height - resetRect.h)/2); }
  updateResetRect();

  // focus/click capture
  canvas.tabIndex = 0; canvas.style.outline = 'none'; canvas.addEventListener('click', ()=>canvas.focus());

  // main menu Play button wiring
  try{
    const menuEl = document.getElementById('main-menu');
    const btnPlay = document.getElementById('btn-play');
    if(btnPlay) btnPlay.addEventListener('click', ()=>{
      if(menuEl) menuEl.style.display = 'none';
      player2.ai = true;
      // clear any lingering manual inputs
      keys2.left = keys2.right = keys2.up = keys2.shoot = false;
      resetGame(); canvas.focus();
    });
    if(btnTwo) btnTwo.addEventListener('click', ()=>{
      if(menuEl) menuEl.style.display = 'none';
      player2.ai = false;
      // ensure player2 doesn't keep moving from prior AI inputs
      keys2.left = keys2.right = keys2.up = keys2.shoot = false;
      player2.vx = 0; player2.dashing = false; player2.dashTime = 0; player2.dashCooldown = 0;
      resetGame(); canvas.focus();
    });
  }catch(e){ /* ignore if DOM not present */ }

  requestAnimationFrame(loop);
})();
