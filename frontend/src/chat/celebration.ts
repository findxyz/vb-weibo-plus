import { STORAGE_KEYS } from '../../../src/main/resources/static/shared/storage-keys.js';
import { compareMessages, type ChatMessage } from './api';

export type CelebrationEntry = { name: string; avatar: string; interval: number };
export type CelebrationMember = CelebrationEntry & { senderId: number };

type Roster = Record<string, Record<string, CelebrationEntry>>;
type Seen = Record<string, number>;

const DEFAULT_INTERVAL = 30;
const TIMINGS = { walk: 2400, poke: 800, cheer: 1300, mount: 625, exit: 1600 };

function loadStore<T>(key: string): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
    return parsed && typeof parsed === 'object' ? parsed as T : {} as T;
  } catch {
    return {} as T;
  }
}

export type CelebrationController = {
  members: (gid: number) => CelebrationMember[];
  entry: (gid: number, senderId: number) => CelebrationEntry | null;
  setMember: (gid: number, senderId: number, data: CelebrationEntry | null) => void;
  seed: (gid: number, messages: ChatMessage[]) => void;
  process: (gid: number, arrivals: ChatMessage[]) => void;
  cancel: () => void;
};

export function createCelebration(
  stage: HTMLElement,
  getCurrentGid: () => number | null,
  getMessages: () => ChatMessage[],
): CelebrationController {
  const roster = loadStore<Roster>(STORAGE_KEYS.CHAT_CELEBRATION_ROSTER);
  const seen = loadStore<Seen>(STORAGE_KEYS.CHAT_CELEBRATION_SEEN);
  let generation = 0;
  const active = new Set<{ cancel: () => void }>();

  function saveRoster() {
    localStorage.setItem(STORAGE_KEYS.CHAT_CELEBRATION_ROSTER, JSON.stringify(roster));
  }

  function saveSeen() {
    localStorage.setItem(STORAGE_KEYS.CHAT_CELEBRATION_SEEN, JSON.stringify(seen));
  }

  function entry(gid: number, senderId: number) {
    return roster[String(gid)]?.[String(senderId)] ?? null;
  }

  function members(gid: number): CelebrationMember[] {
    return Object.entries(roster[String(gid)] ?? {})
      .map(([senderId, value]) => ({ senderId: Number(senderId), ...value }));
  }

  function cancel() {
    generation += 1;
    for (const run of active) run.cancel();
    active.clear();
    stage.replaceChildren();
  }

  // 用当前已加载的消息垫高基线，刚加入名单的活跃成员不会立刻触发庆祝。
  function seed(gid: number, messages: ChatMessage[]) {
    const groupRoster = roster[String(gid)];
    if (!groupRoster) return;
    let changed = false;
    for (const senderId of Object.keys(groupRoster)) {
      let latest = 0;
      for (const message of messages) {
        if (String(message.senderId) === senderId && message.createdAt > latest) latest = message.createdAt;
      }
      const key = `${gid}:${senderId}`;
      if (latest > (seen[key] || 0)) {
        seen[key] = latest;
        changed = true;
      }
    }
    if (changed) saveSeen();
  }

  function setMember(gid: number, senderId: number, data: CelebrationEntry | null) {
    const groupRoster = roster[String(gid)] ?? (roster[String(gid)] = {});
    if (data) groupRoster[String(senderId)] = data;
    else delete groupRoster[String(senderId)];
    saveRoster();
    if (data) seed(gid, getMessages());
  }

  function process(gid: number, arrivals: ChatMessage[]) {
    if (!arrivals.length) return;
    let changed = false;
    for (const message of [...arrivals].sort(compareMessages)) {
      const member = entry(gid, message.senderId);
      if (!member) continue;
      const key = `${gid}:${message.senderId}`;
      const baseline = seen[key] || 0;
      const interval = member.interval > 0 ? member.interval : DEFAULT_INTERVAL;
      if (message.createdAt <= baseline) continue;
      if (!baseline) {
        seen[key] = message.createdAt;
        changed = true;
        continue;
      }
      if (message.createdAt - baseline >= interval * 1000) spawn(gid, member);
      seen[key] = message.createdAt;
      changed = true;
    }
    if (changed) saveSeen();
  }

  // 图集按需加载一次：走路、指泡、雷欧登场，布局均为 5 列 3 行。
  let sheetsPromise: Promise<Record<'walk' | 'point' | 'leo', HTMLImageElement>> | null = null;
  function loadSheets() {
    if (!sheetsPromise) {
      sheetsPromise = Promise.all((['walk', 'point', 'leo'] as const).map(async key => {
        const image = new Image();
        image.src = `/chat/assets/monster/${key}.png`;
        await image.decode();
        return [key, image] as const;
      })).then(entries => Object.fromEntries(entries) as Record<'walk' | 'point' | 'leo', HTMLImageElement>)
        .catch(error => {
          sheetsPromise = null;
          throw error;
        });
    }
    return sheetsPromise;
  }

  function drawMonsterFrame(canvas: HTMLCanvasElement, image: HTMLImageElement, frame: number, flip: boolean) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sw = Math.floor(image.width / 5);
    const sh = Math.floor(image.height / 3);
    const f = Math.max(0, Math.min(14, frame));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (flip) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    const h = canvas.height * 0.96;
    const w = h * sw / sh;
    ctx.drawImage(image, (f % 5) * sw + 1, Math.floor(f / 5) * sh + 1, sw - 2, sh - 2,
      (canvas.width - w) / 2, 0, w, h);
  }

  async function spawn(gid: number, member: CelebrationEntry) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const run = { cancelled: false, cancel: () => {} };
    const currentGeneration = generation;
    active.add(run);
    const isCurrent = () => !run.cancelled
      && currentGeneration === generation
      && getCurrentGid() === gid;
    let card: HTMLDivElement | null = null;
    let wrapper: HTMLDivElement | null = null;
    let animation: Animation | null = null;
    let skipped = false;
    const waits = new Set<() => void>();
    const finish = () => {
      if (skipped) return;
      skipped = true;
      run.cancelled = true;
      animation?.cancel();
      for (const done of waits) done();
    };
    run.cancel = finish;

    try {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!isCurrent() || width < 380 || height < 340) {
        if (width < 380 || height < 340) console.warn('回归庆祝跳过：舞台尺寸不足', width, height);
        return;
      }
      let sheets: Record<'walk' | 'point' | 'leo', HTMLImageElement>;
      try {
        sheets = await loadSheets();
      } catch (error) {
        console.warn('回归庆祝图集加载失败：', error);
        return;
      }
      if (!isCurrent()) return;
      const name = member.name || '未知成员';

      card = document.createElement('div');
      card.className = 'celebration-member';
      const figure = document.createElement('div');
      figure.className = 'celebration-member-figure';
      const avatar = document.createElement('span');
      avatar.className = 'celebration-member-avatar';
      if (member.avatar) {
        const image = document.createElement('img');
        image.src = member.avatar;
        image.alt = '';
        avatar.append(image);
      } else {
        avatar.textContent = name.slice(0, 1);
      }
      const bubble = document.createElement('span');
      bubble.className = 'celebration-bubble';
      bubble.setAttribute('aria-hidden', 'true');
      figure.append(avatar, bubble);
      card.append(figure);

      wrapper = document.createElement('div');
      wrapper.className = 'celebration';
      const actor = document.createElement('button');
      actor.type = 'button';
      actor.className = 'celebration-actor';
      actor.setAttribute('aria-label', `跳过${name}的回归庆祝`);
      const monster = document.createElement('canvas');
      monster.className = 'celebration-monster';
      monster.width = 440;
      monster.height = 440;
      actor.append(monster);
      const speech = document.createElement('span');
      speech.className = 'celebration-speech';
      speech.textContent = '你终于冒泡了';
      actor.append(speech);
      wrapper.append(actor);
      stage.append(card, wrapper);

      const target = {
        x: 170 + Math.random() * Math.max(1, width - 340),
        y: 140 + Math.random() * Math.max(1, height - 300),
      };
      card.style.left = `${target.x}px`;
      card.style.top = `${target.y}px`;
      const flip = target.x <= width / 2;
      const spot = { x: target.x + (flip ? -30 : -198), y: target.y - 83 };
      if (flip) actor.classList.add('flip');
      const start = flip ? { x: width + 70, y: spot.y } : { x: -70, y: spot.y };
      const exit = flip ? { x: -260, y: -260 } : { x: width + 260, y: -260 };

      const wait = (ms: number) => new Promise<void>(resolve => {
        if (!isCurrent()) { resolve(); return; }
        const done = () => {
          window.clearTimeout(timer);
          waits.delete(done);
          resolve();
        };
        const timer = window.setTimeout(done, ms);
        waits.add(done);
      });
      actor.addEventListener('click', finish);

      const move = (from: { x: number; y: number }, to: { x: number; y: number }, duration: number) => {
        if (!isCurrent() || !wrapper) return Promise.resolve();
        animation = wrapper.animate([
          { transform: `translate(${from.x}px, ${from.y}px)` },
          { transform: `translate(${to.x}px, ${to.y}px)` },
        ], { duration, easing: 'linear', fill: 'both' });
        return animation.finished.catch(() => {});
      };

      const popBubble = () => {
        card?.classList.remove('is-poked');
        card?.classList.add('is-popped');
        speech.textContent = '赶紧的一同拯救世界去';
        const ring = document.createElement('i');
        ring.className = 'celebration-ring';
        figure.append(ring);
        for (let index = 0; index < 8; index += 1) {
          const drop = document.createElement('i');
          drop.className = 'celebration-drop';
          figure.append(drop);
          const angle = index * 0.785 + 0.4;
          const distance = 40 + (index % 3) * 16;
          drop.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            {
              transform: `translate(${Math.round(Math.cos(angle) * distance)}px, ${Math.round(Math.sin(angle) * distance - 10)}px) scale(0.3)`,
              opacity: 0,
            },
          ], { duration: 520 + (index % 3) * 90, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'forwards' });
        }
      };

      const walkEnd = TIMINGS.walk;
      const pokeEnd = walkEnd + TIMINGS.poke;
      const cheerEnd = pokeEnd + TIMINGS.cheer;
      const rideEnd = cheerEnd + TIMINGS.mount;
      const paintStart = performance.now();
      let lastSheet: HTMLImageElement | null = null;
      let lastFrame = -1;
      const paint = (now: number) => {
        if (!isCurrent()) return;
        const elapsed = now - paintStart;
        let sheet: HTMLImageElement;
        let frame: number;
        if (elapsed < walkEnd) {
          sheet = sheets.walk;
          frame = Math.floor(elapsed / 1000 * 8) % 15;
        } else if (elapsed < pokeEnd) {
          sheet = sheets.point;
          frame = 11 + Math.min(3, Math.floor((elapsed - walkEnd) / 1000 * 8));
        } else if (elapsed < cheerEnd) {
          sheet = sheets.leo;
          frame = Math.min(4, Math.floor((elapsed - pokeEnd) / 1000 * 6));
        } else if (elapsed < rideEnd) {
          sheet = sheets.leo;
          frame = 5 + Math.min(4, Math.floor((elapsed - cheerEnd) / 1000 * 8));
        } else {
          sheet = sheets.leo;
          frame = 10 + Math.floor((elapsed - rideEnd) / 1000 * 8) % 5;
        }
        if (sheet !== lastSheet || frame !== lastFrame) {
          drawMonsterFrame(monster, sheet, frame, flip);
          lastSheet = sheet;
          lastFrame = frame;
        }
        if (isCurrent()) requestAnimationFrame(paint);
      };
      requestAnimationFrame(paint);

      wrapper.style.transform = `translate(${start.x}px, ${start.y}px)`;
      await move(start, spot, TIMINGS.walk);
      if (!isCurrent()) return;
      card.classList.add('is-poked');
      actor.classList.add('is-poking');
      await wait(TIMINGS.poke);
      if (!isCurrent()) return;
      actor.classList.remove('is-poking');
      popBubble();
      await wait(TIMINGS.cheer + TIMINGS.mount);
      if (!isCurrent()) return;
      const offset = { x: target.x - spot.x, y: target.y - spot.y };
      const dx = exit.x + offset.x - target.x;
      const dy = exit.y + offset.y - target.y;
      card.animate([
        { transform: 'translate(-50%, -50%)' },
        {
          transform: `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px)) rotate(${flip ? -5 : 5}deg)`,
        },
      ], { duration: TIMINGS.exit, easing: 'linear', fill: 'forwards' });
      await move(spot, exit, TIMINGS.exit);
    } finally {
      finish();
      active.delete(run);
      wrapper?.remove();
      card?.remove();
    }
  }

  return { members, entry, setMember, seed, process, cancel };
}
