(function () {
  'use strict';

  // --- Constants ---
  const TILE = 32;
  const GRAVITY = 0.6;
  const FRICTION = 0.82;
  const JUMP_FORCE = -14;
  const RUN_SPEED = 5;
  const ENEMY_SPEED = 2;
  const GROUND_Y_OFFSET = 2;

  // --- DOM ---
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const coinsEl = document.getElementById('coins');
  const livesEl = document.getElementById('lives');
  const startScreen = document.getElementById('start-screen');
  const gameOverScreen = document.getElementById('game-over-screen');
  const winScreen = document.getElementById('win-screen');
  const finalScoreEl = document.getElementById('final-score');
  const winScoreEl = document.getElementById('win-score');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnJump = document.getElementById('btn-jump');
  const btnRestart = document.getElementById('btn-restart');
  const btnNext = document.getElementById('btn-next');

  // --- Game state ---
  let gameState = 'start'; // start | playing | gameover | win
  let score = 0;
  let coins = 0;
  let lives = 3;
  let cameraX = 0;
  let levelWidth = 0;

  // --- Mario ---
  const mario = {
    x: 80,
    y: 0,
    w: 28,
    h: 28,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    animFrame: 0,
    animTimer: 0,
    invincibleUntil: 0
  };

  // --- Level: 1=ground, 2=block, 3=brick, 4=pipe, 5=coin, 6=flag, 7=flagpole
  let tiles = [];
  let enemies = [];
  let collectibles = [];
  let flag = { x: 0, y: 0, reached: false };

  function buildLevel() {
    const W = 10;
    const cols = 45;
    levelWidth = cols * TILE;
    tiles = [];

    for (let c = 0; c < cols; c++) {
      tiles[c] = [];
      for (let r = 0; r < W; r++) {
        if (r === W - 1) {
          tiles[c][r] = 1;
        } else if (r >= W - 3 && (c < 3 || c > cols - 5)) {
          tiles[c][r] = 1;
        } else {
          tiles[c][r] = 0;
        }
      }
    }

    // Platforms and blocks (raised a bit to allow Mario to walk underneath)
    const platforms = [
      [5, 6, 3, 1],  // was row 7
      [10, 6, 2, 1], // was row 7
      [14, 5, 2, 1], // was row 6
      [18, 6, 3, 1], // was row 7
      [24, 5, 2, 1], // was row 6
      [28, 6, 2, 1], // was row 7
      [32, 5, 3, 1], // was row 6
      [38, 6, 2, 1]  // was row 7
    ];
    platforms.forEach(([cx, cy, cw, ch]) => {
      for (let i = 0; i < cw; i++) {
        for (let j = 0; j < ch; j++) {
          const x = cx + i;
          const y = cy + j;
          if (x < cols && y < W) tiles[x][y] = 2;
        }
      }
    });

    // Pipes
    [[12, 2], [26, 2], [35, 2]].forEach(([cx, cy]) => {
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 5; j++) {
          const x = cx + i;
          const y = cy + j;
          if (x < cols && y < W) tiles[x][y] = 4;
        }
      }
    });

    // Coins in level (as collectible objects)
    collectibles = [];
    [[6, 6], [8, 6], [11, 6], [16, 5], [20, 6], [22, 6], [30, 5], [34, 5], [40, 6], [42, 6]].forEach(([gx, gy]) => {
      collectibles.push({ x: gx * TILE + 8, y: gy * TILE + 8, w: 16, h: 16, type: 'coin', collected: false });
    });

    // Flag at end
    const flagCol = cols - 4;
    flag = { x: flagCol * TILE, y: (W - 4) * TILE, w: 24, h: 4 * TILE, reached: false };
    for (let r = W - 4; r <= W - 1; r++) tiles[flagCol + 1][r] = 7;

    // Enemies (Goombas)
    enemies = [];
    [[7, 8], [15, 7], [21, 8], [29, 7], [36, 8]].forEach(([gx, gy]) => {
      enemies.push({
        x: gx * TILE + 4,
        y: (gy - 1) * TILE,
        w: 28,
        h: 28,
        vx: -ENEMY_SPEED,
        vy: 0,
        type: 'goomba',
        alive: true
      });
    });
  }

  function getTileAt(pixelX, pixelY) {
    const col = Math.floor(pixelX / TILE);
    const row = Math.floor(pixelY / TILE);
    if (col < 0 || col >= tiles.length) return 0;
    if (row < 0 || row >= tiles[0].length) return 0;
    return tiles[col][row];
  }

  function solidTile(t) {
    return t === 1 || t === 2 || t === 3 || t === 4 || t === 7;
  }

  function collideMarioTile(m, dx, dy) {
    const left = Math.floor((m.x + dx) / TILE);
    const right = Math.floor((m.x + m.w + dx - 1) / TILE);
    const top = Math.floor((m.y + dy) / TILE);
    const bottom = Math.floor((m.y + m.h + dy - 1) / TILE);
    for (let c = left; c <= right; c++) {
      for (let r = top; r <= bottom; r++) {
        const t = getTileAt(c * TILE, r * TILE);
        if (solidTile(t)) return true;
      }
    }
    return false;
  }

  function resolveMarioTiles(m) {
    const margin = 2;
    if (m.vx > 0) {
      while (collideMarioTile(m, margin, 0)) m.x -= 1;
      if (collideMarioTile(m, 0, 0)) m.vx = 0;
    }
    if (m.vx < 0) {
      while (collideMarioTile(m, -margin, 0)) m.x += 1;
      if (collideMarioTile(m, 0, 0)) m.vx = 0;
    }
    m.y += m.vy;
    m.onGround = false;
    if (m.vy > 0) {
      while (collideMarioTile(m, 0, margin)) { m.y -= 1; m.vy = 0; m.onGround = true; }
    }
    if (m.vy < 0) {
      while (collideMarioTile(m, 0, -margin)) { m.y += 1; m.vy = 0; }
    }
  }

  function updateMario(dt) {
    if (gameState !== 'playing') return;

    mario.vx *= FRICTION;
    if (keys.left) mario.vx = Math.max(mario.vx - RUN_SPEED * 0.5, -RUN_SPEED);
    if (keys.right) mario.vx = Math.min(mario.vx + RUN_SPEED * 0.5, RUN_SPEED);
    if (keys.jump && mario.onGround) {
      mario.vy = JUMP_FORCE;
      mario.onGround = false;
    }

    mario.vy += GRAVITY;
    mario.x += mario.vx;
    resolveMarioTiles(mario);

    if (mario.y > 10 * TILE) {
      hurtMario();
      return;
    }

    mario.facing = mario.vx < 0 ? -1 : mario.vx > 0 ? 1 : mario.facing;
    mario.animTimer += dt;
    if (mario.animTimer > 80) {
      mario.animTimer = 0;
      mario.animFrame = (mario.animFrame + 1) % 4;
    }

    // Coins
    collectibles.forEach(c => {
      if (c.collected) return;
      if (mario.x + mario.w > c.x && mario.x < c.x + c.w && mario.y + mario.h > c.y && mario.y < c.y + c.h) {
        c.collected = true;
        coins++;
        score += 200;
      }
    });

    // Flag
    if (!flag.reached && mario.x + mario.w > flag.x && mario.x < flag.x + flag.w && mario.y + mario.h > flag.y) {
      flag.reached = true;
          score += 5000;
          setTimeout(() => {
            gameState = 'win';
            winScoreEl.textContent = 'Score: ' + score;
            winScreen.classList.remove('hidden');
          }, 400);
    }

    // Enemies
    enemies.forEach(e => {
      if (!e.alive) return;
      e.x += e.vx;
      const left = Math.floor(e.x / TILE);
      const right = Math.floor((e.x + e.w) / TILE);
      const row = Math.floor((e.y + e.h) / TILE);
      for (let c = left; c <= right; c++) {
        if (solidTile(getTileAt(c * TILE, row * TILE))) {
          e.vx = -e.vx;
          break;
        }
      }
      if (e.x < cameraX - 50) e.vx = Math.abs(e.vx);
      if (e.x + e.w > cameraX + canvas.width + 50) e.vx = -Math.abs(e.vx);

      // Stomp or get hurt
      if (Date.now() < mario.invincibleUntil) return;
      const overlap = mario.x + mario.w > e.x && mario.x < e.x + e.w && mario.y + mario.h > e.y && mario.y < e.y + e.h;
      if (overlap) {
        if (mario.vy > 0 && mario.y + mario.h - 8 < e.y + e.h * 0.5) {
          e.alive = false;
          mario.vy = -8;
          score += 100;
        } else {
          hurtMario();
        }
      }
    });
  }

  function hurtMario() {
    if (Date.now() < mario.invincibleUntil) return;
    lives--;
    livesEl.textContent = 'Lives: ' + lives;
    mario.invincibleUntil = Date.now() + 2000;
    mario.vx = 0;
    mario.vy = -10;
    if (lives <= 0) {
      gameState = 'gameover';
      finalScoreEl.textContent = 'Score: ' + score;
      gameOverScreen.classList.remove('hidden');
    } else {
      mario.x = 80;
      mario.y = 200;
    }
  }

  function drawTile(t, sx, sy) {
    const x = sx * TILE - cameraX;
    const y = sy * TILE;
    if (x + TILE < 0 || x > canvas.width) return;
    if (t === 1) {
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#654321';
      ctx.fillRect(x, y, TILE, 4);
    } else if (t === 2) {
      ctx.fillStyle = '#deb887';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = '#8b7355';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, TILE, TILE);
    } else if (t === 4) {
      ctx.fillStyle = '#228b22';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#1a6b1a';
      ctx.fillRect(x, y, TILE, 4);
    } else if (t === 7) {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(x, y, TILE, TILE);
    }
  }

  function drawLevel() {
    for (let c = 0; c < tiles.length; c++) {
      for (let r = 0; r < tiles[0].length; r++) {
        if (tiles[c][r]) drawTile(tiles[c][r], c, r);
      }
    }
    if (!flag.reached) {
      ctx.fillStyle = '#228b22';
      ctx.fillRect(flag.x - cameraX, flag.y, 6, flag.h);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(flag.x - cameraX + 20, flag.y + 20, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMario() {
    const x = mario.x - cameraX;
    const y = mario.y;
    if (Date.now() < mario.invincibleUntil && Math.floor(Date.now() / 100) % 2 === 0) return;
    ctx.save();
    if (mario.facing < 0) {
      ctx.translate(x + mario.w, y);
      ctx.scale(-1, 1);
      ctx.translate(-x, -y);
    }
    ctx.fillStyle = '#c41e3a';
    ctx.fillRect(x + 4, y + 8, 10, 12);
    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(x + 6, y + 4, 6, 6);
    ctx.fillStyle = '#0066ff';
    ctx.fillRect(x + 2, y + 20, 12, 10);
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(x + 6, y + 28, 6, 4);
    ctx.restore();
  }

  function drawEnemies() {
    enemies.forEach(e => {
      if (!e.alive) return;
      const x = e.x - cameraX;
      if (x + e.w < 0 || x > canvas.width) return;
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(x + 4, e.y + 4, e.w - 8, e.h - 8);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x + 10, e.y + 12, 4, 0, Math.PI * 2);
      ctx.arc(x + e.w - 10, e.y + 12, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCollectibles() {
    collectibles.forEach(c => {
      if (c.collected) return;
      const x = c.x - cameraX;
      if (x + c.w < 0 || x > canvas.width) return;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(x + c.w / 2, c.y + c.h / 2, c.w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function resize() {
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;
    canvas.width = w;
    canvas.height = h;
  }

  function gameLoop(t) {
    const dt = Math.min(t - lastTime, 50);
    lastTime = t;

    if (gameState === 'playing') {
      updateMario(dt);
      cameraX = Math.max(0, mario.x - canvas.width * 0.35);
      cameraX = Math.min(cameraX, levelWidth - canvas.width);
      updateHUD();
    }

    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawLevel();
    drawCollectibles();
    drawEnemies();
    drawMario();

    requestAnimationFrame(gameLoop);
  }

  let lastTime = 0;
  const keys = { left: false, right: false, jump: false };

  function startGame() {
    gameState = 'playing';
    score = 0;
    coins = 0;
    lives = 3;
    scoreEl.textContent = 'Score: 0';
    coinsEl.textContent = 'Coins: 0';
    livesEl.textContent = 'Lives: 3';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    buildLevel();
    mario.x = 80;
    mario.y = 200;
    mario.vx = 0;
    mario.vy = 0;
    mario.onGround = false;
    mario.invincibleUntil = 0;
    flag.reached = false;
  }

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'ArrowUp') { keys.jump = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space' || e.code === 'ArrowUp') keys.jump = false;
  });

  // Touch buttons
  function addButtonListeners(btn, key) {
    btn.addEventListener('touchstart', e => { e.preventDefault(); keys[key] = true; }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); keys[key] = false; }, { passive: false });
    btn.addEventListener('mousedown', () => { keys[key] = true; });
    btn.addEventListener('mouseup', () => { keys[key] = false; });
    btn.addEventListener('mouseleave', () => { keys[key] = false; });
  }
  addButtonListeners(btnLeft, 'left');
  addButtonListeners(btnRight, 'right');
  addButtonListeners(btnJump, 'jump');

  // Start / Restart
  startScreen.addEventListener('click', () => { if (gameState === 'start') startGame(); });
  startScreen.addEventListener('touchend', e => { e.preventDefault(); if (gameState === 'start') startGame(); }, { passive: false });
  btnRestart.addEventListener('click', startGame);
  btnRestart.addEventListener('touchend', e => { e.preventDefault(); startGame(); }, { passive: false });
  btnNext.addEventListener('click', startGame);
  btnNext.addEventListener('touchend', e => { e.preventDefault(); startGame(); }, { passive: false });

  function updateHUD() {
    scoreEl.textContent = 'Score: ' + score;
    coinsEl.textContent = 'Coins: ' + coins;
    livesEl.textContent = 'Lives: ' + lives;
  }

  window.addEventListener('resize', resize);
  resize();
  buildLevel();
  requestAnimationFrame(gameLoop);
})();
