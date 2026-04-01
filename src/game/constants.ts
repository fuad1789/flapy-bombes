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

export const DIFFICULTIES = {
  easy: { gap: 210, speed: 1.8, gravity: 0.08, label: "Asan" },
  normal: { gap: 180, speed: 2.2, gravity: 0.12, label: "Normal" },
  hard: { gap: 150, speed: 2.8, gravity: 0.2, label: "Çətin" },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;

export interface Pipe {
  readonly x: number;
  readonly topHeight: number;
  readonly passed: boolean;
  readonly id: number;
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

export type GameScreen = "menu" | "playing" | "gameover" | "settings" | "leaderboard";
