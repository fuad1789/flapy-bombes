export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 700;

export const BIRD_WIDTH = 72;
export const BIRD_HEIGHT = 72;
export const BIRD_X = 70;

export const GRAVITY = 0.12;
export const JUMP_FORCE = -4.2;
export const MAX_VELOCITY = 4.5;
export const TARGET_FPS = 60;

export const PIPE_WIDTH = 60;
export const PIPE_GAP = 160;
export const PIPE_SPEED = 2.5;
export const PIPE_SPAWN_INTERVAL = 1800;
export const MIN_PIPE_HEIGHT = 80;

export const GROUND_HEIGHT = 80;

// Progressive gap shrink (gentle curve)
export const GAP_SHRINK_PER_SCORE = 0.8; // gap reduces by 0.8px per point scored
export const MIN_GAP = BIRD_HEIGHT + 50; // never smaller than bird + 50px margin

// Coin constants
export const COIN_RADIUS = 18;
export const COIN_SCORE = 3;

// Power-up constants
export const POWERUP_SIZE = 28;
export const POWERUP_SPAWN_INTERVAL = 15000; // ~15 seconds
export const POWERUP_DURATION = 5000; // 5 seconds for timed power-ups
export const SHRINK_SCALE = 0.6;
export const SLOWDOWN_FACTOR = 0.5;

// Boss pipe constants
export const BOSS_PIPE_INTERVAL = 25;
export const BOSS_PIPE_WIDTH_MULT = 1.5;
export const BOSS_GAP_REDUCTION = 15;
export const BOSS_BONUS_SCORE = 5;

// Moving pipe constants
export const MOVING_PIPE_THRESHOLD = 25;
export const MOVING_PIPE_AMPLITUDE = 22;
export const MOVING_PIPE_SPEED = 0.015;

// Combo constants
export const COMBO_THRESHOLDS = [
  { pipes: 0, multiplier: 1 },
  { pipes: 3, multiplier: 2 },
  { pipes: 6, multiplier: 3 },
  { pipes: 10, multiplier: 4 },
] as const;

export const DIFFICULTIES = {
  easy: { gap: 220, speed: 1.6, gravity: 0.08, label: "Asan" },
  normal: { gap: 195, speed: 1.9, gravity: 0.10, label: "Normal" },
  hard: { gap: 165, speed: 2.4, gravity: 0.16, label: "Çətin" },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;

export type PowerUpType = "shield" | "shrink" | "slowdown";

export interface Pipe {
  readonly x: number;
  readonly topHeight: number;
  readonly passed: boolean;
  readonly id: number;
  readonly moving: boolean;
  readonly baseTopHeight: number;
  readonly movePhase: number;
  readonly isBoss: boolean;
  readonly width: number;
}

export interface Bird {
  readonly y: number;
  readonly velocity: number;
  readonly rotation: number;
}

export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
  readonly color: string;
  readonly size: number;
}

export interface Coin {
  readonly x: number;
  readonly y: number;
  readonly collected: boolean;
  readonly pipeId: number;
  readonly animPhase: number;
}

export interface PowerUp {
  readonly x: number;
  readonly y: number;
  readonly type: PowerUpType;
  readonly collected: boolean;
  readonly baseY: number;
  readonly animPhase: number;
  readonly pipeId: number;
}

export interface ActivePowerUp {
  readonly type: PowerUpType;
  readonly expiresAt: number; // timestamp when it expires (0 for shield = until hit)
}

export interface ComboState {
  readonly consecutivePipes: number;
  readonly multiplier: number;
  readonly displayTimer: number; // frames to show combo text
  readonly lastMultiplier: number; // for pop animation
}

export interface DeathAnimation {
  readonly active: boolean;
  readonly spinSpeed: number;
  readonly extraRotation: number;
  readonly flashAlpha: number;
  readonly fallVelocity: number;
  readonly birdY: number;
}

export type GameScreen = "menu" | "playing" | "gameover" | "settings" | "leaderboard";
