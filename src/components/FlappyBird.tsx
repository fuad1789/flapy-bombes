"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_HEIGHT,
  DIFFICULTIES,
  type Pipe,
  type Particle,
  type GameScreen,
  type Difficulty,
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
  updateParticles,
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
  drawParticles,
  drawScore,
  drawGetReady,
} from "@/game/renderer";

/* ─── Sound hook ─── */
function useSoundEffects(enabled: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  return {
    jump: useCallback(() => playTone(520, 0.08, "sine"), [playTone]),
    score: useCallback(() => {
      playTone(620, 0.08, "sine");
      setTimeout(() => playTone(830, 0.12, "sine"), 70);
    }, [playTone]),
    hit: useCallback(() => playTone(180, 0.25, "sawtooth"), [playTone]),
    click: useCallback(() => playTone(440, 0.04, "sine"), [playTone]),
  };
}

/* ─── Stars component (deterministic) ─── */
const STARS = Array.from({ length: 50 }, (_, i) => ({
  left: `${(i * 41 + 7) % 100}%`,
  top: `${(i * 29 + 13) % 100}%`,
  size: 1 + (i % 3),
  delay: (i * 0.4) % 4,
  duration: 3 + (i % 3),
  isGold: i % 7 === 0,
}));

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
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
    score: 0,
    frame: 0,
    bgOffset: 0,
    lastPipeTime: 0,
    isRunning: false,
    waitingForStart: true,
    shakeFrames: 0,
    lastFrameTime: 0,
    accumulator: 0,
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
      const pad = 20;
      const maxW = window.innerWidth - pad * 2;
      const maxH = window.innerHeight - pad * 2;
      const s = Math.min(maxW / GAME_WIDTH, maxH / GAME_HEIGHT, 1.5);
      setCssWidth(Math.round(GAME_WIDTH * s));
      setCssHeight(Math.round(GAME_HEIGHT * s));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* ─── Game loop ─── */
  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gs = gameStateRef.current;
    const diff = DIFFICULTIES[difficulty];
    const STEP = 1000 / 60;

    // Progressive speed: +8% every 5 points, capped at +60%
    const speedBoost = 1 + Math.min(Math.floor(gs.score / 5) * 0.08, 0.6);
    const currentSpeed = diff.speed * speedBoost;
    const currentGravity = diff.gravity * (1 + Math.min(Math.floor(gs.score / 10) * 0.05, 0.3));

    if (gs.lastFrameTime === 0) gs.lastFrameTime = timestamp;
    const delta = Math.min(timestamp - gs.lastFrameTime, 50);
    gs.lastFrameTime = timestamp;
    gs.accumulator += delta;

    while (gs.accumulator >= STEP) {
      gs.accumulator -= STEP;
      gs.frame++;

      if (gs.isRunning && !gs.waitingForStart) {
        gs.bird = updateBird(gs.bird, currentGravity);
        gs.pipes = updatePipes(gs.pipes, currentSpeed);
        gs.particles = updateParticles(gs.particles);
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

    if (gs.isRunning && !gs.waitingForStart) {
      const pipeInterval = Math.max(2800 / speedBoost, 1800);
      if (timestamp - gs.lastPipeTime > pipeInterval) {
        gs.pipes = [...gs.pipes, createPipe(GAME_HEIGHT, diff.gap)];
        gs.lastPipeTime = timestamp;
      }

      const scoreResult = checkScore(gs.pipes, gs.score);
      gs.pipes = scoreResult.pipes;
      if (scoreResult.scored) {
        gs.score = scoreResult.score;
        setScore(gs.score);
        gs.particles = [...gs.particles, ...createScoreParticles(gs.bird.y)];
        sound.score();
      }

      if (checkCollision(gs.bird, gs.pipes, diff.gap)) {
        gs.isRunning = false;
        gs.particles = [...gs.particles, ...createDeathParticles(gs.bird.y)];
        gs.shakeFrames = 15;
        sound.hit();
        const isNew = gs.score > getHighScore();
        if (isNew) { saveHighScore(gs.score); setHighScore(gs.score); setIsNewHighScore(true); }
        else setIsNewHighScore(false);
        setTimeout(() => setScreen("gameover"), 500);
        return;
      }
    }

    ctx.save();
    if (gs.shakeFrames > 0) {
      ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    drawBackground(ctx, gs.bgOffset);
    for (const pipe of gs.pipes) drawPipe(ctx, pipe, diff.gap);
    drawGround(ctx, gs.bgOffset);
    drawBird(ctx, gs.bird, gs.frame);
    drawParticles(ctx, gs.particles);
    if (gs.isRunning && !gs.waitingForStart) drawScore(ctx, gs.score);
    if (gs.waitingForStart && gs.isRunning) drawGetReady(ctx, gs.frame);
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
    gs.pipes = []; gs.particles = []; gs.score = 0; gs.frame = 0;
    gs.isRunning = true; gs.waitingForStart = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    let rafId: number;
    function menuLoop() {
      const gs = gameStateRef.current;
      gs.frame++; gs.bgOffset += 0.5;
      gs.bird = { ...gs.bird, y: GAME_HEIGHT / 2 - 50 + Math.sin(gs.frame * 0.06) * 12, rotation: 0 };
      drawBackground(ctx!, gs.bgOffset);
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
    gs.pipes = []; gs.particles = []; gs.score = 0; gs.frame = 0;
    gs.isRunning = true; gs.waitingForStart = true;
    gs.lastPipeTime = performance.now();
    gs.lastFrameTime = 0; gs.accumulator = 0;
    setScore(0); setIsNewHighScore(false); setScreen("playing");
    sound.click();
  }, [sound]);

  const handleJump = useCallback(() => {
    const gs = gameStateRef.current;
    if (!gs.isRunning) return;
    if (gs.waitingForStart) { gs.waitingForStart = false; gs.lastPipeTime = performance.now(); }
    gs.bird = jumpBird(gs.bird);
    sound.jump();
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

  // No document-level touch handlers — everything uses onClick only

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

  /* ═══════════════════════
     RENDER
     ═══════════════════════ */
  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center"
      style={{
        width: "100vw",
        height: "100dvh",
        background: "radial-gradient(ellipse at 50% 20%, #1e2a5e 0%, #111833 40%, #080c1f 100%)",
      }}
    >
      {/* Starfield */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {STARS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: s.size, height: s.size,
              left: s.left, top: s.top,
              background: s.isGold ? "#ffcc33" : "#cde",
              animation: `twinkle ${s.duration}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative" style={{ width: cssWidth, height: cssHeight }}>
        {/* ─── Canvas ─── */}
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            borderRadius: 20,
            boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 3px rgba(255,255,255,0.12)",
          }}
        />

        {/* Tap area for gameplay — simple onClick, no touch magic */}
        {screen === "playing" && (
          <div
            onClick={() => handleJump()}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              cursor: "pointer",
              zIndex: 5,
            }}
          />
        )}

        {/* ═══════════ MENU ═══════════ */}
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
                  // no text-stroke to avoid artifacts on A/R glyphs
                  letterSpacing: 6,
                }}>
                  FLAPPY
                </h1>
                <h1 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 62,
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
                  // no text-stroke to avoid artifacts on R/D glyphs
                  letterSpacing: 6,
                }}>
                  BIRD
                </h1>
              </div>
            </div>

            {/* High Score Chip */}
            <div
              style={{
                animation: "slideUp 0.5s ease-out 0.2s both",
                marginTop: 32,
                marginBottom: 28,
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
                ⚙️  Ayarlar
              </GlassButton>
              <GlassButton onClick={() => { setLeaderboard(getLeaderboard()); setScreen("leaderboard"); sound.click(); }}>
                🏆  Lider
              </GlassButton>
            </div>
          </Overlay>
        )}

        {/* ═══════════ GAME OVER ═══════════ */}
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
                OYUN BİTDİ
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
                ↻ Yenidən
              </ArcadeButton>
              <ArcadeButton color="orange" size="md" onClick={() => setScreen("menu")}>
                Menyu
              </ArcadeButton>
            </div>
          </Overlay>
        )}

        {/* ═══════════ SETTINGS ═══════════ */}
        {screen === "settings" && (
          <Overlay variant="dark">
            <div style={{ animation: "slideDown 0.4s ease-out both" }}>
              <SectionTitle>AYARLAR</SectionTitle>
            </div>

            {/* Difficulty */}
            <div style={{ animation: "slideUp 0.4s ease-out 0.1s both", marginTop: 32, width: 300 }}>
              <Label>Çətinlik</Label>
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
              <Label>Səs</Label>
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
                ← Geri
              </GlassButton>
            </div>
          </Overlay>
        )}

        {/* ═══════════ LEADERBOARD ═══════════ */}
        {screen === "leaderboard" && (
          <Overlay variant="dark">
            <div style={{ animation: "slideDown 0.4s ease-out both" }}>
              <SectionTitle>LİDER CƏDVƏL</SectionTitle>
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
                  Oyunçu
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" }}>
                  Xal
                </span>
              </div>

              {leaderboard.length === 0 ? (
                <div style={{ padding: "48px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🎮</div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                    Hələ heç kim oynamamış
                  </p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
                    İlk sən ol!
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
                ← Geri
              </GlassButton>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   REUSABLE UI COMPONENTS
   ═══════════════════════════════════════ */

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
        borderRadius: 20,
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
            Ən Yüksək
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
            ✨ YENİ REKORD ✨
          </span>
        </div>
      )}
    </div>
  );
}
