import {
  GAME_HEIGHT,
  GAME_WIDTH,
  BIRD_WIDTH,
  BIRD_HEIGHT,
  BIRD_X,
  JUMP_FORCE,
  MAX_VELOCITY,
  PIPE_WIDTH,
  MIN_PIPE_HEIGHT,
  GROUND_HEIGHT,
  COIN_RADIUS,
  COIN_SCORE,
  POWERUP_SIZE,
  GAP_SHRINK_PER_SCORE,
  MIN_GAP,
  SHRINK_SCALE,
  MOVING_PIPE_THRESHOLD,
  MOVING_PIPE_AMPLITUDE,
  MOVING_PIPE_SPEED,
  BOSS_PIPE_WIDTH_MULT,
  BOSS_GAP_REDUCTION,
  BOSS_BONUS_SCORE,
  BOSS_PIPE_INTERVAL,
  COMBO_THRESHOLDS,
  DIFFICULTIES,
  type Bird,
  type Pipe,
  type Particle,
  type Coin,
  type PowerUp,
  type PowerUpType,
  type ActivePowerUp,
  type ComboState,
  type DeathAnimation,
  type Difficulty,
} from "./constants";

let pipeIdCounter = 0;

export function createBird(y: number): Bird {
  return { y, velocity: 0, rotation: 0 };
}

export function updateBird(bird: Bird, gravity: number): Bird {
  const newVelocity = Math.min(bird.velocity + gravity, MAX_VELOCITY);
  const newY = bird.y + newVelocity;
  const newRotation = Math.min(Math.max(newVelocity * 4, -30), 70);
  return { y: newY, velocity: newVelocity, rotation: newRotation };
}

export function jumpBird(bird: Bird): Bird {
  return { ...bird, velocity: JUMP_FORCE, rotation: -30 };
}

export function createPipe(gameHeight: number, gap: number, score: number): Pipe {
  const isBoss = score > 0 && score % BOSS_PIPE_INTERVAL === 0;
  const pipeWidth = isBoss ? Math.round(PIPE_WIDTH * BOSS_PIPE_WIDTH_MULT) : PIPE_WIDTH;
  const effectiveGap = isBoss ? gap - BOSS_GAP_REDUCTION : gap;
  const moving = !isBoss && score >= MOVING_PIPE_THRESHOLD && Math.random() < 0.4;

  const maxTop = gameHeight - GROUND_HEIGHT - effectiveGap - MIN_PIPE_HEIGHT;
  const topHeight = MIN_PIPE_HEIGHT + Math.random() * (maxTop - MIN_PIPE_HEIGHT);

  return {
    x: 420,
    topHeight,
    passed: false,
    id: pipeIdCounter++,
    moving,
    baseTopHeight: topHeight,
    movePhase: Math.random() * Math.PI * 2,
    isBoss,
    width: pipeWidth,
  };
}

export function updatePipes(
  pipes: readonly Pipe[],
  speed: number,
  frame: number
): readonly Pipe[] {
  return pipes
    .map((p) => {
      const newX = p.x - speed;
      if (p.moving) {
        const newPhase = p.movePhase + MOVING_PIPE_SPEED;
        const newTopHeight = p.baseTopHeight + Math.sin(newPhase) * MOVING_PIPE_AMPLITUDE;
        return { ...p, x: newX, movePhase: newPhase, topHeight: newTopHeight };
      }
      return { ...p, x: newX };
    })
    .filter((p) => p.x + p.width > -10);
}

