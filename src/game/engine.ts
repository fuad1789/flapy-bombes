import {
  GAME_HEIGHT,
  BIRD_WIDTH,
  BIRD_HEIGHT,
  BIRD_X,
  JUMP_FORCE,
  MAX_VELOCITY,
  PIPE_WIDTH,
  MIN_PIPE_HEIGHT,
  GROUND_HEIGHT,
  DIFFICULTIES,
  type Bird,
  type Pipe,
  type Particle,
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

export function createPipe(gameHeight: number, gap: number): Pipe {
  const maxTop = gameHeight - GROUND_HEIGHT - gap - MIN_PIPE_HEIGHT;
  const topHeight = MIN_PIPE_HEIGHT + Math.random() * (maxTop - MIN_PIPE_HEIGHT);
  return {
    x: 420,
    topHeight,
    passed: false,
    id: pipeIdCounter++,
  };
}

export function updatePipes(
  pipes: readonly Pipe[],
  speed: number
): readonly Pipe[] {
  return pipes
    .map((p) => ({ ...p, x: p.x - speed }))
    .filter((p) => p.x + PIPE_WIDTH > -10);
}

export function checkCollision(
  bird: Bird,
  pipes: readonly Pipe[],
  gap: number
): boolean {
  const groundY = GAME_HEIGHT - GROUND_HEIGHT;

  // Ground/ceiling
  if (bird.y + BIRD_HEIGHT > groundY || bird.y < 0) {
    return true;
  }

  // Pipes
  for (const pipe of pipes) {
    // Generous hitbox inset — character PNG has transparent edges
    const inset = 16;
    const birdRight = BIRD_X + BIRD_WIDTH - inset;
    const birdLeft = BIRD_X + inset;
    const birdTop = bird.y + inset;
    const birdBottom = bird.y + BIRD_HEIGHT - inset;

    if (birdRight > pipe.x && birdLeft < pipe.x + PIPE_WIDTH) {
      if (birdTop < pipe.topHeight || birdBottom > pipe.topHeight + gap) {
        return true;
      }
    }
  }

  return false;
}

export function checkScore(
  pipes: readonly Pipe[],
  score: number
): { pipes: readonly Pipe[]; score: number; scored: boolean } {
  let newScore = score;
  let scored = false;
  const newPipes = pipes.map((p) => {
    if (!p.passed && p.x + PIPE_WIDTH < BIRD_X) {
      newScore++;
      scored = true;
      return { ...p, passed: true };
    }
    return p;
  });
  return { pipes: newPipes, score: newScore, scored };
}

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
  const colors = ["#f7c948", "#e8a735", "#ff6347", "#ffffff"];
  return Array.from({ length: 15 }, () => ({
    x: BIRD_X + BIRD_WIDTH / 2,
    y: birdY + BIRD_HEIGHT / 2,
    vx: (Math.random() - 0.5) * 10,
    vy: (Math.random() - 0.5) * 10,
    life: 1,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 3 + Math.random() * 5,
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
