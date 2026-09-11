import {attachDismiss, positionPopover} from "../shared/popover.js";

export function createCelebration({
  elements: {
    celebrationRoster: celebrationRosterElement, celebrationStage, celebrationInterval,
    celebrationPopover, celebrationPopoverTitle, celebrationPopoverJoin,
    celebrationPopoverRemove, celebrationPopoverClose
  },
  messageView, getCurrentGid, getMessages, compareMessages}) {
  const CELEBRATION_ROSTER_KEY = "weibo-chat:celebration-roster";
  const CELEBRATION_SEEN_KEY = "weibo-chat:celebration-seen";
  // 回归间隔默认值，单位秒
  const CELEBRATION_DEFAULT_INTERVAL = 30;

  function loadCelebrationStore(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  // roster：按群按成员存 { name, avatar, interval }；seen：按「群:成员」存最后见到的发言时间
  const celebrationRoster = loadCelebrationStore(CELEBRATION_ROSTER_KEY);
  const celebrationSeen = loadCelebrationStore(CELEBRATION_SEEN_KEY);
  let celebrationDraft = null;
  let celebrationGeneration = 0;
  const activeCelebrations = new Set();

  function cancelCelebrations() {
    celebrationGeneration++;
    for (const celebration of activeCelebrations) celebration.cancel();
    activeCelebrations.clear();
    celebrationStage.replaceChildren();
  }

  function celebrationEntry(gid, senderId) {
    return celebrationRoster[String(gid)]?.[String(senderId)] || null;
  }

  function saveCelebrationRoster() {
    localStorage.setItem(CELEBRATION_ROSTER_KEY, JSON.stringify(celebrationRoster));
  }

  function saveCelebrationSeen() {
    localStorage.setItem(CELEBRATION_SEEN_KEY, JSON.stringify(celebrationSeen));
  }

  // 用当前加载到的消息悄悄垫高基线：刚加入名单的活跃成员不会立刻触发庆祝
  function seedCelebrationSeen(gid, messages) {
    const roster = celebrationRoster[String(gid)];
    if (!roster) return;
    let changed = false;
    for (const [senderId] of Object.entries(roster)) {
      let latest = 0;
      for (const message of messages) {
        if (String(message.senderId) === senderId && message.createdAt > latest) {
          latest = message.createdAt;
        }
      }
      const key = `${gid}:${senderId}`;
      if (latest > (celebrationSeen[key] || 0)) {
        celebrationSeen[key] = latest;
        changed = true;
      }
    }
    if (changed) saveCelebrationSeen();
  }

  function setCelebrationMember(gid, senderId, data) {
    const roster = celebrationRoster[String(gid)]
      || (celebrationRoster[String(gid)] = {});
    if (data) {
      roster[String(senderId)] = data;
      seedCelebrationSeen(gid, getMessages());
    } else {
      delete roster[String(senderId)];
    }
    saveCelebrationRoster();
    renderCelebrationRoster();
  }

  // 新到达消息按时间顺序逐条判定：页面没见过其发言，或沉默满间隔即庆祝
  function processCelebrationArrivals(gid, arrivals) {
    let changed = false;
    for (const message of [...arrivals].sort(compareMessages)) {
      const entry = celebrationEntry(gid, message.senderId);
      if (!entry) continue;
      const key = `${gid}:${message.senderId}`;
      const baseline = celebrationSeen[key] || 0;
      const interval = entry.interval > 0 ? entry.interval : CELEBRATION_DEFAULT_INTERVAL;
      if (message.createdAt <= baseline) continue;
      if (!baseline) {
        // 没有可靠的上一条消息时间时先建立基线，避免把普通消息误判为久默回归
        celebrationSeen[key] = message.createdAt;
        changed = true;
        continue;
      }
      if (message.createdAt - baseline >= interval * 1000) {
        spawnCelebration(gid, entry);
      }
      celebrationSeen[key] = message.createdAt;
      changed = true;
    }
    if (changed) saveCelebrationSeen();
  }

  function renderCelebrationRoster() {
    const container = celebrationRosterElement;
    container.replaceChildren();
    const members = Object.entries(celebrationRoster[String(getCurrentGid())] || {});
    container.hidden = members.length === 0;
    for (const [senderId, entry] of members) {
      const chip = document.createElement("span");
      chip.className = "celebration-chip";
      chip.title = `沉默 ${entry.interval} 秒后回归时，怪兽会来戳破泡泡`;
      chip.append(messageView.avatar(entry, "celebration-chip-avatar"));
      const name = document.createElement("button");
      name.type = "button";
      name.className = "celebration-chip-name";
      name.textContent = entry.name || "未知成员";
      name.addEventListener("click", () => openCelebrationPopover(
        getCurrentGid(), senderId, entry.name, entry.avatar, name));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "celebration-chip-remove";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `将${entry.name || "未知成员"}移出庆祝名单`);
      remove.addEventListener("click", () => {
        setCelebrationMember(getCurrentGid(), senderId, null);
        if (celebrationDraft?.senderId === senderId
          && celebrationDraft?.gid === getCurrentGid()) {
          closeCelebrationPopover();
        }
      });
      chip.append(name, remove);
      container.append(chip);
    }
  }

  function commitCelebrationDraft() {
    if (!celebrationDraft) return;
    const text = celebrationInterval.value.trim();
    const raw = Number(text);
    // 间隔最小 1 秒，清空或乱填时回退默认值
    const interval = text !== "" && Number.isFinite(raw)
      ? Math.max(Math.floor(raw), 1)
      : CELEBRATION_DEFAULT_INTERVAL;
    setCelebrationMember(celebrationDraft.gid, celebrationDraft.senderId, {
      name: celebrationDraft.name,
      avatar: celebrationDraft.avatar,
      interval
    });
    celebrationPopoverJoin.hidden = true;
    celebrationPopoverRemove.hidden = false;
  }

  function openCelebrationPopover(gid, senderId, name, avatarUrl, anchor) {
    if (!gid) return;
    const entry = celebrationEntry(gid, senderId);
    celebrationDraft = {
      gid, senderId,
      name: name || "未知成员",
      avatar: avatarUrl || ""
    };
    celebrationPopoverTitle.textContent = "回归庆祝";
    celebrationInterval.value =
      String(entry?.interval > 0 ? entry.interval : CELEBRATION_DEFAULT_INTERVAL);
    celebrationPopoverRemove.hidden = !entry;
    celebrationPopoverJoin.hidden = !!entry;
    celebrationPopover.hidden = false;
    positionPopover(celebrationPopover, anchor, {align: "left", gap: 6});
  }

  function closeCelebrationPopover() {
    celebrationPopover.hidden = true;
    celebrationDraft = null;
  }

  // 怪兽图集按需加载一次：走路、指泡、雷欧登场（欢呼与骑乘飞离），布局均为 5 列 3 行
  let monsterSheetsPromise = null;
  function loadMonsterSheets() {
    if (!monsterSheetsPromise) {
      monsterSheetsPromise = Promise.all(["walk", "point", "leo"].map(async key => {
        const img = new Image();
        img.src = `/chat/assets/monster/${key}.png`;
        await img.decode();
        return [key, img];
      })).then(entries => Object.fromEntries(entries));
      monsterSheetsPromise.catch(() => { monsterSheetsPromise = null; });
    }
    return monsterSheetsPromise;
  }

  function drawMonsterFrame(canvas, img, frame, flip) {
    const ctx = canvas.getContext("2d");
    const sw = Math.floor(img.width / 5);
    const sh = Math.floor(img.height / 3);
    const f = Math.max(0, Math.min(14, frame));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (flip) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    const h = canvas.height * 0.96;
    const w = h * sw / sh;
    // 内缩 1 像素采样，避免缩放时吃到相邻帧
    ctx.drawImage(img, (f % 5) * sw + 1, Math.floor(f / 5) * sh + 1, sw - 2, sh - 2,
      (canvas.width - w) / 2, 0, w, h);
  }

  const CELEBRATION_TIMINGS = Object.freeze({
    walk: 2400,
    poke: 800,
    cheer: 1300,
    mount: 625,
    exit: 1600
  });

  async function spawnCelebration(gid, entry) {
    const run = {cancelled: false, cancel: null};
    const generation = celebrationGeneration;
    activeCelebrations.add(run);
    const isCurrent = () => !run.cancelled
      && generation === celebrationGeneration
      && getCurrentGid() === gid;
    let card = null;
    let wrapper = null;
    let current = null;
    let skipped = false;
    const waits = new Set();
    const finish = () => {
      if (skipped) return;
      skipped = true;
      run.cancelled = true;
      current?.cancel();
      // 表演阶段的等待没有对应的 WAAPI，直接放行让清理立即执行
      for (const done of waits) done();
    };
    run.cancel = finish;

    try {
      const stage = celebrationStage;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      // 成员卡片要完整留在舞台内
      if (!isCurrent() || width < 380 || height < 340) return;
      let sheets;
      try {
        sheets = await loadMonsterSheets();
      } catch {
        return;
      }
      if (!isCurrent()) return;
      const name = entry.name || "未知成员";

      // 成员卡片：头像被水泡罩住，泡破后头像亮起并显示欢迎面板
      card = document.createElement("div");
      card.className = "celebration-member";
      const figure = document.createElement("div");
      figure.className = "celebration-member-figure";
      figure.append(messageView.avatar(entry, "celebration-member-avatar"));
      const bubble = document.createElement("span");
      bubble.className = "celebration-bubble";
      bubble.setAttribute("aria-hidden", "true");
      figure.append(bubble);
      card.append(figure);

      wrapper = document.createElement("div");
      wrapper.className = "celebration";
      const actor = document.createElement("button");
      actor.type = "button";
      actor.className = "celebration-actor";
      actor.setAttribute("aria-label", `跳过${name}的回归庆祝`);
      const monster = document.createElement("canvas");
      monster.className = "celebration-monster";
      monster.width = 440;
      monster.height = 440;
      actor.append(monster);
      // 台词是怪兽的话：悬在怪兽头顶，戳破前「你终于冒泡了」，戳破后当场改口
      const speech = document.createElement("span");
      speech.className = "celebration-speech";
      speech.textContent = "你终于冒泡了";
      actor.append(speech);
      wrapper.append(actor);
      stage.append(card, wrapper);

      // 卡片停在中上部，怪兽站到卡片侧面够得着水泡的位置
      const target = {
        x: 170 + Math.random() * Math.max(1, width - 340),
        y: 140 + Math.random() * Math.max(1, height - 300)
      };
      card.style.left = `${target.x}px`;
      card.style.top = `${target.y}px`;
      // 怪兽默认站卡片左侧朝右戳泡；卡片偏左时换到右侧并镜像。偏移按指泡帧
      // 实测反推（指尖约在帧宽 95%、高 40% 处），身体让开水泡、指尖点在泡缘
      const flip = target.x <= width / 2;
      const spot = {
        x: target.x + (flip ? -30 : -198),
        y: target.y - 83
      };
      if (flip) actor.classList.add("flip");
      // 图集怪兽面朝右：不镜像时从左缘进、右缘出，镜像时相反，避免倒着走路。
      // 出场改为雷欧驮着怪兽朝面向一侧高空飞离；终点留足整格余量，
      // 保证骑乘帧的完整人马都飞出舞台后才清理，不会半路凭空消失
      const start = flip ? {x: width + 70, y: spot.y} : {x: -70, y: spot.y};
      const exit = flip ? {x: -260, y: -260} : {x: width + 260, y: -260};

      const wait = ms => new Promise(resolve => {
        if (!isCurrent()) {
          resolve();
          return;
        }
        const done = () => {
          clearTimeout(timer);
          waits.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        waits.add(done);
      });
      actor.addEventListener("click", finish);

      const move = (from, to, duration) => {
        if (!isCurrent()) return Promise.resolve();
        current = wrapper.animate([
          {transform: `translate(${from.x}px, ${from.y}px)`},
          {transform: `translate(${to.x}px, ${to.y}px)`}
        ], {duration, easing: "linear", fill: "both"});
        return current.finished.catch(() => {});
      };
      // 戳破水泡：水珠飞溅，头像亮起，怪兽改口「赶紧的一同拯救世界去」
      const popBubble = () => {
        card.classList.remove("is-poked");
        card.classList.add("is-popped");
        speech.textContent = "赶紧的一同拯救世界去";
        const ring = document.createElement("i");
        ring.className = "celebration-ring";
        figure.append(ring);
        for (let i = 0; i < 8; i++) {
          const drop = document.createElement("i");
          drop.className = "celebration-drop";
          figure.append(drop);
          const angle = i * 0.785 + 0.4;
          const distance = 40 + (i % 3) * 16;
          drop.animate([
            {transform: "translate(0, 0) scale(1)", opacity: 1},
            {transform: `translate(${Math.round(Math.cos(angle) * distance)}px, ${Math.round(Math.sin(angle) * distance - 10)}px) scale(0.3)`, opacity: 0}
          ], {duration: 520 + (i % 3) * 90, easing: "cubic-bezier(0.2, 0.6, 0.3, 1)", fill: "forwards"});
        }
      };

      // 帧时间线与 Promise 链对齐：走 0-2.4 s（8 帧/秒），戳 2.4-3.2 s，欢呼 3.2-4.5 s
      // （图集前 5 帧，末帧定格举臂），4.5-5.125 s 雷欧入画让怪兽原地骑上（5-9 帧），
      // 骑稳后 5.125 s 起循环 10-14 帧飞离
      const walkEnd = CELEBRATION_TIMINGS.walk;
      const pokeEnd = walkEnd + CELEBRATION_TIMINGS.poke;
      const cheerEnd = pokeEnd + CELEBRATION_TIMINGS.cheer;
      const rideEnd = cheerEnd + CELEBRATION_TIMINGS.mount;
      const paintStart = performance.now();
      let lastSheet = null;
      let lastFrame = -1;
      let lastFlip = null;
      const paint = now => {
        if (!isCurrent()) return;
        const elapsed = now - paintStart;
        let sheet;
        let frame;
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
        if (sheet !== lastSheet || frame !== lastFrame || flip !== lastFlip) {
          drawMonsterFrame(monster, sheet, frame, flip);
          lastSheet = sheet;
          lastFrame = frame;
          lastFlip = flip;
        }
        if (isCurrent()) requestAnimationFrame(paint);
      };
      requestAnimationFrame(paint);

      wrapper.style.transform = `translate(${start.x}px, ${start.y}px)`;
      await move(start, spot, CELEBRATION_TIMINGS.walk);
      if (!isCurrent()) return;
      // 俯身轻戳两下水泡，泡泡跟着晃
      card.classList.add("is-poked");
      actor.classList.add("is-poking");
      await wait(CELEBRATION_TIMINGS.poke);
      if (!isCurrent()) return;
      actor.classList.remove("is-poking");
      popBubble();
      // 雷欧入画让怪兽原地骑上（欢呼 1.3 s + 上鞍 0.625 s），骑稳后再一同飞离
      await wait(CELEBRATION_TIMINGS.cheer + CELEBRATION_TIMINGS.mount);
      if (!isCurrent()) return;
      // 雷欧驮走怪兽，成员保持队形同步飞离：与怪兽同时起飞、同速同向，
      // 卡片终点 = 怪兽终点 + 起飞时卡片相对怪兽画布的偏移，全程队形不变
      const off = {x: target.x - spot.x, y: target.y - spot.y};
      const dx = exit.x + off.x - target.x;
      const dy = exit.y + off.y - target.y;
      card.animate([
        {transform: "translate(-50%, -50%)"},
        {transform: `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px)) rotate(${flip ? -5 : 5}deg)`}
      ], {duration: CELEBRATION_TIMINGS.exit, easing: "linear", fill: "forwards"});
      await move(spot, exit, CELEBRATION_TIMINGS.exit);
    } finally {
      finish();
      activeCelebrations.delete(run);
      wrapper?.remove();
      card?.remove();
    }
  }

  celebrationPopoverClose.addEventListener("click", closeCelebrationPopover);
  celebrationPopoverJoin.addEventListener("click", () => {
    commitCelebrationDraft();
  });
  celebrationPopoverRemove.addEventListener("click", () => {
    if (!celebrationDraft) return;
    setCelebrationMember(celebrationDraft.gid, celebrationDraft.senderId, null);
    celebrationPopoverRemove.hidden = true;
    celebrationPopoverJoin.hidden = false;
  });
  celebrationInterval.addEventListener("change", () => {
    // 已在名单里的成员，改间隔立即生效；新成员点「加入庆祝名单」保存
    if (celebrationDraft
      && celebrationEntry(celebrationDraft.gid, celebrationDraft.senderId)) {
      commitCelebrationDraft();
    }
  });
  // 点在打开弹层的入口（发送者昵称、庆祝 chip）上时不关闭，由入口自己的处理接管
  attachDismiss(celebrationPopover, closeCelebrationPopover,
    {ignoreClosest: ".message-sender, .celebration-chip-name"});

  renderCelebrationRoster();
  return {cancel: cancelCelebrations, seed: seedCelebrationSeen, process: processCelebrationArrivals, render: renderCelebrationRoster, openPopover: openCelebrationPopover};
}
