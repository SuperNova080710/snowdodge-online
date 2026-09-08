(() => {
  const arena = document.getElementById("arena");
  const player = document.getElementById("player");
  const stateText = document.getElementById("stateText");
  const timeText = document.getElementById("timeText");
  const lifeText = document.getElementById("lifeText");
  const scoreText = document.getElementById("scoreText");
  const centerMessage = document.getElementById("centerMessage");

  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const effectBtn = document.getElementById("effectBtn");
  const lifeSelect = document.getElementById("lifeSelect");
  const difficultySelect = document.getElementById("difficultySelect");
  const nicknameInput = document.getElementById("nicknameInput");
  const leaderboardList = document.getElementById("leaderboardList");
  const moveButtons = [...document.querySelectorAll(".move-btn")];

  const PLAYER_SPEED = 300;
  const PLAYER_RADIUS = 15;
  const SNOWBALL_RADIUS = 12;
  const DIFFICULTY = {
    easy: 520,
    normal: 430,
    hard: 340,
    hell: 260,
  };
  const SNOWBALL_SPEED = 255;
  // Vercel 배포 시 아래에 백엔드 URL을 넣으세요. 예: "https://your-api.example.com"
  // 비워 두면 로컬(localhost)일 때만 http://localhost:3000 사용
  const PRODUCTION_API_BASE = "https://upseul.mooo.com";
  const API_BASE =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : PRODUCTION_API_BASE;

  let state = "READY";
  let lives = 1;
  let score = 0;
  let survivalTime = 0;
  let playerPos = { x: 0, y: 0 };
  let snowballs = [];
  let lastFrame = 0;
  let spawnAccumulator = 0;
  let animationId = null;
  let effectsEnabled = true;
  let invincibleUntil = 0;
  let elapsed = 0;
  let nickname = "";

  function getSpawnInterval() {
    return DIFFICULTY[difficultySelect.value] ?? DIFFICULTY.normal;
  }
  const pressedDirections = new Set();

  function arenaSize() {
    const rect = arena.getBoundingClientRect();
    return Math.min(rect.width, rect.height);
  }

  function centerPlayer() {
    const size = arenaSize();
    playerPos.x = size / 2;
    playerPos.y = size / 2;
    renderPlayer();
  }

  function renderPlayer() {
    player.style.left = `${playerPos.x}px`;
    player.style.top = `${playerPos.y}px`;
  }

  function normalizeNickname(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function isValidNickname(value) {
    const n = normalizeNickname(value);
    return n.length >= 2 && n.length <= 16;
  }

  function setState(nextState) {
    state = nextState;
    stateText.textContent = nextState;

    const running = nextState === "PLAYING";
    pauseBtn.disabled = !(nextState === "PLAYING" || nextState === "PAUSED");
    lifeSelect.disabled = running || nextState === "PAUSED";
    difficultySelect.disabled = running || nextState === "PAUSED";
    nicknameInput.disabled = running || nextState === "PAUSED";

    if (nextState === "READY") {
      centerMessage.classList.remove("hidden");
      centerMessage.innerHTML = "<strong>READY?</strong><span>사방에서 날아오는 눈덩이를 피하세요. (스페이스바/버튼으로 시작)</span>";
    }

    if (nextState === "FAIL") {
      centerMessage.classList.remove("hidden");
      centerMessage.innerHTML = `<strong>GAME OVER</strong><span>${survivalTime.toFixed(1)}초 동안 버텼습니다 · 피한 눈덩이 ${score}개</span>`;
    }
  }

  function updateHud() {
    timeText.textContent = survivalTime.toFixed(1);
    lifeText.textContent = "♥".repeat(Math.max(0, lives)) || "0";
    scoreText.textContent = String(score);
  }

  function clearSnowballs() {
    for (const ball of snowballs) {
      ball.el.remove();
    }
    snowballs = [];
  }

  function resetGame() {
    cancelAnimationFrame(animationId);
    animationId = null;
    clearSnowballs();

    lives = Number(lifeSelect.value) || 1;
    lives = Math.max(1, Math.min(3, lives));

    score = 0;
    survivalTime = 0;
    spawnAccumulator = 0;
    elapsed = 0;
    lastFrame = 0;
    invincibleUntil = 0;
    pressedDirections.clear();

    centerPlayer();
    updateHud();
    setState("READY");

    startBtn.hidden = false;
    restartBtn.hidden = true;
    pauseBtn.textContent = "PAUSE";
  }

  function startGame() {
    const rawNickname = nicknameInput.value;
    if (!isValidNickname(rawNickname)) {
      centerMessage.classList.remove("hidden");
      centerMessage.innerHTML = "<strong>닉네임 필요</strong><span>2~16자의 닉네임을 입력한 뒤 시작하세요.</span>";
      nicknameInput.focus();
      return;
    }

    nickname = normalizeNickname(rawNickname);
    nicknameInput.value = nickname;

    lives = Number(lifeSelect.value) || 1;
    lives = Math.max(1, Math.min(3, lives));

    score = 0;
    survivalTime = 0;
    spawnAccumulator = 0;
    elapsed = 0;
    invincibleUntil = 0;
    pressedDirections.clear();
    clearSnowballs();
    centerPlayer();
    updateHud();

    setState("PLAYING");
    centerMessage.classList.add("hidden");
    startBtn.hidden = true;
    restartBtn.hidden = true;
    pauseBtn.textContent = "PAUSE";

    arena.focus();
    lastFrame = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  }

  async function saveScore() {
    const payload = {
      nickname,
      score,
      survivalTime: Number(survivalTime.toFixed(2)),
      difficulty: difficultySelect.value,
      livesUsed: Number(lifeSelect.value) || 1,
    };

    try {
      const res = await fetch(`${API_BASE}/api/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn("점수 저장 실패", await res.text());
      }
    } catch (err) {
      console.warn("점수 저장 요청 실패", err);
    }

    loadLeaderboard();
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch(`${API_BASE}/api/scores?limit=10`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      renderLeaderboard(data);
    } catch {
      leaderboardList.innerHTML = '<li class="empty">서버 연결 대기 중…</li>';
    }
  }

  function renderLeaderboard(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      leaderboardList.innerHTML = '<li class="empty">기록이 없습니다.</li>';
      return;
    }

    const difficultyNames = {
      easy: "EASY",
      normal: "NORMAL",
      hard: "HARD",
      hell: "HELL",
    };

    leaderboardList.innerHTML = rows
      .map((row, i) => {
        const difficulty = difficultyNames[row.difficulty] ?? "NORMAL";

        return `
          <li>
            <span class="rank">${i + 1}</span>
            <span class="name">${escapeHtml(row.nickname)}</span>
            <span class="meta">
              ${difficulty} · ${Number(row.survival_time).toFixed(1)}s · ${row.score}개
            </span>
          </li>
        `;
      })
      .join("");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function finishGame(result) {
    if (state !== "PLAYING" && state !== "PAUSED") return;

    cancelAnimationFrame(animationId);
    animationId = null;
    pressedDirections.clear();
    setState(result);
    updateHud();

    restartBtn.hidden = false;
    startBtn.hidden = true;
    pauseBtn.disabled = true;

    if (result === "FAIL") {
      saveScore();
    }
  }

  function pauseGame() {
    if (state === "PLAYING") {
      pressedDirections.clear();
      cancelAnimationFrame(animationId);
      animationId = null;
      setState("PAUSED");
      pauseBtn.textContent = "RESUME";
      centerMessage.classList.remove("hidden");
      centerMessage.innerHTML = "<strong>PAUSED</strong><span>재개하면 현재 상태에서 이어집니다.</span>";
    } else if (state === "PAUSED") {
      setState("PLAYING");
      pauseBtn.textContent = "PAUSE";
      centerMessage.classList.add("hidden");
      lastFrame = performance.now();
      animationId = requestAnimationFrame(gameLoop);
      arena.focus();
    }
  }

  function isInsideCircle(x, y) {
    const size = arenaSize();
    const center = size / 2;
    const dx = x - center;
    const dy = y - center;
    return Math.hypot(dx, dy) <= center - PLAYER_RADIUS - 8;
  }

  function movePlayer(dx, dy) {
    if (state !== "PLAYING") return;

    const nextX = playerPos.x + dx;
    const nextY = playerPos.y + dy;

    if (isInsideCircle(nextX, nextY)) {
      playerPos.x = nextX;
      playerPos.y = nextY;
      renderPlayer();
      return;
    }

    if (isInsideCircle(nextX, playerPos.y)) {
      playerPos.x = nextX;
    }
    if (isInsideCircle(playerPos.x, nextY)) {
      playerPos.y = nextY;
    }
    renderPlayer();
  }

  function updatePlayerMovement(dt) {
    if (state !== "PLAYING" || pressedDirections.size === 0) return;

    let dx = 0;
    let dy = 0;

    if (pressedDirections.has("left")) dx -= 1;
    if (pressedDirections.has("right")) dx += 1;
    if (pressedDirections.has("up")) dy -= 1;
    if (pressedDirections.has("down")) dy += 1;

    if (dx !== 0 && dy !== 0) {
      const diagonal = Math.SQRT1_2;
      dx *= diagonal;
      dy *= diagonal;
    }

    movePlayer(dx * PLAYER_SPEED * dt, dy * PLAYER_SPEED * dt);
  }

  function spawnSnowball() {
    const size = arenaSize();
    const center = size / 2;
    const radius = center + 20;
    const angle = Math.random() * Math.PI * 2;

    const startX = center + Math.cos(angle) * radius;
    const startY = center + Math.sin(angle) * radius;

    const targetAngle = Math.atan2(
      playerPos.y - startY + (Math.random() - 0.5) * 90,
      playerPos.x - startX + (Math.random() - 0.5) * 90
    );

    const el = document.createElement("div");
    el.className = "snowball";
    arena.appendChild(el);

    snowballs.push({
      x: startX,
      y: startY,
      vx: Math.cos(targetAngle) * SNOWBALL_SPEED * (0.92 + Math.random() * 0.2),
      vy: Math.sin(targetAngle) * SNOWBALL_SPEED * (0.92 + Math.random() * 0.2),
      el,
      counted: false,
    });
  }

  function hitPlayer(now) {
    if (now < invincibleUntil) return;

    lives -= 1;
    invincibleUntil = now + 520;
    updateHud();

    if (effectsEnabled) {
      player.classList.add("hit");
      setTimeout(() => player.classList.remove("hit"), 150);
    }

    if (lives <= 0) {
      finishGame("FAIL");
    }
  }

  function updateSnowballs(dt, now) {
    const size = arenaSize();

    for (let i = snowballs.length - 1; i >= 0; i -= 1) {
      const ball = snowballs[i];
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      ball.el.style.left = `${ball.x}px`;
      ball.el.style.top = `${ball.y}px`;

      const distance = Math.hypot(ball.x - playerPos.x, ball.y - playerPos.y);

      if (distance < PLAYER_RADIUS + SNOWBALL_RADIUS) {
        ball.el.remove();
        snowballs.splice(i, 1);
        hitPlayer(now);

        if (state !== "PLAYING") return;
        continue;
      }

      const outside =
        ball.x < -50 ||
        ball.y < -50 ||
        ball.x > size + 50 ||
        ball.y > size + 50;

      if (outside) {
        if (!ball.counted) {
          score += 1;
          scoreText.textContent = String(score);
        }
        ball.el.remove();
        snowballs.splice(i, 1);
      }
    }
  }

  function gameLoop(now) {
    if (state !== "PLAYING") return;

    const rawDt = (now - lastFrame) / 1000;
    const dt = Math.min(rawDt, 0.05);
    lastFrame = now;

    survivalTime += dt;
    elapsed += dt;
    spawnAccumulator += dt * 1000;

    updatePlayerMovement(dt);

    const baseSpawnInterval = getSpawnInterval();
    const minimumSpawnInterval =
      difficultySelect.value === "easy"
        ? 400
        : difficultySelect.value === "hard"
          ? 250
          : difficultySelect.value === "hell"
            ? 180
            : 320;
    const currentSpawnInterval = Math.max(
      minimumSpawnInterval,
      baseSpawnInterval - elapsed * 3.2
    );

    while (spawnAccumulator >= currentSpawnInterval) {
      spawnAccumulator -= currentSpawnInterval;
      spawnSnowball();

      const doubleSpawnChance = Math.min(0.35, 0.14 + elapsed * 0.007);
      if (Math.random() < doubleSpawnChance) {
        spawnSnowball();
      }
    }

    updateSnowballs(dt, now);
    updateHud();

    if (state === "PLAYING") {
      animationId = requestAnimationFrame(gameLoop);
    }
  }

  function directionFromKey(key) {
    const keyMap = {
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
    };
    return keyMap[key.toLowerCase()] || null;
  }

  function handleKeydown(event) {
    const direction = directionFromKey(event.key);

    if (direction) {
      event.preventDefault();
      if (state === "PLAYING") {
        pressedDirections.add(direction);
      }
      return;
    }

    if (event.key.toLowerCase() === "p" && (state === "PLAYING" || state === "PAUSED")) {
      event.preventDefault();
      pauseGame();
      return;
    }

    // 스페이스바 처리
    if (event.key === " " || event.key === "Spacebar") {
      // 닉네임 입력 창에 포커스가 맞춰져 있을 때는 스페이스바 시작을 하지 않음
      if (document.activeElement === nicknameInput) return;

      event.preventDefault();
      if (state === "READY") {
        startGame();
      } else if (state === "FAIL") {
        resetGame();
        startGame();
      }
    }
  }

  function handleKeyup(event) {
    const direction = directionFromKey(event.key);
    if (!direction) return;

    event.preventDefault();
    pressedDirections.delete(direction);
  }

  startBtn.addEventListener("click", startGame);

  restartBtn.addEventListener("click", () => {
    resetGame();
    startGame();
  });

  pauseBtn.addEventListener("click", pauseGame);

  effectBtn.addEventListener("click", () => {
    effectsEnabled = !effectsEnabled;
    effectBtn.textContent = effectsEnabled ? "EFFECT ON" : "EFFECT OFF";
    effectBtn.setAttribute("aria-pressed", String(!effectsEnabled));
  });

  lifeSelect.addEventListener("change", () => {
    lives = Math.max(1, Math.min(3, Number(lifeSelect.value) || 1));
    updateHud();
  });

  nicknameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && state === "READY") {
      event.preventDefault();
      startGame();
    }
  });

  moveButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const step = 28;
      const dir = button.dataset.dir;
      if (dir === "up") movePlayer(0, -step);
      if (dir === "down") movePlayer(0, step);
      if (dir === "left") movePlayer(-step, 0);
      if (dir === "right") movePlayer(step, 0);
    });
  });

  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("keyup", handleKeyup);

  window.addEventListener("blur", () => {
    pressedDirections.clear();
    if (state === "PLAYING") {
      pauseGame();
    }
  });

  window.addEventListener("resize", () => {
    const size = arenaSize();
    const center = size / 2;

    if (!isInsideCircle(playerPos.x, playerPos.y)) {
      playerPos.x = center;
      playerPos.y = center;
      renderPlayer();
    }
  });

  effectBtn.textContent = "EFFECT ON";
  resetGame();
  loadLeaderboard();
})();
