"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_HEIGHT,
  BIRD_X,
  BIRD_WIDTH,
  BIRD_HEIGHT,
  DIFFICULTIES,
  COIN_SCORE,
  POWERUP_SPAWN_INTERVAL,
  POWERUP_DURATION,
  SHRINK_DURATION,
  CLONE_DURATION,
  CLONE_Y_OFFSET,
  DRUNK_DURATION,
  BOSS_PIPE_INTERVAL,
  GAP_SHRINK_PER_SCORE,
  MIN_GAP,
  type Pipe,
  type Particle,
  type Coin,
  type PowerUp,
  type ActivePowerUp,
  type ComboState,
  type DeathAnimation,
  type GameScreen,
  type Difficulty,
  type PowerUpType,
} from "@/game/constants";
import {
  createBird,
  updateBird,
  jumpBird,
  createPipe,
  updatePipes,
  checkCollision,
  checkScore,
  createScoreParticles,
  createDeathParticles,
  createCoinParticles,
  updateParticles,
  createCoin,
  updateCoins,
  checkCoinCollision,
  createPowerUp,
  updatePowerUps,
  checkPowerUpCollision,
  getActivePowerUps,
  hasActivePowerUp,
  createComboState,
  updateComboDisplay,
  createDeathAnimation,
  updateDeathAnimation,
  getHighScore,
  saveHighScore,
  getLeaderboard,
  addToLeaderboard,
  getSavedDifficulty,
  saveDifficulty,
  getSoundEnabled,
  saveSoundEnabled,
} from "@/game/engine";
import {
  drawBackground,
  drawGround,
  drawPipe,
  drawBird,
  drawCloneBird,
  drawParticles,
  drawScore,
  drawGetReady,
  drawCoin,
  drawPowerUp,
  drawPowerUpIndicator,
  drawCombo,
  drawScreenFlash,
} from "@/game/renderer";

