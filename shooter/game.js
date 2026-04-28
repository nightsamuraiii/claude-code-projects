'use strict';

const W = 800, H = 600;
const PLAYER_SPEED = 220;
const FIRE_RATE = 0.13;
const BULLET_SPEED = 500;
const MAX_HP = 5;
const INVINCIBLE_TIME = 1.2;
const GRID_SIZE = 40;

const C = {
  bg:          '#070d07',
  grid:        'rgba(0, 48, 0, 0.32)',
  green:       '#00ff41',
  greenBright: '#aaffcc',
  greenDim:    '#003810',
  greenDark:   '#001200',
  amber:       '#ffb000',
  amberBright: '#ffd060',
  red:         '#ff3333',
  white:       '#dfffdf',
};

const ENEMY_DEF = {
  scout:  { r: 8,  spd: 90,  hp: 2,  score: 100,  shootInt: 3.0, bspd: 110, color: '#00cc33', shootMinLevel: 2 },
  tank:   { r: 14, spd: 50,  hp: 6,  score: 300,  shootInt: 2.6, bspd: 85,  color: '#009922', shootMinLevel: 2 },
  rusher: { r: 7,  spd: 175, hp: 2,  score: 150,  shootInt: null, bspd: 0,  color: '#00ffaa', shootMinLevel: 99 },
  sniper: { r: 9,  spd: 38,  hp: 3,  score: 250,  shootInt: 4.8, bspd: 300, color: '#88ff00', shootMinLevel: 4, telegraphTime: 1.5 },
  boss:   { r: 30, spd: 28,  hp: 35, score: 1500, shootInt: 0.9, bspd: 135, color: '#00ff41', shootMinLevel: 1 },
};

const LEVELS = [
  { waves: [{ scout: 8 }, { scout: 13 }] },
  { waves: [
    { scout: 8, tank: 3 },
    { scout: 10, tank: 4 },
    { scout: 12, tank: 5 },
  ]},
  { waves: [
    { scout: 8, tank: 3, rusher: 4 },
    { scout: 10, tank: 4, rusher: 5 },
    { scout: 12, tank: 5, rusher: 6 },
  ]},
  { waves: [
    { scout: 6, tank: 3, rusher: 4, sniper: 2 },
    { scout: 8, tank: 4, rusher: 5, sniper: 3 },
    { scout: 10, tank: 5, rusher: 6, sniper: 3 },
    { scout: 8, tank: 3, rusher: 8, sniper: 4 },
  ]},
  { waves: [
    { scout: 6, tank: 3, rusher: 8, sniper: 4 },
    { boss: 1 },
  ]},
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function randEdge(margin = 36) {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0: return { x: Math.random() * W, y: -margin };
    case 1: return { x: Math.random() * W, y: H + margin };
    case 2: return { x: -margin, y: Math.random() * H };
    default: return { x: W + margin, y: Math.random() * H };
  }
}

// ─── Particle ─────────────────────────────────────────────────────────────────

class Particle {
  constructor(x, y, vx, vy, color, life, size = 3) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.88;
    this.vy *= 0.88;
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    const s = this.size;
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}

// ─── Bullet ───────────────────────────────────────────────────────────────────

class Bullet {
  constructor(x, y, angle, speed, isEnemy) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.isEnemy = isEnemy;
    this.life = 1.6;
    this.r = 3;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.x < -30 || this.x > W + 30 || this.y < -30 || this.y > H + 30) this.life = 0;
  }

  draw(ctx) {
    ctx.shadowBlur = 6;
    if (this.isEnemy) {
      ctx.shadowColor = C.amber;
      ctx.fillStyle = C.amberBright;
    } else {
      ctx.shadowColor = C.green;
      ctx.fillStyle = C.greenBright;
    }
    ctx.fillRect(this.x - this.r, this.y - this.r, this.r * 2, this.r * 2);
    ctx.shadowBlur = 0;
  }

  get dead() { return this.life <= 0; }
}

// ─── Player ───────────────────────────────────────────────────────────────────

