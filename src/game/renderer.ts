import {
  GAME_WIDTH,
  GAME_HEIGHT,
  BIRD_WIDTH,
  BIRD_HEIGHT,
  BIRD_X,
  PIPE_WIDTH,
  GROUND_HEIGHT,
  type Bird,
  type Pipe,
  type Particle,
} from "./constants";

export function drawBackground(ctx: CanvasRenderingContext2D, offset: number) {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT - GROUND_HEIGHT);
  skyGrad.addColorStop(0, "#4ec0ca");
  skyGrad.addColorStop(0.5, "#71d4db");
  skyGrad.addColorStop(1, "#b8e8c0");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT - GROUND_HEIGHT);

  // Sun
  ctx.beginPath();
  ctx.arc(320, 80, 40, 0, Math.PI * 2);
  const sunGrad = ctx.createRadialGradient(320, 80, 5, 320, 80, 40);
  sunGrad.addColorStop(0, "#fff8dc");
  sunGrad.addColorStop(0.5, "#ffe066");
  sunGrad.addColorStop(1, "rgba(255,224,102,0)");
  ctx.fillStyle = sunGrad;
  ctx.fill();

  // Clouds
  drawCloud(ctx, (100 - offset * 0.1) % (GAME_WIDTH + 100), 100, 1);
  drawCloud(ctx, (280 - offset * 0.15) % (GAME_WIDTH + 100), 60, 0.7);
  drawCloud(ctx, (50 - offset * 0.08) % (GAME_WIDTH + 100), 160, 0.8);

  // Distant hills
  ctx.fillStyle = "#8bc572";
  for (let i = -1; i < 3; i++) {
    const hx = (i * 250 - offset * 0.3) % (GAME_WIDTH + 250);
    ctx.beginPath();
    ctx.arc(hx, GAME_HEIGHT - GROUND_HEIGHT, 120, Math.PI, 0);
    ctx.fill();
  }

  // Near hills
  ctx.fillStyle = "#6ab04c";
  for (let i = -1; i < 3; i++) {
    const hx = (i * 200 + 100 - offset * 0.5) % (GAME_WIDTH + 200);
    ctx.beginPath();
    ctx.arc(hx, GAME_HEIGHT - GROUND_HEIGHT, 80, Math.PI, 0);
    ctx.fill();
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
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

  // Grass blades — synced with pipe speed (same offset)
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

  // Ground pattern lines — synced with pipe speed
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

  // Top pipe
  drawPipeSection(ctx, pipe.x, 0, pipe.topHeight, true);
  // Bottom pipe
  const bottomY = pipe.topHeight + gap;
  drawPipeSection(ctx, pipe.x, bottomY, groundY - bottomY, false);
}

function drawPipeSection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  isTop: boolean
) {
  if (height <= 0) return;

  // Pipe body
  const bodyGrad = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
  bodyGrad.addColorStop(0, "#5cb85c");
  bodyGrad.addColorStop(0.3, "#73d673");
  bodyGrad.addColorStop(0.7, "#5cb85c");
  bodyGrad.addColorStop(1, "#3d8b3d");
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x, y, PIPE_WIDTH, height);

  // Pipe border
  ctx.strokeStyle = "#2d6b2d";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, PIPE_WIDTH, height);

  // Pipe cap
  const capHeight = 26;
  const capOverhang = 6;
  const capY = isTop ? y + height - capHeight : y;

  const capGrad = ctx.createLinearGradient(x - capOverhang, 0, x + PIPE_WIDTH + capOverhang, 0);
  capGrad.addColorStop(0, "#5cb85c");
  capGrad.addColorStop(0.3, "#82e082");
  capGrad.addColorStop(0.7, "#5cb85c");
  capGrad.addColorStop(1, "#3d8b3d");
  ctx.fillStyle = capGrad;

  ctx.beginPath();
  const r = 4;
  const cx = x - capOverhang;
  const cw = PIPE_WIDTH + capOverhang * 2;
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

  ctx.strokeStyle = "#2d6b2d";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Highlight on cap
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(cx + 4, capY + 3, 8, capHeight - 6);
}

// Cached cibom image
let cibomImage: HTMLImageElement | null = null;
let cibomLoaded = false;

function getCibomImage(): HTMLImageElement | null {
  if (cibomImage) return cibomLoaded ? cibomImage : null;
  cibomImage = new Image();
  cibomImage.src = "/cibom.png";
  cibomImage.onload = () => { cibomLoaded = true; };
  return null;
}

export function drawBird(ctx: CanvasRenderingContext2D, bird: Bird, frame: number) {
  ctx.save();
  ctx.translate(BIRD_X + BIRD_WIDTH / 2, bird.y + BIRD_HEIGHT / 2);

  // Clamp rotation
  const rot = Math.min(Math.max(bird.rotation, -20), 45);
  ctx.rotate((rot * Math.PI) / 180);

  // Subtle bob
  const bob = Math.sin(frame * 0.15) * 1.5;
  ctx.translate(0, bob);

  const img = getCibomImage();

  if (img) {
    // High-quality image rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Drop shadow
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    // Draw image directly — no circle clip, no border
    ctx.drawImage(img, -BIRD_WIDTH / 2, -BIRD_HEIGHT / 2, BIRD_WIDTH, BIRD_HEIGHT);
  } else {
    // Fallback while loading
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