export function checkCollision(
  bird: Bird,
  pipes: readonly Pipe[],
  gap: number,
  isShrunk: boolean
): boolean {
  const groundY = GAME_HEIGHT - GROUND_HEIGHT;
  const scale = isShrunk ? SHRINK_SCALE : 1;
  const effectiveW = BIRD_WIDTH * scale;
  const effectiveH = BIRD_HEIGHT * scale;
  const offsetX = (BIRD_WIDTH - effectiveW) / 2;
  const offsetY = (BIRD_HEIGHT - effectiveH) / 2;

  // Ground/ceiling
  if (bird.y + offsetY + effectiveH > groundY || bird.y + offsetY < 0) {
    return true;
  }

  // Pipes
  for (const pipe of pipes) {
    const inset = 16 * scale;
    const birdRight = BIRD_X + offsetX + effectiveW - inset;
    const birdLeft = BIRD_X + offsetX + inset;
    const birdTop = bird.y + offsetY + inset;
    const birdBottom = bird.y + offsetY + effectiveH - inset;

    const effectiveGap = pipe.isBoss ? gap - BOSS_GAP_REDUCTION : gap;

    if (birdRight > pipe.x && birdLeft < pipe.x + pipe.width) {
      if (birdTop < pipe.topHeight || birdBottom > pipe.topHeight + effectiveGap) {
        return true;
      }
    }
  }

  return false;
}

export function checkScore(
  pipes: readonly Pipe[],
  score: number,
  combo: ComboState
): { pipes: readonly Pipe[]; score: number; scored: boolean; combo: ComboState; bossBonus: boolean } {
  let newScore = score;
  let scored = false;
  let bossBonus = false;
  let newCombo = combo;

  const newPipes = pipes.map((p) => {
    if (!p.passed && p.x + p.width < BIRD_X) {
      const multiplier = newCombo.multiplier;
      newScore += multiplier;
      if (p.isBoss) {
        newScore += BOSS_BONUS_SCORE;
        bossBonus = true;
      }
      scored = true;

      // Update combo
      const newConsecutive = newCombo.consecutivePipes + 1;
      const newMultiplier = getComboMultiplier(newConsecutive);
      const showTimer = newMultiplier > newCombo.multiplier ? 90 : newCombo.displayTimer;
      newCombo = {
        consecutivePipes: newConsecutive,
        multiplier: newMultiplier,
        displayTimer: showTimer,
        lastMultiplier: newMultiplier > combo.multiplier ? newMultiplier : newCombo.lastMultiplier,
      };

      return { ...p, passed: true };
    }
    return p;
  });

  return { pipes: newPipes, score: newScore, scored, combo: newCombo, bossBonus };
}

function getComboMultiplier(consecutivePipes: number): number {
  let mult = 1;
  for (const t of COMBO_THRESHOLDS) {
    if (consecutivePipes >= t.pipes) {
      mult = t.multiplier;
    }
  }
  return mult;
}

export function createComboState(): ComboState {
  return { consecutivePipes: 0, multiplier: 1, displayTimer: 0, lastMultiplier: 1 };
}

export function updateComboDisplay(combo: ComboState): ComboState {
  if (combo.displayTimer <= 0) return combo;
  return { ...combo, displayTimer: combo.displayTimer - 1 };
}

// ─── Coins ───

export function createCoin(pipe: Pipe, gap: number): Coin {
  const effectiveGap = pipe.isBoss ? gap - BOSS_GAP_REDUCTION : gap;
  // Center coin exactly in the middle of the gap
  const coinY = pipe.topHeight + effectiveGap / 2;

  return {
    x: pipe.x + pipe.width / 2,
    y: coinY,
    collected: false,
    pipeId: pipe.id,
    animPhase: Math.random() * Math.PI * 2,
  };
}

export function updateCoins(
  coins: readonly Coin[],
  pipes: readonly Pipe[],
  speed: number,
  gap: number = 160
): readonly Coin[] {
  return coins
    .map((c) => {
      // Find associated pipe to track position for moving pipes
      const pipe = pipes.find((p) => p.id === c.pipeId);
      if (pipe) {
        const effectiveGap = pipe.isBoss ? gap - BOSS_GAP_REDUCTION : gap;
        // Keep coin centered in gap (tracks moving pipes)
        const coinY = pipe.topHeight + effectiveGap / 2;
        return {
          ...c,
          x: pipe.x + pipe.width / 2,
          y: coinY,
          animPhase: c.animPhase + 0.1,
        };
      }
      return { ...c, x: c.x - speed, animPhase: c.animPhase + 0.1 };
    })
    .filter((c) => !c.collected && c.x > -20);
}

