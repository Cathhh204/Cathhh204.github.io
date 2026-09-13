// ─────────────────────────────────────────────
//  Crossy Road Clone  –  Canvas 2D, no libs
// ─────────────────────────────────────────────

(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Isometric constants ────────────────────────
  const TILE_W = 80;   // iso tile width  (x-axis span)
  const TILE_H = 40;   // iso tile height (y-axis span)
  const SIDE_H = 18;   // block thickness
  const COLS   = 9;    // number of tile columns

  // ── World constants ────────────────────────────
  const LANE_AHEAD  = 16;
  const LANE_BEHIND = 8;

  // Lane types
  const TYPE_GRASS = 'grass';
  const TYPE_ROAD  = 'road';
  const TYPE_WATER = 'water';

  // ── Colour palette ─────────────────────────────
  const COLORS = {
    // Grass – bright green
    grassTop:    '#5aad3f',
    grassRight:  '#3d8029',
    grassLeft:   '#2e6020',

    // Road – dark asphalt
    roadTop:     '#4a4a4a',
    roadRight:   '#2e2e2e',
    roadLeft:    '#222222',
    roadLine:    '#f0d84a',

    // Water – flat blue (no side faces drawn)
    waterTop:    '#1b6ca8',
    waterRipple: 'rgba(255,255,255,0.13)',

    // Logs
    logTop:      '#8B5E3C',
    logRight:    '#6B4423',
    logLeft:     '#4e3119',

    // Scotty dog – black body, CMU-red collar
    dogBody:      '#1a1a1a',
    dogBodyShade: '#0a0a0a',
    dogBodyDark:  '#000000',
    dogCollar:    '#c41230',   // CMU red
    dogCollarDk:  '#8a0c20',
    dogEye:       '#ffffff',
    dogNose:      '#333333',

    // Cars – [top, right-side, left-side]
    carColors: [
      ['#e74c3c', '#c0392b', '#962d22'],
      ['#3498db', '#2176ae', '#165880'],
      ['#2ecc71', '#27ae60', '#1e8449'],
      ['#9b59b6', '#7d3c98', '#6c3483'],
      ['#e67e22', '#ca6f1e', '#a04000'],
    ],
  };

  // ── Seeded PRNG (mulberry32) ───────────────────
  function makePrng(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6d2b79f5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
    };
  }

  // ── Easing ────────────────────────────────────
  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ── Difficulty ────────────────────────────────
  function difficultyFactor(row) {
    return Math.min(1, row / 80);
  }

  function laneWeights(diff) {
    const grass = 0.58 - 0.38 * diff;
    const water = 0.05 + 0.28 * diff;
    const road  = 1 - grass - water;
    return { grass, road, water };
  }

  function obstacleSpeed(diff) {
    return {
      min: 1.5 + 2.0 * diff,
      max: 3.5 + 4.0 * diff,
    };
  }

  // ── Iso projection (ORIGINAL – unchanged) ─────
  // grid: gx = column (0…COLS-1), gy = row (increases going forward/up-screen)
  // cameraRow anchors the viewport; screenOriginX/Y is the canvas-space position
  // of tile (COLS/2, cameraRow).
  function isoProject(gx, gy, gz, cameraRow, originX, originY) {
    const relRow = gy - cameraRow;
    const sx = originX + (gx - (COLS - 1) / 2) * (TILE_W / 2)
                       + relRow * (TILE_W / 2);
    const sy = originY - (gx - (COLS - 1) / 2) * (TILE_H / 2)
                       + relRow * (TILE_H / 2)
                       - gz * SIDE_H;
    return { sx, sy };
  }

  // ── Render helpers ─────────────────────────────
  function getScreenOrigin() {
    return { ox: canvas.width / 2, oy: canvas.height * 0.70 };
  }

  function tileToScreen(gx, gy, gz) {
    const { ox, oy } = getScreenOrigin();
    return isoProject(gx, gy, gz, cameraRow, ox, oy);
  }

  // ── Draw primitives ───────────────────────────

  // Standard raised iso block: top diamond + right side + left side.
  function drawBlock(sx, sy, topColor, rightColor, leftColor) {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;

    // Top face (diamond)
    ctx.beginPath();
    ctx.moveTo(sx,          sy);
    ctx.lineTo(sx + hw,     sy - hh);
    ctx.lineTo(sx + TILE_W, sy);
    ctx.lineTo(sx + hw,     sy + hh);
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();

    // Right side face
    ctx.beginPath();
    ctx.moveTo(sx + TILE_W, sy);
    ctx.lineTo(sx + hw,     sy + hh);
    ctx.lineTo(sx + hw,     sy + hh + SIDE_H);
    ctx.lineTo(sx + TILE_W, sy       + SIDE_H);
    ctx.closePath();
    ctx.fillStyle = rightColor;
    ctx.fill();

    // Left side face
    ctx.beginPath();
    ctx.moveTo(sx,      sy);
    ctx.lineTo(sx + hw, sy + hh);
    ctx.lineTo(sx + hw, sy + hh + SIDE_H);
    ctx.lineTo(sx,      sy       + SIDE_H);
    ctx.closePath();
    ctx.fillStyle = leftColor;
    ctx.fill();
  }

  // Draw one full water lane row as a single filled band.
  // In this iso projection the union of all COLS tile-diamonds in a row forms
  // a hexagon. We compute it from the four extreme corners of the row and fill
  // it solid blue, then add a ripple stripe on top.
  function drawWaterLane(gy) {
    // The row spans gx = 0 … COLS-1.
    // Its six extreme corners in screen space:
    //   left tip  : tileToScreen(0,    gy+0.5, 0)  ← leftmost point of row
    //   right tip : tileToScreen(COLS, gy+0.5, 0)  ← rightmost point
    //   top-left  : tileToScreen(0,    gy+1,   0)  ← back-left
    //   top-right : tileToScreen(COLS, gy+1,   0)  ← back-right
    //   bot-left  : tileToScreen(0,    gy,     0)  ← front-left
    //   bot-right : tileToScreen(COLS, gy,     0)  ← front-right
    //
    // The filled shape is the parallelogram:
    //   back-left → back-right → front-right → front-left
    // (This is exactly the bounding quad of the whole row.)

    const TL = tileToScreen(0,    gy + 1, 0);
    const TR = tileToScreen(COLS, gy + 1, 0);
    const BR = tileToScreen(COLS, gy,     0);
    const BL = tileToScreen(0,    gy,     0);

    ctx.beginPath();
    ctx.moveTo(TL.sx, TL.sy);
    ctx.lineTo(TR.sx, TR.sy);
    ctx.lineTo(BR.sx, BR.sy);
    ctx.lineTo(BL.sx, BL.sy);
    ctx.closePath();
    ctx.fillStyle = COLORS.waterTop;
    ctx.fill();

    // Ripple highlight: a lighter stripe across the middle third of the row
    const ML  = tileToScreen(0,    gy + 0.65, 0);
    const MR  = tileToScreen(COLS, gy + 0.65, 0);
    const MLb = tileToScreen(0,    gy + 0.45, 0);
    const MRb = tileToScreen(COLS, gy + 0.45, 0);
    ctx.beginPath();
    ctx.moveTo(ML.sx,  ML.sy);
    ctx.lineTo(MR.sx,  MR.sy);
    ctx.lineTo(MRb.sx, MRb.sy);
    ctx.lineTo(MLb.sx, MLb.sy);
    ctx.closePath();
    ctx.fillStyle = COLORS.waterRipple;
    ctx.fill();
  }

  // Wide iso box spanning [gxLeft, gxRight] on a row at height gz.
  // Used for cars and logs (fractional x positions allowed).
  function drawWideBlock(gxLeft, gxRight, gy, gz, topColor, rightColor, frontColor) {
    const p1 = tileToScreen(gxLeft,  gy,     gz);
    const p2 = tileToScreen(gxRight, gy,     gz);
    const p3 = tileToScreen(gxRight, gy + 1, gz);
    const p4 = tileToScreen(gxLeft,  gy + 1, gz);
    const b2 = tileToScreen(gxRight, gy,     0);
    const b3 = tileToScreen(gxRight, gy + 1, 0);
    const b4 = tileToScreen(gxLeft,  gy + 1, 0);

    // Top face
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy);
    ctx.lineTo(p4.sx, p4.sy);
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();

    // Right side
    ctx.beginPath();
    ctx.moveTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy);
    ctx.lineTo(b3.sx, b3.sy);
    ctx.lineTo(b2.sx, b2.sy);
    ctx.closePath();
    ctx.fillStyle = rightColor;
    ctx.fill();

    // Front side
    ctx.beginPath();
    ctx.moveTo(p3.sx, p3.sy);
    ctx.lineTo(p4.sx, p4.sy);
    ctx.lineTo(b4.sx, b4.sy);
    ctx.lineTo(b3.sx, b3.sy);
    ctx.closePath();
    ctx.fillStyle = frontColor;
    ctx.fill();
  }

  // ── Lane generation ────────────────────────────
  let rng;
  let consecutiveDanger = 0;

  function generateLane(rowIndex) {
    if (rowIndex <= 2) {
      consecutiveDanger = 0;
      return { type: TYPE_GRASS, row: rowIndex, cars: [], logs: [] };
    }

    const diff   = difficultyFactor(rowIndex);
    const w      = laneWeights(diff);
    const speeds = obstacleSpeed(diff);

    let type;
    if (consecutiveDanger >= 3) {
      type = TYPE_GRASS;
    } else {
      const r = rng();
      if      (r < w.grass)           type = TYPE_GRASS;
      else if (r < w.grass + w.road)  type = TYPE_ROAD;
      else                             type = TYPE_WATER;
    }
    consecutiveDanger = (type === TYPE_GRASS) ? 0 : consecutiveDanger + 1;

    const lane = { type, row: rowIndex, cars: [], logs: [] };

    if (type === TYPE_ROAD) {
      const dir      = rng() < 0.5 ? 1 : -1;
      const speed    = speeds.min + rng() * (speeds.max - speeds.min);
      const maxCars  = 2 + Math.floor(diff * 2);
      const carCount = 1 + Math.floor(rng() * maxCars);
      const colorIdx = Math.floor(rng() * COLORS.carColors.length);
      for (let i = 0; i < carCount; i++) {
        lane.cars.push({ x: rng() * COLS, dir, speed, colorIdx, width: 1.6 });
      }
    } else if (type === TYPE_WATER) {
      const dir      = rng() < 0.5 ? 1 : -1;
      const speed    = speeds.min * 0.6 + rng() * (speeds.max * 0.6 - speeds.min * 0.6);
      const logCount = 2 + Math.floor(rng() * 3);
      const spacing  = COLS / logCount;
      for (let i = 0; i < logCount; i++) {
        lane.logs.push({
          x:     i * spacing + rng() * 0.5,
          dir,
          speed,
          width: 1.8 + rng() * 1.4,
        });
      }
    }

    return lane;
  }

  // ── Game state ─────────────────────────────────
  let state, player, lanes, score, maxRow, cameraRow, deathCause;

  function initGame() {
    rng = makePrng(Date.now() & 0xffffffff);
    consecutiveDanger = 0;

    player = {
      gx: Math.floor(COLS / 2),
      gy: 0,
      logOffsetX:     0,
      fromLogOffsetX: 0,
      animating: false,
      animT:     0,
      animDur:   0.14,
      fromGx: Math.floor(COLS / 2),
      fromGy: 0,
      toGx:   Math.floor(COLS / 2),
      toGy:   0,
    };

    lanes      = [];
    score      = 0;
    maxRow     = 0;
    state      = 'playing';
    cameraRow  = 0;
    deathCause = '';

    for (let r = -LANE_BEHIND; r <= LANE_AHEAD; r++) {
      lanes.push(generateLane(r));
    }
  }

  function getLane(row) {
    return lanes.find(l => l.row === row) || null;
  }

  function maintainLanes() {
    const minRow    = player.gy - LANE_BEHIND;
    const maxNeeded = player.gy + LANE_AHEAD;
    lanes = lanes.filter(l => l.row >= minRow);
    for (let r = minRow; r <= maxNeeded; r++) {
      if (!getLane(r)) lanes.push(generateLane(r));
    }
  }

  // ── Input ──────────────────────────────────────
  const keysDown = {};

  window.addEventListener('keydown', function (e) {
    if (keysDown[e.code]) return;
    keysDown[e.code] = true;

    if (state === 'dead') {
      if (e.code === 'KeyR') initGame();
      return;
    }
    if (player.animating) return;

    let dx = 0, dy = 0;
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') dy =  1;
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') dy = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') dx =  1;
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') dx = -1;
    if (dx === 0 && dy === 0) return;

    const nx = player.gx + dx;
    const ny = player.gy + dy;
    if (nx < 0 || nx >= COLS) return;
    if (ny < 0) return;

    player.animating      = true;
    player.animT          = 0;
    player.fromGx         = player.gx;
    player.fromGy         = player.gy;
    player.toGx           = nx;
    player.toGy           = ny;
    player.fromLogOffsetX = player.logOffsetX;
  });

  window.addEventListener('keyup', function (e) {
    keysDown[e.code] = false;
  });

  // ── Log helpers ───────────────────────────────
  function getStandingLog(gx, gy) {
    const lane = getLane(gy);
    if (!lane || lane.type !== TYPE_WATER) return null;
    const px = gx + 0.5;
    for (const log of lane.logs) {
      if (px >= log.x && px <= log.x + log.width) return log;
    }
    return null;
  }

  // ── Collision ─────────────────────────────────
  // Both functions receive the player's SETTLED integer grid position only.
  // They look up the lane by exact integer row match, so a car or log on any
  // other row can never contribute to the result.
  function checkCarCollision(gx, gy) {
    const lane = getLane(Math.round(gy));   // Math.round is a safety net
    if (!lane || lane.type !== TYPE_ROAD) return false;
    if (lane.row !== Math.round(gy)) return false;  // extra explicit guard
    const pL = gx + 0.2, pR = gx + 0.8;   // slightly tighter hitbox
    for (const car of lane.cars) {
      if (pR > car.x && pL < car.x + car.width) return true;
    }
    return false;
  }

  function checkDrown(gx, gy) {
    const lane = getLane(Math.round(gy));
    if (!lane || lane.type !== TYPE_WATER) return false;
    if (lane.row !== Math.round(gy)) return false;
    return getStandingLog(gx, Math.round(gy)) === null;
  }

  // ── Update ─────────────────────────────────────
  function update(dt) {
    if (state !== 'playing') return;

    // Move obstacles
    for (const lane of lanes) {
      if (lane.type === TYPE_ROAD) {
        for (const car of lane.cars) {
          car.x += car.dir * car.speed * dt;
          if (car.x > COLS + 1)       car.x -= COLS + car.width + 2;
          if (car.x < -car.width - 1) car.x += COLS + car.width + 2;
        }
      } else if (lane.type === TYPE_WATER) {
        for (const log of lane.logs) {
          log.x += log.dir * log.speed * dt;
          if (log.x > COLS + 1)       log.x -= COLS + log.width + 2;
          if (log.x < -log.width - 1) log.x += COLS + log.width + 2;
        }
      }
    }

    // Hop animation
    if (player.animating) {
      player.animT += dt;
      if (player.animT >= player.animDur) {
        player.animT      = player.animDur;
        player.animating  = false;
        player.gx         = player.toGx;
        player.gy         = player.toGy;
        player.logOffsetX = 0;
        if (player.gy > maxRow) { maxRow = player.gy; score = maxRow; }
        maintainLanes();
        // Check collision immediately on landing (player.gy is now the new row).
        // Use integer gx/gy only — never the interpolated render position.
        if (checkCarCollision(player.gx, player.gy)) { deathCause = 'car';   state = 'dead'; return; }
        if (checkDrown(player.gx, player.gy))        { deathCause = 'drown'; state = 'dead'; return; }
      }
    }

    // Log riding (idle only)
    if (!player.animating) {
      const lane = getLane(player.gy);
      if (lane && lane.type === TYPE_WATER) {
        const log = getStandingLog(player.gx, player.gy);
        if (log) {
          player.logOffsetX += log.dir * log.speed * dt;
          if (player.logOffsetX >= 1)  { player.gx++; player.logOffsetX -= 1; }
          if (player.logOffsetX <= -1) { player.gx--; player.logOffsetX += 1; }
        }
      } else {
        player.logOffsetX = 0;
      }
    }

    // Idle death checks — only while fully settled, never during or just after a hop.
    // player.gx / player.gy are always integer grid coords here.
    if (!player.animating) {
      const cx = player.gx + player.logOffsetX;
      if (cx < -0.5 || cx > COLS - 0.5) { deathCause = 'offscreen'; state = 'dead'; return; }
      // Only check car collision on road rows — getLane returns the exact integer row,
      // so this can never fire for a car that is on a different lane.
      if (checkCarCollision(player.gx, player.gy)) { deathCause = 'car';   state = 'dead'; return; }
      if (checkDrown(player.gx, player.gy))        { deathCause = 'drown'; state = 'dead'; return; }
    }

    // Camera smooth follow
    const targetCamera = player.gy + 3;
    cameraRow += (targetCamera - cameraRow) * Math.min(1, dt * 8);
  }

  // ── Object draw functions ──────────────────────

  function drawCar(car, lane) {
    const c = COLORS.carColors[car.colorIdx];
    drawWideBlock(car.x, car.x + car.width, lane.row, 1, c[0], c[1], c[2]);
  }

  function drawLog(log, lane) {
    drawWideBlock(log.x, log.x + log.width, lane.row, 0.6,
      COLORS.logTop, COLORS.logRight, COLORS.logLeft);
  }

  // ── Scotty Dog (CMU Scotty) ───────────────────
  //
  // Built from small iso boxes all drawn relative to a base position (bgx, bgy, bgz).
  // dogBox(ox, oy, oz, w, d, h, top, right, left) draws a box whose back-left-bottom
  // corner is at (bgx+ox, bgy+oy, bgz+oz) with size w×d×h in grid units.
  //
  // Grid unit mapping (fractions of a tile):
  //   1 tile = TILE_W px wide, TILE_H px tall in iso-top, SIDE_H px per gz unit
  //
  // The dog faces "forward" (toward the viewer, i.e. -gy direction).

  function drawPlayer() {
    // Resolve base world position
    let bgx, bgy, bgz;
    if (player.animating) {
      const t  = player.animT / player.animDur;
      const et = easeInOut(t);
      bgx = (player.fromGx + player.fromLogOffsetX)
          + (player.toGx - (player.fromGx + player.fromLogOffsetX)) * et;
      bgy = player.fromGy + (player.toGy - player.fromGy) * et;
      bgz = Math.sin(t * Math.PI) * 1.2;
    } else {
      bgx = player.gx + player.logOffsetX;
      bgy = player.gy;
      bgz = 0;
    }

    // 用和地块完全相同的方式绘制，保证对齐
    const { sx, sy } = tileToScreen(bgx, bgy, bgz);
    drawBlock(sx, sy, '#1a1a1a', '#0d0d0d', '#050505');

    // CMU 红围巾：贴在方块顶面上的一条细带
    const c1 = tileToScreen(bgx + 0.15, bgy + 0.30, bgz + 0.02);
    const c2 = tileToScreen(bgx + 0.85, bgy + 0.30, bgz + 0.02);
    const c3 = tileToScreen(bgx + 0.85, bgy + 0.55, bgz + 0.02);
    const c4 = tileToScreen(bgx + 0.15, bgy + 0.55, bgz + 0.02);
    ctx.beginPath();
    ctx.moveTo(c1.sx + TILE_W / 2, c1.sy);
    ctx.lineTo(c2.sx + TILE_W / 2, c2.sy);
    ctx.lineTo(c3.sx + TILE_W / 2, c3.sy);
    ctx.lineTo(c4.sx + TILE_W / 2, c4.sy);
    ctx.closePath();
    ctx.fillStyle = COLORS.dogCollar;
    ctx.fill();
  }

  // ── Render ─────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── Blue sky gradient ─────────────────────────
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0,   '#1a6fbd');   // deep blue at top
    grad.addColorStop(0.6, '#5aaee8');   // lighter blue near horizon
    grad.addColorStop(1,   '#8ecfef');   // pale blue at ground level
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Chunky blocky clouds (drawn in screen space, behind world) ──────
    // Each cloud is a cluster of overlapping rounded rectangles.
    // Positions are expressed as fractions of canvas size so they scale.
    function drawCloud(cx, cy, scale) {
      const puffs = [
        [0,    0,    60, 34],
        [44,  -14,   52, 30],
        [88,   -4,   56, 32],
        [22,  -26,   44, 28],
        [66,  -22,   48, 28],
      ];
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      for (const [px, py, pw, ph] of puffs) {
        const rx = cx + px * scale;
        const ry = cy + py * scale;
        const rw = pw * scale;
        const rh = ph * scale;
        const r  = Math.min(rw, rh) * 0.38;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, r);
        ctx.fill();
      }
    }

    // A handful of fixed clouds spread across the upper sky area
    const cloudDefs = [
      [0.08, 0.06, 0.55],
      [0.38, 0.03, 0.70],
      [0.68, 0.08, 0.50],
      [0.82, 0.14, 0.60],
      [0.22, 0.16, 0.45],
      [0.54, 0.18, 0.38],
    ];
    for (const [fx, fy, sc] of cloudDefs) {
      drawCloud(fx * canvas.width, fy * canvas.height, sc);
    }

    const visStart = Math.floor(cameraRow) - LANE_BEHIND;
    const visEnd   = Math.floor(cameraRow) + LANE_AHEAD;

    // Painter's algorithm: larger gy = further up screen = draw first
    const sortedLanes = lanes
      .filter(l => l.row >= visStart && l.row <= visEnd)
      .sort((a, b) => b.row - a.row);

    for (const lane of sortedLanes) {
      const r = lane.row;

      // ── Ground tiles ──────────────────────────
      if (lane.type === TYPE_GRASS) {
        for (let col = 0; col < COLS; col++) {
          const { sx, sy } = tileToScreen(col, r, 0);
          drawBlock(sx, sy, COLORS.grassTop, COLORS.grassRight, COLORS.grassLeft);
        }

      } else if (lane.type === TYPE_ROAD) {
        for (let col = 0; col < COLS; col++) {
          const { sx, sy } = tileToScreen(col, r, 0);
          drawBlock(sx, sy, COLORS.roadTop, COLORS.roadRight, COLORS.roadLeft);
        }
        // Yellow dashed centre-lane markings
        for (let col = 0; col < COLS; col++) {
          const { sx: x1, sy: y1 } = tileToScreen(col,     r + 0.5, 0.05);
          const { sx: x2, sy: y2 } = tileToScreen(col + 1, r + 0.5, 0.05);
          ctx.beginPath();
          ctx.setLineDash([6, 10]);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = COLORS.roadLine;
          ctx.lineWidth   = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        for (const car of lane.cars) drawCar(car, lane);

      } else if (lane.type === TYPE_WATER) {
        // Fill the entire lane row as one solid blue band, then draw logs on top
        drawWaterLane(r);
        for (const log of lane.logs) drawLog(log, lane);
      }
    }

    // Player always on top
    drawPlayer();

    // ── HUD ──────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.beginPath();
    ctx.roundRect(12, 12, 150, 50, 8);
    ctx.fill();

    ctx.fillStyle = '#aaa';
    ctx.font      = 'bold 12px monospace';
    ctx.fillText('SCORE', 24, 32);
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 26px monospace';
    ctx.fillText(score, 24, 55);

    // Difficulty bar
    const diff = difficultyFactor(score);
    if (diff > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(12, 66, 128, 5);
      ctx.fillStyle = diff < 0.5 ? '#f5c842' : diff < 0.8 ? '#e67e22' : '#e74c3c';
      ctx.fillRect(12, 66, 128 * diff, 5);
    }

    // ── Game over overlay ─────────────────────────
    if (state === 'dead') {
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width  / 2;
      const cy = canvas.height / 2;
      ctx.textAlign = 'center';

      ctx.fillStyle = '#fff';
      ctx.font      = 'bold 52px monospace';
      ctx.fillText('GAME OVER', cx, cy - 52);

      const causeText = deathCause === 'drown'     ? '💧 You drowned!'
                      : deathCause === 'offscreen' ? '🌊 Swept away!'
                      :                              '🚗 Hit by a car!';
      ctx.font      = '22px monospace';
      ctx.fillStyle = '#f88';
      ctx.fillText(causeText, cx, cy - 12);

      ctx.font      = 'bold 30px monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText('Score: ' + score, cx, cy + 28);

      ctx.font      = '20px monospace';
      ctx.fillStyle = '#f5c842';
      ctx.fillText('Press  R  to restart', cx, cy + 68);

      ctx.textAlign = 'left';
    }
  }

  // ── Game loop ──────────────────────────────────
  let lastTime = null;
  const MAX_DT = 0.05;

  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    const dt = Math.min((ts - lastTime) / 1000, MAX_DT);
    lastTime = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  initGame();
  requestAnimationFrame(loop);

}());