// Shuffle intro power-up order (Fisher-Yates)
function shuffleIntro(): PowerUpType[] {
  const arr: PowerUpType[] = ["drunk", "shrink", "clone"];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* --- Sound hook --- */
function useSoundEffects(enabled: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pipeBuffersRef = useRef<AudioBuffer[]>([]);
  const pipeAudiosRef = useRef<HTMLAudioElement[]>([]);
  const lastPipeIndexRef = useRef(-1);
  const jumpSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const jumpPlayingRef = useRef(false);
  const jumpAudioRef = useRef<HTMLAudioElement | null>(null);
  const jumpBufferRef = useRef<AudioBuffer | null>(null);

  const getCtx = useCallback(() => {
    if (!enabled) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, [enabled]);

  const playTone = useCallback(
    (freq: number, duration: number, type: OscillatorType = "square") => {
      const ctx = getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    [getCtx]
  );

  const PIPE_SOUNDS = useMemo(() => [
    "/1-cibodenso.mp3",
    "/2-daqadenso.mp3",
    "/3-daqaqandes.mp3",
    "/4-diboqandes.mp3",
    "/5-lebobomba.mp3",
    "/6-lobobomba.mp3",
    "/7-leboqeneeees.mp3",
    "/8-diboqamayallaaaaa.mp3",
  ], []);

  // Load all pipe sound buffers for Web Audio API (shrink mode)
  useEffect(() => {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx || pipeBuffersRef.current.length > 0) return;
    Promise.all(
      PIPE_SOUNDS.map((src) =>
        fetch(src)
          .then((r) => r.arrayBuffer())
          .then((buf) => ctx.decodeAudioData(buf))
      )
    )
      .then((decoded) => { pipeBuffersRef.current = decoded; })
      .catch(() => {});
  }, [enabled, getCtx, PIPE_SOUNDS]);

  // Pre-create HTMLAudioElements for normal mode
  useEffect(() => {
    if (!enabled || pipeAudiosRef.current.length > 0) return;
    pipeAudiosRef.current = PIPE_SOUNDS.map((src) => {
      const a = new Audio(src);
      a.volume = 0.5;
      return a;
    });
  }, [enabled, PIPE_SOUNDS]);

  // Load jump sound buffer for Web Audio API effects
  useEffect(() => {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx || jumpBufferRef.current) return;
    fetch("/cecenq.mp3")
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => { jumpBufferRef.current = decoded; })
      .catch(() => {});
  }, [enabled, getCtx]);

  // Pre-create HTMLAudioElement for jump sound
  useEffect(() => {
    if (!enabled || jumpAudioRef.current) return;
    jumpAudioRef.current = new Audio("/cecenq.mp3");
  }, [enabled]);

  // Pick a random index different from the last one
  const pickRandomIndex = useCallback(() => {
    const count = PIPE_SOUNDS.length;
    if (count <= 1) return 0;
    let idx = Math.floor(Math.random() * (count - 1));
    if (idx >= lastPipeIndexRef.current) idx++;
    lastPipeIndexRef.current = idx;
    return idx;
  }, [PIPE_SOUNDS.length]);

  // Play random pipe sound with effects based on power-up state
  const playJumpAudio = useCallback((isShrunk = false, isDrunk = false, isClone = false): { idx: number; durationMs: number } => {
    if (!enabled) return { idx: -1, durationMs: 0 };
    // Stop jump sound if playing
    if (jumpAudioRef.current) {
      jumpAudioRef.current.pause();
      jumpAudioRef.current.currentTime = 0;
    }

    const idx = pickRandomIndex();
    const needsWebAudio = isShrunk || isDrunk || isClone;

    if (needsWebAudio) {
      // Web Audio API mode for effects
      const ctx = getCtx();
      if (ctx && pipeBuffersRef.current.length > 0) {
        if (jumpSourceRef.current) {
          try { jumpSourceRef.current.stop(); } catch { /* already stopped */ }
        }
        const source = ctx.createBufferSource();
        source.buffer = pipeBuffersRef.current[idx];

        let lastNode: AudioNode = source;

        if (isShrunk) {
          // Chipmunk: fast + highpass + nasal boost
          source.playbackRate.value = 1.8;

          const highpass = ctx.createBiquadFilter();
          highpass.type = "highpass";
          highpass.frequency.value = 900;

          const peak = ctx.createBiquadFilter();
          peak.type = "peaking";
          peak.frequency.value = 2800;
          peak.gain.value = 10;
          peak.Q.value = 2.5;

          lastNode.connect(highpass);
          highpass.connect(peak);
          lastNode = peak;
        } else if (isDrunk) {
          // Drunk: slow + wobbly pitch + lowpass (muffled sərxoş)
          const drunkRate = 0.65 + Math.random() * 0.25;
          source.playbackRate.value = drunkRate;

          const now = ctx.currentTime;
          source.playbackRate.linearRampToValueAtTime(drunkRate + 0.15, now + 0.3);
          source.playbackRate.linearRampToValueAtTime(drunkRate - 0.1, now + 0.6);
          source.playbackRate.linearRampToValueAtTime(drunkRate, now + 0.9);

          const lowpass = ctx.createBiquadFilter();
          lowpass.type = "lowpass";
          lowpass.frequency.value = 1200;
          lowpass.Q.value = 3;

          const waveshaper = ctx.createWaveShaper();
          const curve = new Float32Array(256);
          for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            curve[i] = Math.tanh(x * 1.5);
          }
          waveshaper.curve = curve;

          lastNode.connect(lowpass);
          lowpass.connect(waveshaper);
          lastNode = waveshaper;
        } else if (isClone) {
          // Clone: echo/double voice - play original + delayed pitch-shifted copy
          source.playbackRate.value = 1.8;

          // Slightly detune for ghostly/doubled feel
          source.detune.value = -200; // 2 semitones down

          // Reverb-like effect using delay + feedback
          const delay = ctx.createDelay(1.0);
          delay.delayTime.value = 0.08;

          const feedback = ctx.createGain();
          feedback.gain.value = 0.4;

          const delayFilter = ctx.createBiquadFilter();
          delayFilter.type = "highpass";
          delayFilter.frequency.value = 400;

          // Dry path
          const dry = ctx.createGain();
          dry.gain.value = 0.5;
          lastNode.connect(dry);

          // Wet path (delayed echo)
          const wet = ctx.createGain();
          wet.gain.value = 0.45;
          lastNode.connect(delay);
          delay.connect(delayFilter);
          delayFilter.connect(wet);
          delay.connect(feedback);
          feedback.connect(delay);

          // Merge dry + wet
          const merger = ctx.createGain();
          merger.gain.value = 1.0;
          dry.connect(merger);
          wet.connect(merger);
          lastNode = merger;
        }

        const gain = ctx.createGain();
        gain.gain.value = isDrunk ? 0.6 : isClone ? 0.65 : 0.55;
        lastNode.connect(gain);
        gain.connect(ctx.destination);

        jumpPlayingRef.current = true;
        source.onended = () => { jumpPlayingRef.current = false; };
        source.start();
        jumpSourceRef.current = source;
        const dur = (source.buffer?.duration ?? 1) / source.playbackRate.value;
        return { idx, durationMs: dur * 1000 };
      }
      // Fallback: buffers not ready, use HTMLAudioElement
    }

    // Normal mode (or fallback): HTMLAudioElement
    const audio = pipeAudiosRef.current[idx];
    if (!audio) return { idx: -1, durationMs: 0 };
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 1.8;
    audio.volume = 0.5;
    jumpPlayingRef.current = true;
    audio.onended = () => { jumpPlayingRef.current = false; };
    audio.play().catch(() => {});
    const dur = (audio.duration || 1) / 1.8;
    return { idx, durationMs: dur * 1000 };
  }, [enabled, getCtx]);

  // Play jump sound (cecenq.mp3) with mode effects
  const playCecenqAudio = useCallback((mode: "normal" | "drunk" | "shrink" | "clone" = "normal") => {
    if (!enabled) return;
    if (jumpPlayingRef.current) return;

    if ((mode === "shrink" || mode === "clone") && jumpBufferRef.current) {
      const ctx = getCtx();
      if (ctx) {
        const source = ctx.createBufferSource();
        source.buffer = jumpBufferRef.current;
        let lastNode: AudioNode = source;

        if (mode === "shrink") {
          source.playbackRate.value = 1.8;
          const highpass = ctx.createBiquadFilter();
          highpass.type = "highpass";
          highpass.frequency.value = 900;
          const peak = ctx.createBiquadFilter();
          peak.type = "peaking";
          peak.frequency.value = 2800;
          peak.gain.value = 10;
          peak.Q.value = 2.5;
          lastNode.connect(highpass);
          highpass.connect(peak);
          lastNode = peak;
        } else {
          source.playbackRate.value = 1.0;
          source.detune.value = -200;
          const delay = ctx.createDelay(1.0);
          delay.delayTime.value = 0.08;
          const feedback = ctx.createGain();
          feedback.gain.value = 0.4;
          const dry = ctx.createGain();
          dry.gain.value = 0.5;
          const wet = ctx.createGain();
          wet.gain.value = 0.45;
          lastNode.connect(dry);
          lastNode.connect(delay);
          delay.connect(wet);
          delay.connect(feedback);
          feedback.connect(delay);
          const merger = ctx.createGain();
          dry.connect(merger);
          wet.connect(merger);
          lastNode = merger;
        }

        const gain = ctx.createGain();
        gain.gain.value = 0.5;
        lastNode.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        return;
      }
    }

    // Normal / drunk: HTMLAudioElement
    const audio = jumpAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = mode === "drunk" ? (0.6 + Math.random() * 0.3) : 1.0;
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }, [enabled, getCtx]);

  const noop = useCallback(() => {}, []);

  return {
    jump: playCecenqAudio,
    score: playJumpAudio,
    hit: noop,
    click: noop,
    coin: noop,
    powerUp: noop,
  };
}

// Speech bubble words matching each pipe sound
const SPEECH_WORDS = [
  "CİBODENSO!",
  "DAQADENSO!",
  "DAQAQANDES!",
  "DİBOQANDES!",
  "LEBOBOMBA!",
  "LOBOBOMBA!",
  "LEBOQENEEEES!",
  "DİBOQAMAYALLAAAAA!",
];

/* --- Stars component (deterministic) --- */
const STARS = Array.from({ length: 50 }, (_, i) => ({
  left: `${(i * 41 + 7) % 100}%`,
  top: `${(i * 29 + 13) % 100}%`,
  size: 1 + (i % 3),
  delay: (i * 0.4) % 4,
  duration: 3 + (i % 3),
  isGold: i % 7 === 0,
}));

