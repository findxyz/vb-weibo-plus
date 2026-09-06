// 一版独立动画原型，用于验证原素材在群聊回归场景里的表现。
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const play = document.querySelector('#play');
const pause = document.querySelector('#pause');
const skip = document.querySelector('#skip');
const seek = document.querySelector('#seek');
const output = document.querySelector('output');
const nameInput = document.querySelector('#name');
const sheets = {};
let time = 0;
let running = false;
let last = 0;
let width = 0;
let height = 0;
let loaded = false;
const phases = ['入场', '指点', '轻戳水泡', '欢迎回归', '雷欧登场', '飞离', '播放结束'];

function memberName() { return nameInput.value.trim() || '小明'; }

function box(x, y, w, h, color, radius = 12) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

function text(value, x, y, size, color, align = 'center', maxWidth = width) {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y, maxWidth);
}

function sprite(key, frame, x, y, h) {
  const img = sheets[key];
  const sw = Math.floor(img.width / 5);
  const sh = Math.floor(img.height / 3);
  const f = Math.max(0, Math.min(14, frame));
  // 爆炸图集带有分隔线；角色图集内缩 1 像素，避免缩放时采样到相邻帧。
  const inset = key === 'boom' ? 24 : 1;
  ctx.drawImage(img, (f % 5) * sw + inset, Math.floor(f / 5) * sh + inset,
    sw - inset * 2, sh - inset * 2, x, y, h * sw / sh, h);
}

function render() {
  ctx.clearRect(0, 0, width, height);
  if (!loaded) return;
  const t = time;
  const phase = t < 2 ? 0 : t < 3.4 ? 1 : t < 4.2 ? 2 : t < 5.3 ? 3 : t < 7.175 ? 4 : t < 9 ? 5 : 6;
  output.value = `${t.toFixed(1)} / 9.0 秒 · ${phases[phase]}`;
  seek.value = t;
  if (t >= 9) return;
  const h = Math.min(235, width * .52);
  const actorWidth = h * Math.floor(sheets.walk.width / 5) / Math.floor(sheets.walk.height / 3);
  const targetX = width * .58;
  const actorX = targetX - actorWidth + 8;
  const ground = height - 28;
  const targetY = ground - 165;
  const actorY = ground - h;
  const cardX = targetX + 22;
  const awake = t >= 4.65;
  ctx.save();
  ctx.globalAlpha = awake ? 1 : 0.92;
  ctx.fillStyle = awake ? '#d6ece6' : '#bde7f5';
  ctx.beginPath();
  ctx.arc(cardX, targetY, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  text([...memberName()][0], cardX, targetY + 9, 28, awake ? '#285e78' : '#6e9cad');
  if (t < 4.2) {
    // 半透明水泡包住头像，用高光表现泡泡表面。
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cardX, targetY, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(cardX - 20, targetY - 32, 9, 14, -0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text('泡泡中', cardX, targetY + 77, 13, '#4f8a9b');
  } else if (t < 4.65) {
    const p = (t - 4.2) / .45;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    for (let i = 0; i < 7; i++) {
      const angle = i * 0.9;
      const radius = 34 + p * 44;
      const size = 5 + (i % 3) * 2;
      box(cardX + Math.cos(angle) * radius - size / 2, targetY + Math.sin(angle) * radius - size / 2, size, size, '#9dd8e9', size / 2);
    }
    ctx.restore();
  } else {
    text('已冒泡', cardX, targetY + 77, 13, '#376966');
  }
  if (t < 2) sprite('walk', Math.floor(t * 10) % 15, -actorWidth + (actorX + actorWidth) * t / 2, actorY, h);
  else if (t < 3.4) sprite('point', 11 + Math.min(3, Math.floor((t - 2) * 8)), actorX, actorY, h);
  else if (t < 5.3) sprite('point', 11 + Math.min(3, Math.floor((t - 3.4) * 8)), actorX, actorY, h);
  else if (t < 7.175) sprite('leo', Math.floor((t - 5.3) * 8), actorX, actorY, h);
  else {
    const p = (t - 7.175) / 1.825;
    sprite('fly', Math.floor((t - 7.175) * 8) % 15, actorX + p * (width - actorX), actorY - p * height, h);
  }
  if (t >= 2 && t < 3.4) {
    const bubbleX = Math.max(14, Math.min(width - 240, actorX - 10));
    box(bubbleX, actorY - 55, 225, 44, '#ffffff');
    text(`${memberName()}，终于冒泡了！`, bubbleX + 112, actorY - 27, 14, '#285e78', 'center', 201);
  }
  if (t >= 4.65) {
    const p = Math.min(1, (t - 4.65) / .4);
    ctx.save();
    ctx.globalAlpha = Math.min(p, (9 - t) / .45);
    const panelWidth = Math.min(330, width - 28);
    const x = (width - panelWidth) / 2;
    const y = 162 + (1 - p) * 16;
    box(x, y, panelWidth, 78, '#285e78');
    box(x + 15, y + 16, 44, 44, '#d6ece6');
    text([...memberName()][0], x + 37, y + 46, 23, '#285e78');
    text(`${memberName()} 回归了！`, x + 73, y + 34, 17, '#ffffff', 'left', panelWidth - 86);
    text('泡泡破裂，欢迎归队', x + 73, y + 58, 12, '#c3dce5', 'left');
    ctx.restore();
  }
}

function resize() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function updateButtons() {
  pause.textContent = running ? '暂停' : '继续';
  pause.disabled = time >= 9;
  skip.disabled = time >= 9;
}

function tick(now) {
  if (running) {
    time = Math.min(9, time + (now - last) / 1000);
    if (time >= 9) { running = false; updateButtons(); }
    render();
  }
  last = now;
  requestAnimationFrame(tick);
}

play.onclick = () => { time = 0; running = true; last = performance.now(); updateButtons(); render(); };
pause.onclick = () => { running = !running; last = performance.now(); updateButtons(); };
skip.onclick = () => { time = 9; running = false; updateButtons(); render(); };
seek.oninput = () => { time = Number(seek.value); running = false; updateButtons(); render(); };
nameInput.oninput = () => {
  document.querySelector('#member-name').textContent = memberName();
  document.querySelector('#member-avatar').textContent = [...memberName()][0];
  render();
};
new ResizeObserver(resize).observe(canvas);
Promise.all(Object.entries({ walk: '走路动效', point: '指着文件', kick: '踹文件动效', boom: '爆炸', leo: '雷欧登场', fly: '出场飞行动效' }).map(async ([key, file]) => {
  const img = new Image();
  img.src = `assets/${file}_spritesheet_transparent.png`;
  await img.decode();
  sheets[key] = img;
})).then(() => {
  loaded = true;
  play.disabled = false;
  seek.disabled = false;
  updateButtons();
  resize();
  requestAnimationFrame(tick);
}).catch(() => { output.value = '素材加载失败，请刷新重试。'; });