class Player {
  constructor() {
    this.x = W / 2;
    this.y = H / 2;
    this.r = 10;
    this.angle = 0;
    this.hp = MAX_HP;
    this.invincible = 0;
    this.fireTimer = 0;
    this.muzzleFlash = 0;
    this.moving = false;
    this.walkCycle = 0;
    this.score = 0;
  }

  update(dt, keys, mouse) {
    let dx = 0, dy = 0;
    if (keys.has('ArrowLeft'))  dx -= 1;
    if (keys.has('ArrowRight')) dx += 1;
    if (keys.has('ArrowUp'))    dy -= 1;
    if (keys.has('ArrowDown'))  dy += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) this.walkCycle += dt;

    this.x = clamp(this.x + dx * PLAYER_SPEED * dt, this.r + 4, W - this.r - 4);
    this.y = clamp(this.y + dy * PLAYER_SPEED * dt, this.r + 4, H - this.r - 4);
    this.angle = angleTo(this.x, this.y, mouse.x, mouse.y);

    if (this.invincible > 0) this.invincible -= dt;
    if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 7);
    this.fireTimer = Math.max(0, this.fireTimer - dt);

    if (mouse.firing && this.fireTimer === 0) {
      this.fireTimer = FIRE_RATE;
      this.muzzleFlash = 1;
      const tipX = this.x + Math.cos(this.angle) * 22;
      const tipY = this.y + Math.sin(this.angle) * 22;
      return new Bullet(tipX, tipY, this.angle, BULLET_SPEED, false);
    }
    return null;
  }

  takeDamage() {
    if (this.invincible > 0) return false;
    this.hp--;
    this.invincible = INVINCIBLE_TIME;
    return this.hp <= 0;
  }

  draw(ctx) {
    // Blink during invincibility
    if (this.invincible > 0 && Math.floor(this.invincible * 10) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.shadowBlur = 14;
    ctx.shadowColor = C.green;

    // Body circle
    ctx.fillStyle = C.greenDark;
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Torso pixel detail
    ctx.fillStyle = C.green;
    ctx.fillRect(-2, -3, 4, 7);
    ctx.fillRect(-5, -1, 3, 4);
    ctx.fillRect(2, -1, 3, 4);

    // Walking legs
    const legBob = this.moving ? Math.sin(this.walkCycle * 10) * 3 : 0;
    ctx.fillRect(-4, 4 + legBob, 3, 5);
    ctx.fillRect(1, 4 - legBob, 3, 5);

    // Gun arm (rotates with mouse)
    ctx.rotate(this.angle);
    ctx.fillStyle = C.green;
    ctx.fillRect(this.r - 1, -2, 15, 4);

    // Muzzle flash
    if (this.muzzleFlash > 0) {
      ctx.shadowBlur = 22;
      ctx.shadowColor = '#ffffcc';
      ctx.fillStyle = `rgba(200, 255, 180, ${this.muzzleFlash * 0.9})`;
      ctx.beginPath();
      ctx.arc(this.r + 16, 0, 5 * this.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ─── Enemy ────────────────────────────────────────────────────────────────────

class Enemy {
  constructor(type, x, y, level) {
    this.type = type;
    const def = ENEMY_DEF[type];
    this.x = x; this.y = y;
    this.r = def.r;
    this.spd = def.spd;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.score = def.score;
    this.def = def;
    this.level = level;

    this.hitFlash = 0;
    this.pulseCycle = Math.random() * Math.PI * 2;
    this.aimAngle = 0;
    this.shootTimer = def.shootInt ? (Math.random() * def.shootInt * 0.6) : Infinity;

    // Sniper state
    this.telegraphing = false;
    this.telegraphTimer = 0;
    this.telegraphTarget = null;

    // Boss state
    this.bossRotation = 0;
  }

  get canShoot() {
    return this.def.shootInt !== null && this.level >= this.def.shootMinLevel;
  }

  update(dt, player) {
    this.pulseCycle += dt * 2;
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    const a = angleTo(this.x, this.y, player.x, player.y);
    this.aimAngle = a;

    // Movement: snipers freeze while telegraphing
    if (!(this.type === 'sniper' && this.telegraphing)) {
      this.x += Math.cos(a) * this.spd * dt;
      this.y += Math.sin(a) * this.spd * dt;
    }

    if (this.type === 'boss') {
      const rage = this.hp / this.maxHp < 0.3 ? 1.6 : 1;
      this.bossRotation += dt * 1.3 * rage;
    }

    if (!this.canShoot) return [];
    return this._shoot(dt, player);
  }

  _shoot(dt, player) {
    const bullets = [];

    if (this.type === 'sniper') {
      if (!this.telegraphing) {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.telegraphing = true;
          this.telegraphTimer = this.def.telegraphTime;
          this.telegraphTarget = { x: player.x, y: player.y };
        }
      } else {
        this.telegraphTimer -= dt;
        if (this.telegraphTimer <= 0) {
          this.telegraphing = false;
          this.shootTimer = this.def.shootInt;
          const a = angleTo(this.x, this.y, this.telegraphTarget.x, this.telegraphTarget.y);
          bullets.push(new Bullet(this.x, this.y, a, this.def.bspd, true));
        }
      }
      return bullets;
    }

    if (this.type === 'boss') {
      const rage = this.hp / this.maxHp < 0.3;
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = rage ? 0.5 : this.def.shootInt;
        for (let i = 0; i < 4; i++) {
          const a = this.bossRotation + (i * Math.PI / 2);
          bullets.push(new Bullet(this.x, this.y, a, this.def.bspd, true));
        }
        if (rage) {
          bullets.push(new Bullet(this.x, this.y, this.aimAngle, this.def.bspd * 1.2, true));
        }
      }
      return bullets;
    }

    if (this.type === 'tank') {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = this.def.shootInt;
        const a = angleTo(this.x, this.y, player.x, player.y);
        bullets.push(new Bullet(this.x, this.y, a - 0.08, this.def.bspd, true));
        bullets.push(new Bullet(this.x, this.y, a + 0.08, this.def.bspd, true));
      }
      return bullets;
    }

    // Scout
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = this.def.shootInt + Math.random() * 0.5;
      const a = angleTo(this.x, this.y, player.x, player.y);
      bullets.push(new Bullet(this.x, this.y, a, this.def.bspd, true));
    }
    return bullets;
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    this.hitFlash = 1;
    return this.hp <= 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    const color = this.hitFlash > 0 ? C.white : this.def.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;

    switch (this.type) {
      case 'scout':  this._drawScout(ctx, color);  break;
      case 'tank':   this._drawTank(ctx, color);   break;
      case 'rusher': this._drawRusher(ctx, color); break;
      case 'sniper': this._drawSniper(ctx, color); break;
      case 'boss':   this._drawBoss(ctx, color);   break;
    }

    if (this.type === 'tank' || this.type === 'boss') {
      this._drawHpBar(ctx);
    }

    ctx.restore();

    // Sniper telegraph (world-space)
    if (this.telegraphing && this.telegraphTarget) {
      const p = 1 - this.telegraphTimer / this.def.telegraphTime;
      ctx.save();
      ctx.strokeStyle = `rgba(136, 255, 0, ${0.25 + p * 0.55})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -p * 20;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.telegraphTarget.x, this.telegraphTarget.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  _drawScout(ctx, color) {
    const r = this.r;
    const pulse = 1 + Math.sin(this.pulseCycle) * 0.1;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = C.greenDark;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-2, -2, 4, 4);
  }

  _drawTank(ctx, color) {
    const r = this.r;
    ctx.fillStyle = C.greenDark;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeRect(-r, -r, r * 2, r * 2);

    // Turret
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Barrel toward player
    ctx.save();
    ctx.rotate(this.aimAngle);
    ctx.fillStyle = color;
    ctx.fillRect(0, -2, r + 5, 4);
    ctx.restore();
  }

  _drawRusher(ctx, color) {
    const r = this.r;
    ctx.save();
    ctx.rotate(this.aimAngle + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.8, r * 0.8);
    ctx.lineTo(-r * 0.8, r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawSniper(ctx, color) {
    const r = this.r;
    const pulse = 1 + Math.sin(this.pulseCycle) * 0.07;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = C.greenDark;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillRect(-r, -3, r * 2, 6);
    ctx.fillRect(-3, -r, 6, r * 2);
    ctx.strokeRect(-r, -3, r * 2, 6);
    ctx.strokeRect(-3, -r, 6, r * 2);
    ctx.fillStyle = color;
    ctx.fillRect(-3, -3, 6, 6);

    // Scope line
    ctx.save();
    ctx.rotate(this.aimAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r + 2, 0);
    ctx.lineTo(r + 12, 0);
    ctx.stroke();
    ctx.restore();
  }

  _drawBoss(ctx, color) {
    const r = this.r;
    const pulse = 1 + Math.sin(this.pulseCycle * 1.5) * 0.05;
    ctx.scale(pulse, pulse);

    ctx.fillStyle = C.greenDark;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = `rgba(0,255,65,0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating cannon arms
    for (let i = 0; i < 4; i++) {
      const a = this.bossRotation + i * Math.PI / 2;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = color;
      ctx.fillRect(r - 4, -3, 18, 6);
      ctx.restore();
    }

    // Core eye
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.font = 'bold 9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('BOSS', 0, -r - 8);
    ctx.textAlign = 'left';
  }

  _drawHpBar(ctx) {
    const bw = this.r * 2.8;
    const bh = 4;
    const by = this.r + 7;
    const ratio = this.hp / this.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-bw / 2, by, bw, bh);
    ctx.fillStyle = ratio > 0.5 ? C.green : ratio > 0.25 ? C.amber : C.red;
    ctx.fillRect(-bw / 2, by, bw * ratio, bh);
    ctx.strokeStyle = 'rgba(0,255,65,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-bw / 2, by, bw, bh);
  }
}

// ─── Game ─────────────────────────────────────────────────────────────────────

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.state = 'MENU';
    this.keys = new Set();
    this.mouse = { x: W / 2, y: H / 2, firing: false };

    this.player = null;
    this.enemies = [];
    this.spawnQueue = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.particles = [];

    this.levelIdx = 0;
    this.waveIdx = 0;
    this.transitionTimer = 0;
    this.transitionMsg = '';
    this.transitionSub = '';
    this.blinkTimer = 0;
    this.finalScore = 0;
    this.lastTime = 0;

    this._bindEvents();
    requestAnimationFrame(ts => this._loop(ts));
  }

  _bindEvents() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if ((e.key === 'Enter' || e.key === ' ') &&
          (this.state === 'MENU' || this.state === 'GAME_OVER' || this.state === 'WIN')) {
        this._startGame();
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key));

    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (W / rect.width);
      this.mouse.y = (e.clientY - rect.top) * (H / rect.height);
    });
    this.canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      this.mouse.firing = true;
      if (this.state === 'MENU' || this.state === 'GAME_OVER' || this.state === 'WIN') {
        this._startGame();
      }
    });
    this.canvas.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.firing = false; });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _startGame() {
    this.levelIdx = 0;
    this.waveIdx = 0;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.particles = [];
    this.player = new Player();
    this._buildSpawnQueue();
    this.state = 'PLAYING';
  }

  _buildSpawnQueue() {
    const waveDef = LEVELS[this.levelIdx].waves[this.waveIdx];
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];

    const entries = [];
    for (const [type, count] of Object.entries(waveDef)) {
      for (let i = 0; i < count; i++) entries.push(type);
    }

    // Shuffle
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    let delay = 0;
    this.spawnQueue = entries.map(type => {
      const pos = randEdge();
      const item = { type, x: pos.x, y: pos.y, delay };
      delay += 0.26 + Math.random() * 0.22;
      return item;
    });
  }

  _spawnHit(x, y, color = C.green) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 65;
      this.particles.push(new Particle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, color, 0.35, 2));
    }
  }

  _spawnDeath(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 65 + Math.random() * 130;
      const sz = 2 + Math.random() * 3;
      this.particles.push(new Particle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, color, 0.55 + Math.random() * 0.4, sz));
    }
  }

  _checkWaveComplete() {
    if (this.state !== 'PLAYING') return;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;

    const completedLevel = this.levelIdx + 1;
    this.waveIdx++;
    const totalWaves = LEVELS[this.levelIdx].waves.length;

    if (this.waveIdx >= totalWaves) {
      this.levelIdx++;
      this.waveIdx = 0;
      if (this.levelIdx >= LEVELS.length) {
        this.finalScore = this.player.score + 2000;
        this.player.score = this.finalScore;
        this.state = 'WIN';
      } else {
        this.player.score += 500 * completedLevel;
        this.transitionMsg = `LEVEL ${completedLevel} COMPLETE`;
        this.transitionSub = `ENTERING LEVEL ${this.levelIdx + 1}...`;
        this.transitionTimer = 2.5;
        this.state = 'LEVEL_CLEAR';
      }
    } else {
      this.player.score += 200;
      this.transitionMsg = 'WAVE CLEARED';
      this.transitionSub = 'GET READY...';
      this.transitionTimer = 1.5;
      this.state = 'WAVE_CLEAR';
    }
  }

  _loop(ts) {
    const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
    this.lastTime = ts;
    this.blinkTimer += dt;
    this._update(dt);
    this._render();
    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    if (this.state === 'MENU' || this.state === 'GAME_OVER' || this.state === 'WIN') {
      this.particles.forEach(p => p.update(dt));
      this.particles = this.particles.filter(p => p.life > 0);
      return;
    }

    if (this.state === 'WAVE_CLEAR' || this.state === 'LEVEL_CLEAR') {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        this._buildSpawnQueue();
        this.state = 'PLAYING';
      }
      return;
    }

    // Spawn queue
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= 0) {
      const { type, x, y } = this.spawnQueue.shift();
      this.enemies.push(new Enemy(type, x, y, this.levelIdx + 1));
      this._spawnHit(clamp(x, 10, W - 10), clamp(y, 10, H - 10), ENEMY_DEF[type].color);
    }
    if (this.spawnQueue.length > 0) this.spawnQueue[0].delay -= dt;

    // Player
    const pb = this.player.update(dt, this.keys, this.mouse);
    if (pb) this.playerBullets.push(pb);

    // Enemies
    for (const e of this.enemies) {
      const bs = e.update(dt, this.player);
      if (bs && bs.length) this.enemyBullets.push(...bs);
    }

    // Bullets
    this.playerBullets.forEach(b => b.update(dt));
    this.playerBullets = this.playerBullets.filter(b => !b.dead);
    this.enemyBullets.forEach(b => b.update(dt));
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead);

    // Particles
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => p.life > 0);

    // Player bullets vs enemies
    outer:
    for (const b of this.playerBullets) {
      for (const e of this.enemies) {
        if (dist(b.x, b.y, e.x, e.y) < e.r + b.r) {
          b.life = 0;
          const killed = e.takeDamage(1);
          if (killed) {
            this._spawnDeath(e.x, e.y, e.def.color, e.type === 'boss' ? 30 : 14);
            this.player.score += e.score;
          } else {
            this._spawnHit(e.x, e.y, e.def.color);
          }
          continue outer;
        }
      }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
    this.playerBullets = this.playerBullets.filter(b => !b.dead);

    // Enemy bullets vs player
    if (this.player.invincible <= 0) {
      for (const b of this.enemyBullets) {
        if (dist(b.x, b.y, this.player.x, this.player.y) < this.player.r + b.r) {
          b.life = 0;
          this._spawnHit(this.player.x, this.player.y, C.red);
          if (this.player.takeDamage()) {
            this._spawnDeath(this.player.x, this.player.y, C.green, 20);
            this.finalScore = this.player.score;
            this.state = 'GAME_OVER';
            return;
          }
          break;
        }
      }
      this.enemyBullets = this.enemyBullets.filter(b => !b.dead);
    }

    // Enemy contact vs player
    if (this.player.invincible <= 0) {
      for (const e of this.enemies) {
        if (dist(e.x, e.y, this.player.x, this.player.y) < e.r + this.player.r) {
          this._spawnHit(this.player.x, this.player.y, C.red);
          if (this.player.takeDamage()) {
            this._spawnDeath(this.player.x, this.player.y, C.green, 20);
            this.finalScore = this.player.score;
            this.state = 'GAME_OVER';
            return;
          }
          break;
        }
      }
    }

    this._checkWaveComplete();
  }

  _render() {
    const ctx = this.ctx;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    this._drawGrid(ctx);

    if (this.state === 'MENU') {
      this._drawMenu(ctx);
      this._drawCRT(ctx);
      return;
    }

    ctx.shadowBlur = 0;
    this.particles.forEach(p => p.draw(ctx));
    this.playerBullets.forEach(b => b.draw(ctx));
    this.enemyBullets.forEach(b => b.draw(ctx));
    this.enemies.forEach(e => e.draw(ctx));

    if (this.state !== 'GAME_OVER') this.player.draw(ctx);

    this._drawHUD(ctx);

    if (this.state === 'WAVE_CLEAR' || this.state === 'LEVEL_CLEAR') this._drawTransition(ctx);
    if (this.state === 'GAME_OVER') this._drawGameOver(ctx);
    if (this.state === 'WIN') this._drawWin(ctx);

    this._drawCRT(ctx);
  }

  _drawGrid(ctx) {
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  _drawHUD(ctx) {
    ctx.fillStyle = 'rgba(0, 6, 0, 0.78)';
    ctx.fillRect(0, 0, W, 46);
    ctx.strokeStyle = 'rgba(0,255,65,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 46); ctx.lineTo(W, 46); ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.shadowColor = C.green;
    ctx.font = 'bold 18px Courier New';
    ctx.textAlign = 'left';
    for (let i = 0; i < MAX_HP; i++) {
      ctx.fillStyle = i < this.player.hp ? C.green : C.greenDim;
      ctx.shadowColor = i < this.player.hp ? C.green : 'transparent';
      ctx.fillText('♥', 14 + i * 22, 30);
    }

    const totalWaves = LEVELS[this.levelIdx]?.waves.length ?? '?';
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.shadowColor = C.green;
    ctx.fillStyle = C.green;
    ctx.fillText(`LEVEL ${this.levelIdx + 1}  ·  WAVE ${this.waveIdx + 1} / ${totalWaves}`, W / 2, 29);

    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${String(this.player.score).padStart(7, '0')}`, W - 14, 29);

    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
  }

  _drawMenu(ctx) {
    ctx.shadowBlur = 22;
    ctx.shadowColor = C.green;
    ctx.fillStyle = C.green;
    ctx.font = 'bold 58px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('VECTOR KILL', W / 2, H / 2 - 88);

    ctx.shadowBlur = 6;
    ctx.font = '14px Courier New';
    ctx.fillStyle = 'rgba(0,255,65,0.6)';
    ctx.fillText('T O P - D O W N   S H O O T E R', W / 2, H / 2 - 46);

    ctx.font = '12px Courier New';
    ctx.fillStyle = 'rgba(0,255,65,0.45)';
    ctx.fillText('ARROW KEYS: MOVE    MOUSE: AIM    CLICK / HOLD: SHOOT', W / 2, H / 2 + 14);

    ctx.font = '11px Courier New';
    ctx.fillStyle = 'rgba(0,255,65,0.3)';
    ctx.fillText('5 LEVELS  ·  4 ENEMY TYPES  ·  BOSS FIGHT', W / 2, H / 2 + 38);

    if (Math.sin(this.blinkTimer * 3) > 0) {
      ctx.font = 'bold 17px Courier New';
      ctx.fillStyle = C.green;
      ctx.shadowBlur = 14;
      ctx.shadowColor = C.green;
      ctx.fillText('[ PRESS ENTER OR CLICK TO START ]', W / 2, H / 2 + 80);
    }

    this._drawLegend(ctx);

    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
  }

  _drawLegend(ctx) {
    const items = [
      { color: ENEMY_DEF.scout.color,  label: 'SCOUT  — fast, shoots (lv2+)' },
      { color: ENEMY_DEF.tank.color,   label: 'TANK   — armored, twin burst' },
      { color: ENEMY_DEF.rusher.color, label: 'RUSHER — charge attack only' },
      { color: ENEMY_DEF.sniper.color, label: 'SNIPER — telegraphed shot (lv4+)' },
    ];
    const startY = H - 80;
    ctx.font = '11px Courier New';
    items.forEach((item, i) => {
      const x = W / 2 - 150 + (i % 2) * 160;
      const y = startY + Math.floor(i / 2) * 18;
      ctx.fillStyle = item.color;
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 6;
      ctx.fillText('■', x, y);
      ctx.fillStyle = 'rgba(0,255,65,0.4)';
      ctx.shadowBlur = 0;
      ctx.fillText(' ' + item.label, x + 12, y);
    });
  }

  _drawTransition(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.shadowBlur = 20;
    ctx.shadowColor = C.green;
    ctx.fillStyle = C.green;
    ctx.font = 'bold 36px Courier New';
    ctx.fillText(this.transitionMsg, W / 2, H / 2 - 12);
    ctx.font = '15px Courier New';
    ctx.fillStyle = 'rgba(0,255,65,0.55)';
    ctx.fillText(this.transitionSub, W / 2, H / 2 + 26);
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
  }

  _drawGameOver(ctx) {
    this.particles.forEach(p => p.draw(ctx));
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.shadowBlur = 22;
    ctx.shadowColor = C.red;
    ctx.fillStyle = C.red;
    ctx.font = 'bold 54px Courier New';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 60);
    ctx.shadowColor = C.green;
    ctx.fillStyle = C.green;
    ctx.font = '18px Courier New';
    ctx.fillText(`FINAL SCORE: ${String(this.finalScore).padStart(7, '0')}`, W / 2, H / 2 - 4);
    if (Math.sin(this.blinkTimer * 3) > 0) {
      ctx.font = 'bold 15px Courier New';
      ctx.shadowBlur = 10;
      ctx.fillText('[ PRESS ENTER OR CLICK TO RETRY ]', W / 2, H / 2 + 44);
    }
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
  }

  _drawWin(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.shadowBlur = 28;
    ctx.shadowColor = C.greenBright;
    ctx.fillStyle = C.greenBright;
    ctx.font = 'bold 52px Courier New';
    ctx.fillText('VICTORY', W / 2, H / 2 - 70);
    ctx.shadowBlur = 10;
    ctx.shadowColor = C.green;
    ctx.fillStyle = C.green;
    ctx.font = '15px Courier New';
    ctx.fillText('ALL 5 LEVELS COMPLETE', W / 2, H / 2 - 24);
    ctx.font = '20px Courier New';
    ctx.fillText(`FINAL SCORE: ${String(this.player.score).padStart(7, '0')}`, W / 2, H / 2 + 18);
    if (Math.sin(this.blinkTimer * 3) > 0) {
      ctx.font = 'bold 15px Courier New';
      ctx.shadowBlur = 12;
      ctx.fillText('[ PRESS ENTER OR CLICK TO PLAY AGAIN ]', W / 2, H / 2 + 64);
    }
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
  }

  _drawCRT(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    for (let y = 0; y < H; y += 2) {
      ctx.fillRect(0, y, W, 1);
    }
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.88);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  canvas.width = W;
  canvas.height = H;
  new Game(canvas);
});