/* ===========================
   MAIN COMPONENT
   =========================== */
export default function FlappyBird() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [screen, setScreen] = useState<GameScreen>("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [soundOn, setSoundOn] = useState(true);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [leaderboard, setLeaderboard] = useState<readonly { name: string; score: number }[]>([]);
  const [cssWidth, setCssWidth] = useState(GAME_WIDTH);
  const [cssHeight, setCssHeight] = useState(GAME_HEIGHT);

  const gameStateRef = useRef({
    bird: createBird(GAME_HEIGHT / 2 - 50),
    pipes: [] as readonly Pipe[],
    particles: [] as readonly Particle[],
    coins: [] as readonly Coin[],
    powerUps: [] as readonly PowerUp[],
    activePowerUps: [] as readonly ActivePowerUp[],
    combo: createComboState(),
    deathAnim: null as DeathAnimation | null,
    score: 0,
    frame: 0,
    bgOffset: 0,
    lastPipeTime: 0,
    lastPowerUpTime: 0,
    isRunning: false,
    waitingForStart: true,
    shakeFrames: 0,
    lastFrameTime: 0,
    accumulator: 0,
    isDying: false,
    invincibleFrames: 0,
    enteredPipeIds: new Set<number>(),
    // Intro: show each power-up in order for first-time experience
    introQueue: shuffleIntro(),
    introGiven: 0, // how many intro power-ups have been given
    speechText: "" as string,
    speechStartTime: 0, // performance.now() when speech started
    speechDurationMs: 0, // total duration matching the sound
  });

  const animRef = useRef<number>(0);
  const sound = useSoundEffects(soundOn);

  useEffect(() => {
    setHighScore(getHighScore());
    setDifficulty(getSavedDifficulty());
    setSoundOn(getSoundEnabled());
    setLeaderboard(getLeaderboard());
  }, []);

  useEffect(() => {
    function handleResize() {
      const maxW = window.innerWidth;
      const maxH = window.innerHeight;
      const isPortrait = maxH > maxW;
      // Portrait (mobile): cover entire screen, no gaps
      // Landscape (desktop): fit inside screen
      const s = isPortrait
        ? Math.max(maxW / GAME_WIDTH, maxH / GAME_HEIGHT)
        : Math.min(maxW / GAME_WIDTH, maxH / GAME_HEIGHT);
      setCssWidth(Math.round(GAME_WIDTH * s));
      setCssHeight(Math.round(GAME_HEIGHT * s));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* --- Game loop --- */
  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gs = gameStateRef.current;
    const diff = DIFFICULTIES[difficulty];
    const STEP = 1000 / 60;

    // Progressive speed: +4% every 5 points, capped at +35%
    const speedBoost = 1 + Math.min(Math.floor(gs.score / 5) * 0.04, 0.35);

    // Clone power-up
    const hasClone = hasActivePowerUp(gs.activePowerUps, "clone");

    const currentSpeed = diff.speed * speedBoost;
    const currentGravity = diff.gravity * (1 + Math.min(Math.floor(gs.score / 15) * 0.03, 0.18));

    // Progressive gap shrink: gap decreases with score, but never below MIN_GAP
    const currentGap = Math.max(diff.gap - gs.score * GAP_SHRINK_PER_SCORE, MIN_GAP);

    const isShrunk = hasActivePowerUp(gs.activePowerUps, "shrink");
    const isDrunk = hasActivePowerUp(gs.activePowerUps, "drunk");

    if (gs.lastFrameTime === 0) gs.lastFrameTime = timestamp;
    const delta = Math.min(timestamp - gs.lastFrameTime, 50);
    gs.lastFrameTime = timestamp;
    gs.accumulator += delta;

    while (gs.accumulator >= STEP) {
      gs.accumulator -= STEP;
      gs.frame++;

      if (gs.isDying) {
        // Death animation update
        if (gs.deathAnim) {
          gs.deathAnim = updateDeathAnimation(gs.deathAnim);
        }
        gs.particles = updateParticles(gs.particles);
        if (gs.shakeFrames > 0) gs.shakeFrames--;
        continue;
      }

      if (gs.isRunning && !gs.waitingForStart) {
        gs.bird = updateBird(gs.bird, currentGravity);
        // Drunk effect: gentle wobble + continuous spin
        if (isDrunk) {
          const wobble = Math.sin(gs.frame * 0.08) * 1.0;
          const spinRotation = (gs.frame * 7) % 360; // fast spin
          gs.bird = { ...gs.bird, y: gs.bird.y + wobble, rotation: spinRotation };
        }
        gs.pipes = updatePipes(gs.pipes, currentSpeed, gs.frame);
        gs.coins = updateCoins(gs.coins, gs.pipes, currentSpeed, currentGap);
        gs.powerUps = updatePowerUps(gs.powerUps, gs.pipes, currentSpeed, currentGap);
        gs.particles = updateParticles(gs.particles);
        gs.combo = updateComboDisplay(gs.combo);

        // Expire timed power-ups; reset cooldown when a power-up expires
        const hadDrunk = hasActivePowerUp(gs.activePowerUps, "drunk");
        const prevCount = gs.activePowerUps.length;
        gs.activePowerUps = getActivePowerUps(gs.activePowerUps, performance.now());
        if (gs.activePowerUps.length < prevCount) {
          gs.lastPowerUpTime = performance.now();
        }
        if (hadDrunk && !hasActivePowerUp(gs.activePowerUps, "drunk")) {
          // drunk bg removed
        }

        if (gs.shakeFrames > 0) gs.shakeFrames--;
        gs.bgOffset += currentSpeed;
      } else if (gs.waitingForStart) {
        gs.bird = {
          ...gs.bird,
          y: GAME_HEIGHT / 2 - 50 + Math.sin(gs.frame * 0.06) * 12,
          rotation: 0,
        };
        gs.bgOffset += 0.5;
      }
    }

    if (gs.isRunning && !gs.waitingForStart && !gs.isDying) {
      // Spawn pipes
      const pipeInterval = Math.max(2800 / speedBoost, 2000);
      if (timestamp - gs.lastPipeTime > pipeInterval) {
        const newPipe = createPipe(GAME_HEIGHT, currentGap, gs.score);
        gs.pipes = [...gs.pipes, newPipe];
        // Create coin in the gap (70% chance, always for boss)
        if (Math.random() < 0.7 || newPipe.isBoss) {
          gs.coins = [...gs.coins, createCoin(newPipe, currentGap)];
        }
        // Spawn power-up only if no active power-ups and cooldown passed
        const hasAnyPowerUp = gs.activePowerUps.length > 0;
        const introActive = gs.introGiven < gs.introQueue.length;
        const spawnInterval = introActive ? 3000 : POWERUP_SPAWN_INTERVAL; // faster during intro
        if (!hasAnyPowerUp && timestamp - gs.lastPowerUpTime > spawnInterval) {
          const forceType = introActive ? gs.introQueue[gs.introGiven] : undefined;
          gs.powerUps = [...gs.powerUps, createPowerUp(newPipe, currentGap, forceType)];
          if (introActive) gs.introGiven++;
          gs.lastPowerUpTime = timestamp;
        }
        gs.lastPipeTime = timestamp;
      }

      // Check score (pipes passed)
      const scoreResult = checkScore(gs.pipes, gs.score, gs.combo);
      gs.pipes = scoreResult.pipes;
      gs.combo = scoreResult.combo;
      if (scoreResult.scored) {
        gs.score = scoreResult.score;
        setScore(gs.score);
        gs.particles = [...gs.particles, ...createScoreParticles(gs.bird.y)];
      }

      // Check coin collection
      const coinResult = checkCoinCollision(gs.bird, gs.coins, isShrunk);
      if (coinResult.collected > 0) {
        // Find newly collected coins for particles
        for (let i = 0; i < gs.coins.length; i++) {
          if (!gs.coins[i].collected && coinResult.coins[i].collected) {
            gs.particles = [...gs.particles, ...createCoinParticles(gs.coins[i].x, gs.coins[i].y)];
          }
        }
        gs.coins = coinResult.coins;
        gs.score += coinResult.collected * COIN_SCORE;
        setScore(gs.score);
        sound.coin();
      }

      // Check power-up collection
      const puResult = checkPowerUpCollision(gs.bird, gs.powerUps, isShrunk);
      gs.powerUps = puResult.powerUps;
      if (puResult.collected) {
        const now = performance.now();
        const newActive: ActivePowerUp = {
          type: puResult.collected,
          expiresAt: now + (puResult.collected === "shrink" ? SHRINK_DURATION : puResult.collected === "clone" ? CLONE_DURATION : puResult.collected === "drunk" ? DRUNK_DURATION : POWERUP_DURATION),
        };
        // Replace existing of same type, or add
        const filtered = gs.activePowerUps.filter((a) => a.type !== puResult.collected);
        gs.activePowerUps = [...filtered, newActive];
        sound.powerUp();
      }

      // Detect bird entering a pipe gap - uses live power-up state for instant sound change
      const liveShrunk = hasActivePowerUp(gs.activePowerUps, "shrink");
      const liveDrunk = hasActivePowerUp(gs.activePowerUps, "drunk");
      const liveClone = hasActivePowerUp(gs.activePowerUps, "clone");
      for (const pipe of gs.pipes) {
        if (!gs.enteredPipeIds.has(pipe.id)) {
          const birdRight = BIRD_X + BIRD_WIDTH;
          if (birdRight > pipe.x && BIRD_X < pipe.x + pipe.width) {
            gs.enteredPipeIds.add(pipe.id);
            const sndResult = sound.score(liveShrunk, liveDrunk, liveClone);
            if (sndResult.idx >= 0 && sndResult.idx < SPEECH_WORDS.length) {
              gs.speechText = SPEECH_WORDS[sndResult.idx];
              gs.speechStartTime = performance.now();
              gs.speechDurationMs = sndResult.durationMs;
            }
          }
        }
      }

      // Tick invincibility
      if (gs.invincibleFrames > 0) gs.invincibleFrames--;

      // Check collision (skip while invincible)
      if (gs.invincibleFrames <= 0) {
        const collided = checkCollision(gs.bird, gs.pipes, currentGap, isShrunk);

        if (collided) {
          if (hasClone) {
            // Clone saves you - teleport to safe position, consume clone
            const safeY = Math.max(80, Math.min(gs.bird.y + CLONE_Y_OFFSET, GAME_HEIGHT - GROUND_HEIGHT - BIRD_HEIGHT - 20));
            gs.bird = { ...gs.bird, y: safeY, velocity: 0, rotation: 0 };
            gs.activePowerUps = gs.activePowerUps.filter((a) => a.type !== "clone");
            gs.invincibleFrames = 45; // ~0.75s invincibility after clone rescue
            gs.shakeFrames = 10;
            gs.particles = [...gs.particles, ...createDeathParticles(safeY)];
            sound.hit();
          } else {
            gs.isRunning = false;
            gs.isDying = true;
            // drunk bg removed
            gs.deathAnim = createDeathAnimation(gs.bird.y);
            gs.particles = [...gs.particles, ...createDeathParticles(gs.bird.y)];
            gs.shakeFrames = 15;
            gs.combo = createComboState(); // Reset combo
            sound.hit();
            const isNew = gs.score > getHighScore();
            if (isNew) { saveHighScore(gs.score); setHighScore(gs.score); setIsNewHighScore(true); }
            else setIsNewHighScore(false);
            setTimeout(() => {
              gs.isDying = false;
              setScreen("gameover");
            }, 500);
          }
        }
      }
    }

    // ─── Drawing ───
    ctx.save();
    if (gs.shakeFrames > 0) {
      ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    // Drunk screen wobble (gentle)
    if (isDrunk && !gs.isDying) {
      const wobbleAngle = Math.sin(gs.frame * 0.03) * 0.02;
      const wobbleX = Math.sin(gs.frame * 0.05) * 3;
      ctx.translate(GAME_WIDTH / 2 + wobbleX, GAME_HEIGHT / 2);
      ctx.rotate(wobbleAngle);
      ctx.translate(-GAME_WIDTH / 2, -GAME_HEIGHT / 2);
    }

    drawBackground(ctx, gs.bgOffset, gs.score);

    for (const pipe of gs.pipes) drawPipe(ctx, pipe, currentGap);

    // Draw coins
    for (const coin of gs.coins) drawCoin(ctx, coin);

    // Draw power-ups
    for (const pu of gs.powerUps) drawPowerUp(ctx, pu);

    drawGround(ctx, gs.bgOffset);

    if (hasClone && !gs.isDying) {
      drawCloneBird(ctx, gs.bird, gs.frame, CLONE_Y_OFFSET, isShrunk);
    }
    drawBird(ctx, gs.bird, gs.frame, isShrunk, gs.isDying ? gs.deathAnim : null, isDrunk);

    // Dancing letters synced with sound duration
    if (gs.speechText && gs.speechDurationMs > 0) {
      const now = performance.now();
      const elapsedMs = now - gs.speechStartTime;
      const totalMs = gs.speechDurationMs;
      if (elapsedMs < totalMs + 300) { // +300ms fade-out
        const allLetters = gs.speechText;
        const len = allLetters.length;
        const revealProgress = Math.min(1, elapsedMs / (totalMs * 0.85));
        const revealedCount = Math.min(len, Math.floor(revealProgress * len) + 1);
        const fadeAlpha = elapsedMs > totalMs ? Math.max(0, 1 - (elapsedMs - totalMs) / 300) : 1;

        ctx.save();
        ctx.globalAlpha = fadeAlpha;

        const fontSize = len > 14 ? 28 : len > 10 ? 32 : 36;
        ctx.font = `900 ${fontSize}px "Impact", "Arial Black", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT - GROUND_HEIGHT - 60; // aşağıda, ground-un üstündə

        let totalWidth = 0;
        const letterWidths: number[] = [];
        for (let i = 0; i < revealedCount; i++) {
          const w = ctx.measureText(allLetters[i]).width;
          letterWidths.push(w);
          totalWidth += w;
        }

        let curX = centerX - totalWidth / 2;

        for (let i = 0; i < revealedCount; i++) {
          const letterAppearMs = (i / len) * totalMs * 0.85;
          const letterAgeMs = elapsedMs - letterAppearMs;
          // Pop-in: big → normal with bounce
          let scale = 1.0;
          if (letterAgeMs < 80) {
            scale = 1.8 - (letterAgeMs / 80) * 0.8;
          } else if (letterAgeMs < 150) {
            scale = 1.0 + ((150 - letterAgeMs) / 70) * 0.15;
          }
          // Dance bob + wiggle
          const t = elapsedMs / 1000;
          const bob = Math.sin((t * 8) + i * 1.2) * 5;
          const wiggle = Math.sin((t * 6) + i * 1.8) * 0.12;

          const lx = curX + letterWidths[i] / 2;
          const ly = centerY + bob;

          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(wiggle);
          ctx.scale(scale, scale);

          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.lineWidth = 4;
          ctx.lineJoin = "round";
          ctx.strokeText(allLetters[i], 0, 0);
          ctx.fillStyle = "#fff";
          ctx.fillText(allLetters[i], 0, 0);

          ctx.restore();
          curX += letterWidths[i];
        }

        ctx.restore();
      } else {
        // Speech finished, clear it
        gs.speechText = "";
        gs.speechDurationMs = 0;
      }
    }

    drawParticles(ctx, gs.particles);

    if ((gs.isRunning || gs.isDying) && !gs.waitingForStart) {
      drawScore(ctx, gs.score);
      drawCombo(ctx, gs.combo);
      drawPowerUpIndicator(ctx, gs.activePowerUps, performance.now());
    }

    if (gs.waitingForStart && gs.isRunning) drawGetReady(ctx, gs.frame);

    // Death screen flash
    if (gs.deathAnim && gs.deathAnim.flashAlpha > 0) {
      drawScreenFlash(ctx, gs.deathAnim.flashAlpha);
    }

    // Drunk vision overlay
    if (isDrunk && !gs.isDying) {
      ctx.save();
      // Pulsating green-purple tint
      const tintAlpha = 0.12 + Math.sin(gs.frame * 0.05) * 0.05;
      ctx.globalAlpha = tintAlpha;
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "#88ff44";
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Second layer: purple vignette edges
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.08 + Math.sin(gs.frame * 0.03 + 1) * 0.04;
      const vignette = ctx.createRadialGradient(
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.2,
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.6
      );
      vignette.addColorStop(0, "transparent");
      vignette.addColorStop(1, "#cc44cc");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.restore();
    }

    ctx.restore();

    animRef.current = requestAnimationFrame(gameLoop);
  }, [difficulty, sound]);

  useEffect(() => {
    if (screen === "playing") {
      animRef.current = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [screen, gameLoop]);

  useEffect(() => {
    if (screen !== "menu") return;
    const gs = gameStateRef.current;
    gs.bird = createBird(GAME_HEIGHT / 2 - 50);
    gs.pipes = []; gs.particles = []; gs.coins = []; gs.powerUps = [];
    gs.activePowerUps = []; gs.combo = createComboState();
    gs.deathAnim = null; gs.isDying = false; gs.invincibleFrames = 0; gs.enteredPipeIds.clear();
    gs.score = 0; gs.frame = 0;
    gs.isRunning = true; gs.waitingForStart = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    let rafId: number;
    function menuLoop() {
      const gs = gameStateRef.current;
      gs.frame++; gs.bgOffset += 0.5;
      gs.bird = { ...gs.bird, y: GAME_HEIGHT / 2 - 50 + Math.sin(gs.frame * 0.06) * 12, rotation: 0 };
      drawBackground(ctx!, gs.bgOffset, 0);
      drawGround(ctx!, gs.bgOffset);
      drawBird(ctx!, gs.bird, gs.frame);
      rafId = requestAnimationFrame(menuLoop);
    }
    rafId = requestAnimationFrame(menuLoop);
    return () => cancelAnimationFrame(rafId);
  }, [screen]);

  const startGame = useCallback(() => {
    const gs = gameStateRef.current;
    gs.bird = createBird(GAME_HEIGHT / 2 - 50);
    gs.pipes = []; gs.particles = []; gs.coins = []; gs.powerUps = [];
    gs.activePowerUps = []; gs.combo = createComboState();
    gs.deathAnim = null; gs.isDying = false; gs.invincibleFrames = 0; gs.enteredPipeIds.clear();
    gs.introQueue = shuffleIntro(); gs.introGiven = 0;
    gs.score = 0; gs.frame = 0;
    gs.isRunning = true; gs.waitingForStart = true;
    gs.lastPipeTime = performance.now();
    gs.lastPowerUpTime = performance.now();
    gs.lastFrameTime = 0; gs.accumulator = 0;
    setScore(0); setIsNewHighScore(false); setScreen("playing");
    sound.click();
  }, [sound]);

  const handleJump = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.isRunning || gs.isDying) return;
    if (gs.waitingForStart) {
      gs.waitingForStart = false;
      gs.lastPipeTime = performance.now();
      gs.lastPowerUpTime = performance.now();
    }
    gs.bird = jumpBird(gs.bird);
    // Drunk: randomize jump force a bit
    if (hasActivePowerUp(gs.activePowerUps, "drunk")) {
      const randomMult = 0.85 + Math.random() * 0.3; // 0.85x to 1.15x
      gs.bird = { ...gs.bird, velocity: gs.bird.velocity * randomMult };
    }
    const jumpMode = hasActivePowerUp(gs.activePowerUps, "drunk") ? "drunk"
      : hasActivePowerUp(gs.activePowerUps, "shrink") ? "shrink"
      : hasActivePowerUp(gs.activePowerUps, "clone") ? "clone" : "normal";
    sound.jump(jumpMode);
  }, [sound]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (screen === "playing") handleJump();
        else if (screen === "gameover" || screen === "menu") startGame();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, handleJump, startGame]);

  function handleSaveScore() {
    if (!playerName.trim()) return;
    addToLeaderboard(playerName.trim(), score);
    setLeaderboard(getLeaderboard());
    setPlayerName(""); setScreen("leaderboard"); sound.click();
  }

  const getMedal = (s: number) => {
    if (s >= 40) return { emoji: "🏆", label: "Platin", gradient: "from-gray-200 to-gray-400" };
    if (s >= 30) return { emoji: "🥇", label: "Qızıl", gradient: "from-yellow-300 to-yellow-500" };
    if (s >= 20) return { emoji: "🥈", label: "Gümüş", gradient: "from-gray-300 to-gray-400" };
    if (s >= 10) return { emoji: "🥉", label: "Bürünc", gradient: "from-amber-400 to-amber-600" };
    return null;
  };

  /* ===========
     RENDER
     =========== */
  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center"
      style={{
        width: "100vw",
        height: "100dvh",
        background: "#4ec0ca",
        overflow: "hidden",
      }}
    >
      <div className="relative" style={{ width: cssWidth, height: cssHeight }}>
        {/* --- Canvas --- */}
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          style={{ display: "block", width: "100%", height: "100%" }}
        />

        {/* Tap area for gameplay */}
        {screen === "playing" && (
          <div
            onClick={() => handleJump()}
            style={{ position: "absolute", inset: 0, cursor: "pointer", zIndex: 5 }}
          />
        )}

        {/* =========== MENU =========== */}
        {screen === "menu" && (
          <Overlay variant="light">
            <div style={{ animation: "floatSlow 4s ease-in-out infinite" }}>
              {/* Title */}
              <div style={{ animation: "slideDown 0.6s ease-out both" }}>
                <h1 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 62,
                  fontWeight: 700,
                  color: "#fff",
                  textAlign: "center",
                  lineHeight: 1,
                  textShadow: `
                    0 2px 0 #e8a735,
                    0 4px 0 #c8901e,
                    0 6px 0 #a07018,
                    0 8px 15px rgba(0,0,0,0.3),
                    0 0 40px rgba(255,204,51,0.25)
                  `,
                  letterSpacing: 6,
                }}>
                  FLAPPY
                </h1>
                <h1 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 38,
                  fontWeight: 700,
                  color: "#fff",
                  textAlign: "center",
                  lineHeight: 1,
                  marginTop: 2,
                  textShadow: `
                    0 2px 0 #4cae4c,
                    0 4px 0 #3a9c2c,
                    0 6px 0 #2d7a20,
                    0 8px 15px rgba(0,0,0,0.3),
                    0 0 40px rgba(110,207,92,0.25)
                  `,
                  letterSpacing: 3,
                }}>
                  CİBOBOMBES
                </h1>
              </div>
            </div>

            {/* Character Image */}
            <div style={{
              animation: "scaleIn 0.6s ease-out 0.15s both",
              marginTop: 12,
              display: "flex",
              justifyContent: "center",
            }}>
              <img
                src="/karikatura.png"
                alt="Karakter"
                style={{
                  width: 180,
                  height: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.4))",
                  animation: "floatSlow 3s ease-in-out infinite",
                }}
              />
            </div>

            {/* High Score Chip */}
            <div
              style={{
                animation: "slideUp 0.5s ease-out 0.2s both",
                marginTop: 16,
                marginBottom: 20,
              }}
            >
              <Chip icon="👑" text={`Rekord: ${highScore}`} />
            </div>

            {/* Play Button */}
            <div style={{ animation: "scaleIn 0.5s ease-out 0.35s both" }}>
              <ArcadeButton
                color="green"
                size="lg"
                glow
                onClick={startGame}
              >
                OYNA
              </ArcadeButton>
            </div>

            {/* Sub buttons */}
            <div
              className="flex gap-3"
              style={{ animation: "slideUp 0.5s ease-out 0.5s both", marginTop: 16 }}
            >
              <GlassButton onClick={() => { setScreen("settings"); sound.click(); }}>
                {"⚙️  Ayarlar"}
              </GlassButton>
              <GlassButton onClick={() => { setLeaderboard(getLeaderboard()); setScreen("leaderboard"); sound.click(); }}>
                {"🏆  Lider"}
              </GlassButton>
            </div>
          </Overlay>
        )}

        {/* =========== GAME OVER =========== */}
        {screen === "gameover" && (
          <Overlay variant="dark">
            {/* Title */}
            <div style={{ animation: "scaleIn 0.4s ease-out both" }}>
              <h2 style={{
                fontFamily: "var(--font-display)",
                fontSize: 44,
                fontWeight: 700,
                color: "#ff6b6b",
                textAlign: "center",
                textShadow: `
                  0 2px 0 #cc3b3b,
                  0 4px 0 #992222,
                  0 6px 12px rgba(0,0,0,0.4),
                  0 0 30px rgba(255,107,107,0.3)
                `,
                letterSpacing: 3,
              }}>
                {"OYUN BİTDİ"}
              </h2>
            </div>

            {/* Score Card */}
            <div style={{ animation: "slideUp 0.5s ease-out 0.15s both", marginTop: 20, width: 300 }}>
              <ScoreCard
                score={score}
                highScore={highScore}
                isNewHighScore={isNewHighScore}
                medal={getMedal(score)}
              />
            </div>

            {/* Name input */}
            {score > 0 && (
              <div
                className="flex gap-2"
                style={{ animation: "slideUp 0.4s ease-out 0.3s both", marginTop: 16, width: 300 }}
              >
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Adınız..."
                  maxLength={15}
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    fontWeight: 700,
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: "2px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    outline: "none",
                    backdropFilter: "blur(8px)",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(255,204,51,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveScore(); e.stopPropagation(); }}
                />
                <ArcadeButton color="blue" size="sm" onClick={handleSaveScore}>
                  Saxla
                </ArcadeButton>
              </div>
            )}

            {/* Action Buttons */}
            <div
              className="flex gap-3"
              style={{ animation: "slideUp 0.4s ease-out 0.45s both", marginTop: 18 }}
            >
              <ArcadeButton color="green" size="md" onClick={startGame}>
                {"↻ Yenidən"}
              </ArcadeButton>
              <ArcadeButton color="orange" size="md" onClick={() => setScreen("menu")}>
                Menyu
              </ArcadeButton>
            </div>
          </Overlay>
        )}

        {/* =========== SETTINGS =========== */}
        {screen === "settings" && (
          <Overlay variant="dark">
            <div style={{ animation: "slideDown 0.4s ease-out both" }}>
              <SectionTitle>AYARLAR</SectionTitle>
            </div>

            {/* Difficulty */}
            <div style={{ animation: "slideUp 0.4s ease-out 0.1s both", marginTop: 32, width: 300 }}>
              <Label>{"Çətinlik"}</Label>
              <div className="flex gap-2" style={{ marginTop: 10 }}>
                {(Object.entries(DIFFICULTIES) as [Difficulty, typeof DIFFICULTIES[Difficulty]][]).map(
                  ([key, val]) => {
                    const isActive = difficulty === key;
                    const colorMap = { easy: "green" as const, normal: "orange" as const, hard: "red" as const };
                    return (
                      <div key={key} style={{ flex: 1 }}>
                        <ArcadeButton
                          color={isActive ? colorMap[key] : "ghost"}
                          size="sm"
                          fullWidth
                          onClick={() => { setDifficulty(key); saveDifficulty(key); sound.click(); }}
                        >
                          {val.label}
                        </ArcadeButton>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            {/* Sound */}
            <div style={{ animation: "slideUp 0.4s ease-out 0.2s both", marginTop: 24, width: 300 }}>
              <Label>{"Səs"}</Label>
              <div style={{ marginTop: 10 }}>
                <ArcadeButton
                  color={soundOn ? "green" : "ghost"}
                  size="sm"
                  fullWidth
                  onClick={() => { const n = !soundOn; setSoundOn(n); saveSoundEnabled(n); }}
                >
                  {soundOn ? "🔊 Açıq" : "🔇 Bağlı"}
                </ArcadeButton>
              </div>
            </div>

            {/* Back */}
            <div style={{ animation: "slideUp 0.4s ease-out 0.35s both", marginTop: 32 }}>
              <GlassButton onClick={() => { setScreen("menu"); sound.click(); }}>
                {"← Geri"}
              </GlassButton>
            </div>
          </Overlay>
        )}

        {/* =========== LEADERBOARD =========== */}
        {screen === "leaderboard" && (
          <Overlay variant="dark">
            <div style={{ animation: "slideDown 0.4s ease-out both" }}>
              <SectionTitle>{"LİDER CƏDVƏL"}</SectionTitle>
            </div>

            <div
              style={{
                animation: "slideUp 0.4s ease-out 0.15s both",
                marginTop: 24,
                width: 320,
                maxHeight: 400,
                overflowY: "auto",
                borderRadius: 18,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(6px)",
              }}
            >
              {/* Header row */}
              <div
                className="flex justify-between items-center"
                style={{
                  padding: "10px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" }}>
                  {"Oyunçu"}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" }}>
                  Xal
                </span>
              </div>

              {leaderboard.length === 0 ? (
                <div style={{ padding: "48px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"🎮"}</div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                    {"Hələ heç kim oynamamış"}
                  </p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
                    {"İlk sən ol!"}
                  </p>
                </div>
              ) : (
                leaderboard.map((entry, i) => {
                  const rankBg = i === 0
                    ? "rgba(255,204,51,0.08)"
                    : i === 1 ? "rgba(192,192,192,0.06)"
                    : i === 2 ? "rgba(205,127,50,0.06)" : "transparent";
                  const rankEmoji = ["🥇", "🥈", "🥉"][i];
                  const rankColor = ["#ffcc33", "#c0c0c0", "#cd7f32"][i] ?? "rgba(255,255,255,0.25)";

                  return (
                    <div
                      key={`${entry.name}-${i}`}
                      className="flex justify-between items-center"
                      style={{
                        padding: "14px 20px",
                        background: rankBg,
                        borderBottom: i < leaderboard.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span style={{
                          fontFamily: "var(--font-display)",
                          fontSize: rankEmoji ? 18 : 14,
                          fontWeight: 700,
                          width: 28,
                          textAlign: "center",
                          color: rankColor,
                        }}>
                          {rankEmoji ?? `${i + 1}`}
                        </span>
                        <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "#fff" }}>
                          {entry.name}
                        </span>
                      </div>
                      <span style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 18,
                        fontWeight: 700,
                        color: i < 3 ? "#ffcc33" : "rgba(255,255,255,0.6)",
                      }}>
                        {entry.score}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ animation: "slideUp 0.4s ease-out 0.3s both", marginTop: 20 }}>
              <GlassButton onClick={() => { setScreen("menu"); sound.click(); }}>
                {"← Geri"}
              </GlassButton>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}

/* ===========================
   REUSABLE UI COMPONENTS
   =========================== */

function Overlay({ children, variant }: { children: React.ReactNode; variant: "light" | "dark" }) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: variant === "dark"
          ? "radial-gradient(ellipse at 50% 30%, rgba(20,20,50,0.88), rgba(8,8,20,0.94))"
          : "radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.25), rgba(0,0,0,0.45))",
        zIndex: 10,
      }}
    >
      {children}
    </div>
  );
}

function ArcadeButton({
  children, onClick, color, size, glow, fullWidth,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color: "green" | "orange" | "red" | "blue" | "ghost";
  size: "sm" | "md" | "lg";
  glow?: boolean;
  fullWidth?: boolean;
}) {
  const colors = {
    green: { bg: "linear-gradient(180deg, #7dd873 0%, #5cb85c 40%, #49a149 100%)", border: "#357a35", shadow: "rgba(92,184,92,0.35)" },
    orange: { bg: "linear-gradient(180deg, #ffc966 0%, #f0a030 40%, #d48a20 100%)", border: "#a06810", shadow: "rgba(240,160,48,0.3)" },
    red: { bg: "linear-gradient(180deg, #ff8080 0%, #e05252 40%, #c43b3b 100%)", border: "#8e2218", shadow: "rgba(224,82,82,0.3)" },
    blue: { bg: "linear-gradient(180deg, #6cc8e0 0%, #4aa8c0 40%, #3890a8 100%)", border: "#2a6e80", shadow: "rgba(74,168,192,0.3)" },
    ghost: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", shadow: "transparent" },
  };
  const sizes = {
    sm: { px: 18, py: 10, fontSize: 13, borderW: 3, radius: 12 },
    md: { px: 28, py: 13, fontSize: 15, borderW: 4, radius: 14 },
    lg: { px: 48, py: 16, fontSize: 19, borderW: 5, radius: 16 },
  };
  const c = colors[color];
  const s = sizes[size];

  return (
    <button
      onClick={() => onClick()}
      style={{
        fontFamily: "var(--font-display)",
        fontSize: s.fontSize,
        fontWeight: 600,
        color: color === "ghost" ? "rgba(255,255,255,0.5)" : "#fff",
        padding: `${s.py}px ${s.px}px`,
        borderRadius: s.radius,
        border: "none",
        borderBottom: `${s.borderW}px solid ${c.border}`,
        background: c.bg,
        cursor: "pointer",
        letterSpacing: size === "lg" ? 4 : 1,
        textShadow: color === "ghost" ? "none" : "0 1px 2px rgba(0,0,0,0.3)",
        boxShadow: glow
          ? `0 0 25px ${c.shadow}, 0 4px 15px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)`
          : `0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)`,
        width: fullWidth ? "100%" : undefined,
        animation: glow ? "pulse-glow 2.5s ease-in-out infinite" : undefined,
      }}
    >
      {children}
    </button>
  );
}

function GlassButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={() => onClick()}
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 14,
        fontWeight: 500,
        color: "rgba(255,255,255,0.75)",
        padding: "11px 22px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(8px)",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
        letterSpacing: 0.5,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 15,
        fontWeight: 600,
        color: "#ffcc33",
        padding: "8px 20px",
        borderRadius: 50,
        background: "rgba(255,204,51,0.08)",
        border: "1px solid rgba(255,204,51,0.18)",
        boxShadow: "0 0 12px rgba(255,204,51,0.06)",
        letterSpacing: 0.5,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      {text}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: "var(--font-display)",
      fontSize: 38,
      fontWeight: 700,
      color: "#ffcc33",
      textAlign: "center",
      textShadow: `
        0 2px 0 #cc9900,
        0 4px 0 #aa7700,
        0 6px 12px rgba(0,0,0,0.4),
        0 0 30px rgba(255,204,51,0.2)
      `,
      letterSpacing: 4,
    }}>
      {children}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: "var(--font-body)",
      fontSize: 11,
      fontWeight: 800,
      color: "rgba(255,255,255,0.35)",
      textTransform: "uppercase",
      letterSpacing: 3,
      textAlign: "center",
    }}>
      {children}
    </p>
  );
}

function ScoreCard({
  score, highScore, isNewHighScore, medal,
}: {
  score: number;
  highScore: number;
  isNewHighScore: boolean;
  medal: { emoji: string; label: string } | null;
}) {
  return (
    <div
      style={{
        borderRadius: 22,
        overflow: "hidden",
        background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {/* Medal section */}
      {medal && (
        <div
          className="flex items-center justify-center gap-3"
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{
            fontSize: 40,
            animation: "medal-shine 2s ease-in-out infinite",
            display: "inline-block",
          }}>
            {medal.emoji}
          </span>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 600,
            color: "rgba(255,255,255,0.7)",
          }}>
            {medal.label} Medal
          </span>
        </div>
      )}

      {/* Score */}
      <div style={{ padding: medal ? "16px 24px" : "24px 24px 16px" }}>
        <div className="flex justify-between items-center">
          <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
            Xal
          </span>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 42,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1,
            textShadow: "0 0 20px rgba(255,255,255,0.15)",
            animation: "count-up 0.4s ease-out 0.3s both",
          }}>
            {score}
          </span>
        </div>

        <div style={{
          height: 1,
          margin: "14px 0",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
        }} />

        <div className="flex justify-between items-center">
          <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>
            {"Ən Yüksək"}
          </span>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 700,
            color: "#ffcc33",
            textShadow: "0 0 10px rgba(255,204,51,0.2)",
          }}>
            {highScore}
          </span>
        </div>
      </div>

      {/* New record banner */}
      {isNewHighScore && (
        <div
          style={{
            padding: "10px 20px",
            textAlign: "center",
            background: "linear-gradient(90deg, transparent, rgba(255,204,51,0.1), transparent)",
            borderTop: "1px solid rgba(255,204,51,0.12)",
          }}
        >
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: 2,
            background: "linear-gradient(90deg, #ffcc33, #ff8844, #ffcc33)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer 2s linear infinite",
          }}>
            {"✨ YENİ REKORD ✨"}
          </span>
        </div>
      )}
    </div>
  );
}
