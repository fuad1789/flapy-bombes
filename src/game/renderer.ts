import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BIRD_WIDTH,
  BIRD_HEIGHT,
  BIRD_X,
  PIPE_WIDTH,
  GROUND_HEIGHT,
  COIN_RADIUS,
  POWERUP_SIZE,
  type Bird,
  type Pipe,
  type Particle,
  type Coin,
  type PowerUp,
  type ActivePowerUp,
  type ComboState,
  type DeathAnimation,
} from "./constants";

// ─── Day/Night cycle helpers ───

interface SkyColors {
  readonly top: string;
  readonly mid: string;
  readonly bottom: string;
  readonly sunVisible: boolean;
  readonly starsVisible: boolean;
}

function lerpColor(a: string, b: string, t: number): string {
  const parseHex = (hex: string) => {
    const c = hex.replace("#", "");
    return [
      parseInt(c.substring(0, 2), 16),
      parseInt(c.substring(2, 4), 16),
      parseInt(c.substring(4, 6), 16),
    ];
  };
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function getSkyColors(score: number): SkyColors {
  // Day: 0-10, Sunset: 11-25, Night: 26+
  if (score <= 8) {
    return { top: "#4ec0ca", mid: "#71d4db", bottom: "#b8e8c0", sunVisible: true, starsVisible: false };
  }
  if (score <= 10) {
    // Transition day -> sunset
    const t = (score - 8) / 2;
    return {
      top: lerpColor("#4ec0ca", "#e86833", t),
      mid: lerpColor("#71d4db", "#f0945a", t),
      bottom: lerpColor("#b8e8c0", "#f5c77e", t),
      sunVisible: true,
      starsVisible: false,
    };
  }
  if (score <= 23) {
    // Sunset
    return { top: "#e86833", mid: "#f0945a", bottom: "#f5c77e", sunVisible: true, starsVisible: false };
  }
  if (score <= 25) {
    // Transition sunset -> night
    const t = (score - 23) / 2;
    return {
      top: lerpColor("#e86833", "#1a1a4e", t),
      mid: lerpColor("#f0945a", "#2d2d6e", t),
      bottom: lerpColor("#f5c77e", "#3a2a5c", t),
      sunVisible: false,
      starsVisible: t > 0.5,
    };
  }
  // Night
  return { top: "#1a1a4e", mid: "#2d2d6e", bottom: "#3a2a5c", sunVisible: false, starsVisible: true };
}

// Deterministic stars for night sky
const NIGHT_STARS = Array.from({ length: 60 }, (_, i) => ({
  x: (i * 41 + 17) % GAME_WIDTH,
  y: (i * 29 + 7) % (GAME_HEIGHT - GROUND_HEIGHT - 100),
  size: 0.5 + (i % 3) * 0.5,
  twinkleSpeed: 0.02 + (i % 5) * 0.01,
  phase: (i * 73) % 100 / 100 * Math.PI * 2,
}));

export function drawBackground(ctx: CanvasRenderingContext2D, offset: number, score: number = 0) {
  const sky = getSkyColors(score);

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT - GROUND_HEIGHT);
  skyGrad.addColorStop(0, sky.top);
  skyGrad.addColorStop(0.5, sky.mid);
  skyGrad.addColorStop(1, sky.bottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT - GROUND_HEIGHT);

  // Stars (night)
  if (sky.starsVisible) {
    const frame = offset * 0.05;
    for (const star of NIGHT_STARS) {
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(frame * star.twinkleSpeed + star.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();

      // Star glow
      if (star.size > 1) {
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Sun (day/sunset only)
  if (sky.sunVisible) {
    ctx.beginPath();
    ctx.arc(320, 80, 40, 0, Math.PI * 2);
    const sunGrad = ctx.createRadialGradient(320, 80, 5, 320, 80, 40);
    sunGrad.addColorStop(0, "#fff8dc");
    sunGrad.addColorStop(0.5, "#ffe066");
    sunGrad.addColorStop(1, "rgba(255,224,102,0)");
    ctx.fillStyle = sunGrad;
    ctx.fill();
  }

  // Moon (night)
  if (sky.starsVisible) {
    ctx.beginPath();
    ctx.arc(320, 80, 25, 0, Math.PI * 2);
    const moonGrad = ctx.createRadialGradient(320, 80, 5, 320, 80, 25);
    moonGrad.addColorStop(0, "#f0f0e0");
    moonGrad.addColorStop(0.7, "#d8d8c8");
    moonGrad.addColorStop(1, "rgba(200,200,190,0)");
    ctx.fillStyle = moonGrad;
    ctx.fill();
  }

  // Clouds
  const cloudAlpha = sky.starsVisible ? 0.3 : 0.9;
  drawCloud(ctx, (100 - offset * 0.1) % (GAME_WIDTH + 100), 100, 1, cloudAlpha);
  drawCloud(ctx, (280 - offset * 0.15) % (GAME_WIDTH + 100), 60, 0.7, cloudAlpha);
  drawCloud(ctx, (50 - offset * 0.08) % (GAME_WIDTH + 100), 160, 0.8, cloudAlpha);

  // Distant hills
  const hillColor1 = sky.starsVisible ? "#3a5a3a" : "#8bc572";
  ctx.fillStyle = hillColor1;
  for (let i = -1; i < 3; i++) {
    const hx = (i * 250 - offset * 0.3) % (GAME_WIDTH + 250);
    ctx.beginPath();
    ctx.arc(hx, GAME_HEIGHT - GROUND_HEIGHT, 120, Math.PI, 0);
    ctx.fill();
  }

  // Near hills
  const hillColor2 = sky.starsVisible ? "#2d4a2d" : "#6ab04c";
  ctx.fillStyle = hillColor2;
  for (let i = -1; i < 3; i++) {
    const hx = (i * 200 + 100 - offset * 0.5) % (GAME_WIDTH + 200);
    ctx.beginPath();
    ctx.arc(hx, GAME_HEIGHT - GROUND_HEIGHT, 80, Math.PI, 0);
    ctx.fill();
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number = 0.9) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.arc(25, -5, 20, 0, Math.PI * 2);
  ctx.arc(-20, 5, 18, 0, Math.PI * 2);
  ctx.arc(10, 8, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGround(ctx: CanvasRenderingContext2D, offset: number) {
  const groundY = GAME_HEIGHT - GROUND_HEIGHT;

  // Dirt
  const dirtGrad = ctx.createLinearGradient(0, groundY, 0, GAME_HEIGHT);
  dirtGrad.addColorStop(0, "#d4a373");
  dirtGrad.addColorStop(0.15, "#c2884e");
  dirtGrad.addColorStop(1, "#a0603d");
  ctx.fillStyle = dirtGrad;
  ctx.fillRect(0, groundY, GAME_WIDTH, GROUND_HEIGHT);

  // Grass top
  ctx.fillStyle = "#5cb85c";
  ctx.fillRect(0, groundY, GAME_WIDTH, 15);

  // Grass highlight
  ctx.fillStyle = "#6fcf6f";
  ctx.fillRect(0, groundY, GAME_WIDTH, 6);

  // Grass blades
  ctx.strokeStyle = "#4a9e4a";
  ctx.lineWidth = 2;
  for (let i = 0; i < GAME_WIDTH; i += 12) {
    const gx = (i - offset) % GAME_WIDTH;
    const adjustedX = gx < 0 ? gx + GAME_WIDTH : gx;
    ctx.beginPath();
    ctx.moveTo(adjustedX, groundY + 15);
    ctx.quadraticCurveTo(adjustedX + 3, groundY + 5, adjustedX + 6, groundY + 14);
    ctx.stroke();
  }

  // Ground pattern lines
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i < GAME_WIDTH + 30; i += 30) {
    const lx = (i - offset % 30);
    ctx.beginPath();
    ctx.moveTo(lx, groundY + 20);
    ctx.lineTo(lx + 15, GAME_HEIGHT);
    ctx.stroke();
  }
}

export function drawPipe(ctx: CanvasRenderingContext2D, pipe: Pipe, gap: number) {
  const groundY = GAME_HEIGHT - GROUND_HEIGHT;
  const effectiveGap = pipe.isBoss ? gap - 30 : gap;

  // Top pipe
  drawPipeSection(ctx, pipe.x, 0, pipe.topHeight, true, pipe.isBoss, pipe.moving, pipe.width);
  // Bottom pipe
  const bottomY = pipe.topHeight + effectiveGap;
  drawPipeSection(ctx, pipe.x, bottomY, groundY - bottomY, false, pipe.isBoss, pipe.moving, pipe.width);

  // "BOSS!" text above boss pipes
  if (pipe.isBoss && pipe.x > 0 && pipe.x < GAME_WIDTH) {
    ctx.save();
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4444";
    ctx.strokeStyle = "#880000";
    ctx.lineWidth = 3;
    const textX = pipe.x + pipe.width / 2;
    ctx.strokeText("BOSS!", textX, pipe.topHeight + effectiveGap / 2 + 8);
    ctx.fillText("BOSS!", textX, pipe.topHeight + effectiveGap / 2 + 8);
    ctx.restore();
  }
}

function drawPipeSection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  isTop: boolean,
  isBoss: boolean,
  isMoving: boolean,
  pipeWidth: number
) {
  if (height <= 0) return;

  // Color scheme
  const colors = isBoss
    ? { light: "#cc4444", main: "#aa2222", dark: "#881111", border: "#660000", highlight: "rgba(255,100,100,0.3)" }
    : isMoving
    ? { light: "#6ce06c", main: "#4cc84c", dark: "#33a033", border: "#227722", highlight: "rgba(150,255,150,0.3)" }
    : { light: "#73d673", main: "#5cb85c", dark: "#3d8b3d", border: "#2d6b2d", highlight: "rgba(255,255,255,0.2)" };

  // Pipe body
  const bodyGrad = ctx.createLinearGradient(x, 0, x + pipeWidth, 0);
  bodyGrad.addColorStop(0, colors.main);
  bodyGrad.addColorStop(0.3, colors.light);
  bodyGrad.addColorStop(0.7, colors.main);
  bodyGrad.addColorStop(1, colors.dark);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x, y, pipeWidth, height);

  // Pipe border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, pipeWidth, height);

  // Moving pipe glow
  if (isMoving) {
    ctx.shadowColor = "rgba(100, 255, 100, 0.4)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(100, 255, 100, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y, pipeWidth + 2, height);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  // Pipe cap
  const capHeight = 26;
  const capOverhang = 6;
  const capY = isTop ? y + height - capHeight : y;

  const capGrad = ctx.createLinearGradient(x - capOverhang, 0, x + pipeWidth + capOverhang, 0);
  capGrad.addColorStop(0, colors.main);
  capGrad.addColorStop(0.3, isBoss ? "#dd6666" : isMoving ? "#82f082" : "#82e082");
  capGrad.addColorStop(0.7, colors.main);
  capGrad.addColorStop(1, colors.dark);
  ctx.fillStyle = capGrad;

  ctx.beginPath();
  const r = 4;
  const cx = x - capOverhang;
  const cw = pipeWidth + capOverhang * 2;
  ctx.moveTo(cx + r, capY);
  ctx.lineTo(cx + cw - r, capY);
  ctx.quadraticCurveTo(cx + cw, capY, cx + cw, capY + r);
  ctx.lineTo(cx + cw, capY + capHeight - r);
  ctx.quadraticCurveTo(cx + cw, capY + capHeight, cx + cw - r, capY + capHeight);
  ctx.lineTo(cx + r, capY + capHeight);
  ctx.quadraticCurveTo(cx, capY + capHeight, cx, capY + capHeight - r);
  ctx.lineTo(cx, capY + r);
  ctx.quadraticCurveTo(cx, capY, cx + r, capY);
  ctx.fill();

  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Highlight on cap
  ctx.fillStyle = colors.highlight;
  ctx.fillRect(cx + 4, capY + 3, 8, capHeight - 6);
}

// ─── Coin drawing ───

export function drawCoin(ctx: CanvasRenderingContext2D, coin: Coin) {
  if (coin.collected) return;

  ctx.save();
  ctx.translate(coin.x, coin.y);

  // Spin effect: scale x based on animation phase
  const scaleX = Math.cos(coin.animPhase);
  ctx.scale(scaleX, 1);

  // Outer glow
  ctx.shadowColor = "rgba(255, 215, 0, 0.6)";
  ctx.shadowBlur = 10;

  // Coin body
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, COIN_RADIUS);
  grad.addColorStop(0, "#fff8dc");
  grad.addColorStop(0.4, "#FFD700");
  grad.addColorStop(0.8, "#DAA520");
  grad.addColorStop(1, "#B8860B");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, COIN_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Inner circle
  ctx.strokeStyle = "#B8860B";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, COIN_RADIUS - 3, 0, Math.PI * 2);
  ctx.stroke();

  // Dollar sign or star
  if (Math.abs(scaleX) > 0.3) {
    ctx.fillStyle = "#B8860B";
    ctx.font = `bold ${COIN_RADIUS * 0.9}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 1);
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ─── Power-up drawing ───

const POWERUP_COLORS: Record<string, { bg: string; glow: string; icon: string }> = {
  shield: { bg: "#4488ff", glow: "rgba(68,136,255,0.6)", icon: "S" },
  shrink: { bg: "#44cc44", glow: "rgba(68,204,68,0.6)", icon: "s" },
  slowdown: { bg: "#ff8844", glow: "rgba(255,136,68,0.6)", icon: "~" },
};

export function drawPowerUp(ctx: CanvasRenderingContext2D, powerUp: PowerUp) {
  if (powerUp.collected) return;

  const colors = POWERUP_COLORS[powerUp.type];
  ctx.save();
  ctx.translate(powerUp.x, powerUp.y);

  // Glow
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 15;

  // Background circle
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, POWERUP_SIZE);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.4, colors.bg);
  grad.addColorStop(1, colors.bg + "88");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, POWERUP_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, POWERUP_SIZE / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Icon
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${POWERUP_SIZE * 0.55}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (powerUp.type === "shield") {
    // Shield icon
    ctx.fillText("\u{1F6E1}", 0, 0);
  } else if (powerUp.type === "shrink") {
    ctx.fillText("\u2B07", 0, 0);
  } else {
    ctx.fillText("\u23F1", 0, 0);
  }

  ctx.restore();
}

// ─── Active power-up indicator ───

export function drawPowerUpIndicator(
  ctx: CanvasRenderingContext2D,
  actives: readonly ActivePowerUp[],
  now: number
) {
  if (actives.length === 0) return;

  let yPos = 100;
  for (const active of actives) {
    const colors = POWERUP_COLORS[active.type];
    const label =
      active.type === "shield" ? "SHIELD" :
      active.type === "shrink" ? "SHRINK" : "SLOW";

    let timeText = "";
    if (active.type !== "shield") {
      const remaining = Math.max(0, Math.ceil((active.expiresAt - now) / 1000));
      timeText = ` ${remaining}s`;
    }

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = colors.bg + "44";
    ctx.beginPath();
    const rx = GAME_WIDTH - 80;
    const ry = yPos;
    ctx.roundRect(rx - 5, ry - 10, 78, 22, 6);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "right";
    ctx.fillStyle = colors.bg;
    ctx.fillText(label + timeText, GAME_WIDTH - 10, yPos + 4);
    ctx.restore();

    yPos += 26;
  }
}

// ─── Shield glow around bird ───

export function drawShieldGlow(ctx: CanvasRenderingContext2D, bird: Bird, frame: number) {
  ctx.save();
  const cx = BIRD_X + BIRD_WIDTH / 2;
  const cy = bird.y + BIRD_HEIGHT / 2;
  const pulse = 1 + Math.sin(frame * 0.1) * 0.1;
  const radius = (BIRD_WIDTH / 2 + 10) * pulse;

  ctx.strokeStyle = "rgba(68, 136, 255, 0.6)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(68, 136, 255, 0.5)";
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner glow
  ctx.strokeStyle = "rgba(100, 170, 255, 0.3)";
  ctx.lineWidth = 6;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// ─── Cached cibom image ───

let cibomImage: HTMLImageElement | null = null;
let cibomLoaded = false;

function getCibomImage(): HTMLImageElement | null {
  if (cibomImage) return cibomLoaded ? cibomImage : null;
  cibomImage = new Image();
  cibomImage.src = "/cibom.png";
  cibomImage.onload = () => { cibomLoaded = true; };
  return null;
}

export function drawBird(
  ctx: CanvasRenderingContext2D,
  bird: Bird,
  frame: number,
  isShrunk: boolean = false,
  deathAnim: DeathAnimation | null = null
) {
  ctx.save();

  const scale = isShrunk ? 0.6 : 1;
  const drawY = deathAnim?.active ? deathAnim.birdY : bird.y;

  ctx.translate(BIRD_X + BIRD_WIDTH / 2, drawY + BIRD_HEIGHT / 2);

  // Rotation
  let rot: number;
  if (deathAnim?.active) {
    rot = deathAnim.extraRotation;
  } else {
    rot = Math.min(Math.max(bird.rotation, -20), 45);
  }
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(scale, scale);

  // Subtle bob (only when not dying)
  if (!deathAnim?.active) {
    const bob = Math.sin(frame * 0.15) * 1.5;
    ctx.translate(0, bob);
  }

  const img = getCibomImage();

  if (img) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    ctx.drawImage(img, -BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT);
  } else {
    ctx.fillStyle = "rgba(100,100,100,0.5)";
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]) {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawScore(ctx: CanvasRenderingContext2D, score: number) {
  const text = String(score);
  ctx.font = "bold 52px Arial";
  ctx.textAlign = "center";

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillText(text, GAME_WIDTH / 2 + 2, 72);

  // Outline
  ctx.strokeStyle = "#543b00";
  ctx.lineWidth = 5;
  ctx.strokeText(text, GAME_WIDTH / 2, 70);

  // Fill
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, GAME_WIDTH / 2, 70);
}

// ─── Combo display ───

export function drawCombo(ctx: CanvasRenderingContext2D, combo: ComboState) {
  if (combo.multiplier <= 1) return;

  const text = `x${combo.multiplier} COMBO!`;

  // Pop animation
  let popScale = 1;
  if (combo.displayTimer > 70) {
    popScale = 1 + (combo.displayTimer - 70) / 20 * 0.4;
  }

  ctx.save();
  ctx.translate(GAME_WIDTH / 2, 110);
  ctx.scale(popScale, popScale);

  ctx.font = "bold 26px Arial";
  ctx.textAlign = "center";

  // Glow
  ctx.shadowColor = "rgba(255, 204, 0, 0.6)";
  ctx.shadowBlur = 12;

  // Outline
  ctx.strokeStyle = "#cc6600";
  ctx.lineWidth = 4;
  ctx.strokeText(text, 0, 0);

  // Fill gradient
  const colors = ["#FFD700", "#FFA500", "#FF6347", "#FFD700"];
  const colorIndex = combo.multiplier - 2;
  ctx.fillStyle = colors[Math.min(colorIndex, colors.length - 1)];
  ctx.fillText(text, 0, 0);

  ctx.restore();
}

// ─── Death screen flash ───

export function drawScreenFlash(ctx: CanvasRenderingContext2D, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.restore();
}

export function drawGetReady(ctx: CanvasRenderingContext2D, frame: number) {
  const float = Math.sin(frame * 0.05) * 5;

  ctx.font = "bold 38px Arial";
  ctx.textAlign = "center";

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillText("Hazır Ol!", GAME_WIDTH / 2 + 2, 182 + float);

  ctx.strokeStyle = "#543b00";
  ctx.lineWidth = 4;
  ctx.strokeText("Hazır Ol!", GAME_WIDTH / 2, 180 + float);

  ctx.fillStyle = "#ffffff";
  ctx.fillText("Hazır Ol!", GAME_WIDTH / 2, 180 + float);

  // Tap instruction
  ctx.font = "18px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("Toxunun və ya Space basın", GAME_WIDTH / 2, 230 + float);

  // Tap icon
  const iconY = 290 + float;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(GAME_WIDTH / 2, iconY, 20, 0, Math.PI * 2);
  ctx.stroke();

  // Finger
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.ellipse(GAME_WIDTH / 2, iconY + 5, 6, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}