export function checkCoinCollision(
  bird: Bird,
  coins: readonly Coin[],
  isShrunk: boolean
): { coins: readonly Coin[]; collected: number } {
  const scale = isShrunk ? SHRINK_SCALE : 1;
  const effectiveW = BIRD_WIDTH * scale;
  const effectiveH = BIRD_HEIGHT * scale;
  const offsetX = (BIRD_WIDTH - effectiveW) / 2;
  const offsetY = (BIRD_HEIGHT - effectiveH) / 2;

  let collected = 0;
  const newCoins = coins.map((c) => {
    if (c.collected) return c;

    const birdCX = BIRD_X + offsetX + effectiveW / 2;
    const birdCY = bird.y + offsetY + effectiveH / 2;
    const dx = birdCX - c.x;
    const dy = birdCY - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < COIN_RADIUS + effectiveW / 2 - 8) {
      collected++;
      return { ...c, collected: true };
    }
    return c;
  });

  return { coins: newCoins, collected };
}

// ─── Power-ups ───

export function createPowerUp(pipe: Pipe, gap: number, forceType?: PowerUpType): PowerUp {
  const types: PowerUpType[] = ["drunk", "shrink", "clone"];
  const type = forceType ?? types[Math.floor(Math.random() * types.length)];
  const effectiveGap = pipe.isBoss ? gap - BOSS_GAP_REDUCTION : gap;
  // Place power-up BEFORE the pipe (between pipes) so player collects it before entering
  const gapCenter = pipe.topHeight + effectiveGap / 2;
  const y = gapCenter;

  return {
    x: pipe.x - 80, // 80px before the pipe
    y,
    type,
    collected: false,
    baseY: y,
    animPhase: Math.random() * Math.PI * 2,
    pipeId: pipe.id,
  };
}

export function updatePowerUps(
  powerUps: readonly PowerUp[],
  pipes: readonly Pipe[],
  speed: number,
  gap: number = 160
): readonly PowerUp[] {
  return powerUps
    .map((p) => {
      const newPhase = p.animPhase + 0.05;
      // Move with pipe speed, bob up and down
      const pipe = pipes.find((pp) => pp.id === p.pipeId);
      const newX = pipe ? pipe.x - 80 : p.x - speed;
      const bobY = p.baseY + Math.sin(newPhase) * 10;
      return { ...p, x: newX, y: bobY, animPhase: newPhase };
    })
    .filter((p) => !p.collected && p.x > -30);
}

export function checkPowerUpCollision(
  bird: Bird,
  powerUps: readonly PowerUp[],
  isShrunk: boolean
): { powerUps: readonly PowerUp[]; collected: PowerUpType | null } {
  const scale = isShrunk ? SHRINK_SCALE : 1;
  const effectiveW = BIRD_WIDTH * scale;
  const effectiveH = BIRD_HEIGHT * scale;
  const offsetX = (BIRD_WIDTH - effectiveW) / 2;
  const offsetY = (BIRD_HEIGHT - effectiveH) / 2;

  let collectedType: PowerUpType | null = null;
  const newPowerUps = powerUps.map((p) => {
    if (p.collected) return p;

    const birdCX = BIRD_X + offsetX + effectiveW / 2;
    const birdCY = bird.y + offsetY + effectiveH / 2;
    const dx = birdCX - p.x;
    const dy = birdCY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < POWERUP_SIZE + effectiveW / 2 + 15) {
      collectedType = p.type;
      return { ...p, collected: true };
    }
    return p;
  });

  return { powerUps: newPowerUps, collected: collectedType };
}

export function getActivePowerUps(
  actives: readonly ActivePowerUp[],
  now: number
): readonly ActivePowerUp[] {
  return actives.filter((a) => {
    return a.expiresAt > now;
  });
}

export function hasActivePowerUp(
  actives: readonly ActivePowerUp[],
  type: PowerUpType
): boolean {
  return actives.some((a) => a.type === type);
}

// ─── Death animation ───

export function createDeathAnimation(birdY: number): DeathAnimation {
  return {
    active: true,
    spinSpeed: 5,
    extraRotation: 0,
    flashAlpha: 0.7,
    fallVelocity: -2,
    birdY,
  };
}

export function updateDeathAnimation(da: DeathAnimation): DeathAnimation {
  if (!da.active) return da;
  const groundY = GAME_HEIGHT - GROUND_HEIGHT - BIRD_HEIGHT;
  const newFallVel = da.fallVelocity + 0.3;
  const newY = Math.min(da.birdY + newFallVel, groundY);
  const hitGround = newY >= groundY;

  return {
    ...da,
    spinSpeed: hitGround ? 0 : da.spinSpeed + 0.5,
    extraRotation: da.extraRotation + da.spinSpeed,
    flashAlpha: Math.max(da.flashAlpha - 0.03, 0),
    fallVelocity: hitGround ? 0 : newFallVel,
    birdY: newY,
    active: !hitGround || da.flashAlpha > 0.01,
  };
}

// ─── Particles ───

export function createScoreParticles(birdY: number): readonly Particle[] {
  const colors = ["#FFD700", "#FFA500", "#FF6347", "#00CED1", "#7CFC00"];
  return Array.from({ length: 8 }, () => ({
    x: BIRD_X + BIRD_WIDTH,
    y: birdY + BIRD_HEIGHT / 2,
    vx: (Math.random() - 0.5) * 6,
    vy: (Math.random() - 0.5) * 6,
    life: 1,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 3 + Math.random() * 4,
  }));
}

export function createDeathParticles(birdY: number): readonly Particle[] {
  const colors = ["#f7c948", "#e8a735", "#ff6347", "#ffffff", "#ff4444", "#ffaa00"];
  return Array.from({ length: 30 }, () => ({
    x: BIRD_X + BIRD_WIDTH / 2,
    y: birdY + BIRD_HEIGHT / 2,
    vx: (Math.random() - 0.5) * 14,
    vy: (Math.random() - 0.5) * 14,
    life: 1,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 3 + Math.random() * 7,
  }));
}

export function createCoinParticles(x: number, y: number): readonly Particle[] {
  const colors = ["#FFD700", "#FFC700", "#FFE066", "#FFAA00"];
  return Array.from({ length: 10 }, () => ({
    x,
    y,
    vx: (Math.random() - 0.5) * 8,
    vy: (Math.random() - 0.5) * 8,
    life: 1,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 2 + Math.random() * 4,
  }));
}

export function updateParticles(particles: readonly Particle[]): readonly Particle[] {
  return particles
    .map((p) => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + 0.15,
      life: p.life - 0.02,
    }))
    .filter((p) => p.life > 0);
}

export function getDifficultySettings(difficulty: Difficulty) {
  return DIFFICULTIES[difficulty];
}

export function getHighScore(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem("flappy_highscore") || "0", 10);
}

export function saveHighScore(score: number): void {
  if (typeof window === "undefined") return;
  const current = getHighScore();
  if (score > current) {
    localStorage.setItem("flappy_highscore", String(score));
  }
}

export function getLeaderboard(): readonly { name: string; score: number }[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem("flappy_leaderboard");
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addToLeaderboard(name: string, score: number): void {
  if (typeof window === "undefined") return;
  const board = [...getLeaderboard(), { name, score }];
  board.sort((a, b) => b.score - a.score);
  const top10 = board.slice(0, 10);
  localStorage.setItem("flappy_leaderboard", JSON.stringify(top10));
}

export function getSavedDifficulty(): Difficulty {
  if (typeof window === "undefined") return "normal";
  return (localStorage.getItem("flappy_difficulty") as Difficulty) || "normal";
}

export function saveDifficulty(d: Difficulty): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("flappy_difficulty", d);
}

export function getSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("flappy_sound") !== "false";
}

export function saveSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("flappy_sound", String(enabled));
}

// --- Player Name (persistent, set once) ---
export function getSavedPlayerName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("flappy_player_name") || "";
}

export function savePlayerName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("flappy_player_name", name);
}
