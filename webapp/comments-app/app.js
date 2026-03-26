function getInitData() {
  return window.WebApp?.initData || window.WebApp?.InitData || '';
}

function getStartParam() {
  const fromWebApp = window.WebApp?.initDataUnsafe?.start_param;
  if (fromWebApp) return fromWebApp;

  const params = new URLSearchParams(window.location.search);

  const fromQuery = params.get('WebAppStartParam');
  if (fromQuery) return fromQuery;

  const fallback = params.get('startapp');
  if (fallback) return fallback;

  return '';
}

function extractPostId(startParam) {
  if (!startParam) return '';
  if (!startParam.startsWith('post-')) return '';
  return startParam.slice('post-'.length);
}

function isExactRootLanding() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
  return (
    !window.location.search &&
    !window.location.hash &&
    (normalizedPath === '/' || normalizedPath === '/index.html')
  );
}

function formatCount(count) {
  const normalized = Math.abs(count) % 100;
  const lastDigit = normalized % 10;

  let word = 'комментариев';

  if (normalized < 11 || normalized > 14) {
    if (lastDigit === 1) {
      word = 'комментарий';
    } else if (lastDigit >= 2 && lastDigit <= 4) {
      word = 'комментария';
    }
  }

  return `${count} ${word}`;
}

function createInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatTime(isoString) {
  const date = new Date(isoString);

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
}

function renderAvatar(comment) {
  if (comment.userPhotoUrl) {
    return `<img src="${escapeHtml(comment.userPhotoUrl)}" alt="${escapeHtml(comment.userName)}" />`;
  }

  return createInitials(comment.userName);
}

function createPlaceholderImage(title, subtitle, colorA, colorB) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colorA}" />
          <stop offset="100%" stop-color="${colorB}" />
        </linearGradient>
      </defs>
      <rect width="900" height="560" rx="36" fill="url(#g)"/>
      <circle cx="730" cy="140" r="92" fill="rgba(255,255,255,0.16)"/>
      <circle cx="180" cy="450" r="110" fill="rgba(255,255,255,0.12)"/>
      <rect x="74" y="96" width="540" height="44" rx="18" fill="rgba(255,255,255,0.14)"/>
      <rect x="74" y="158" width="410" height="26" rx="13" fill="rgba(255,255,255,0.12)"/>
      <text x="74" y="330" fill="white" font-size="54" font-family="Arial" font-weight="700">${title}</text>
      <text x="74" y="388" fill="rgba(255,255,255,0.92)" font-size="24" font-family="Arial">${subtitle}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const HOME_DATA = {
  heroText:
    'Департамент строительства, архитектуры и ЖКХ обеспечивает координацию профильных направлений деятельности, сопровождение инфраструктурных решений и взаимодействие с подведомственными организациями по вопросам строительства, ремонта и коммунального комплекса.',
  heroPoints: [
    'Координация профильной деятельности в сфере строительства, архитектуры и ЖКХ.',
    'Сопровождение инфраструктурных и коммунальных направлений.',
    'Взаимодействие с подведомственными учреждениями по ключевым вопросам деятельности.',
  ],
  enterprises: {
    uksir: {
      label: 'УКСиР',
      name: 'УКСиР',
      image: createPlaceholderImage('УКСиР', 'Управление капитального строительства и ремонта', '#2563eb', '#38bdf8'),
      description:
        'Учреждение обеспечивает сопровождение капитального строительства, капитального ремонта и реализации инфраструктурных проектов. В фокусе — подготовка и сопровождение объектов, взаимодействие с подрядными организациями и контроль исполнения по профильным направлениям.',
      features: [
        'Капитальное строительство',
        'Капитальный ремонт',
        'Сопровождение объектов',
        'Инфраструктурные проекты',
      ],
    },
    zhek3: {
      label: 'ЖЭК-3',
      name: 'МП «ЖЭК-3»',
      image: createPlaceholderImage('ЖЭК-3', 'Эксплуатация и коммунальная инфраструктура', '#0f766e', '#2dd4bf'),
      description:
        'Предприятие участвует в обеспечении устойчивой работы коммунальной инфраструктуры, сопровождает вопросы эксплуатации и профильного взаимодействия с жителями и организациями по закреплённым направлениям деятельности.',
      features: [
        'Коммунальная инфраструктура',
        'Эксплуатация',
        'Обращения жителей',
        'Ресурсоснабжение',
      ],
    },
  },
};

function showHomeScreen() {
  const homeScreen = document.getElementById('homeScreen');
  const postCard = document.getElementById('postCard');
  const commentsList = document.getElementById('commentsList');
  const composer = document.getElementById('composer');
  const countPill = document.getElementById('commentsCountPill');

  if (homeScreen) homeScreen.hidden = false;
  if (postCard) postCard.style.display = 'none';
  if (commentsList) commentsList.style.display = 'none';
  if (composer) composer.style.display = 'none';
  if (countPill) countPill.textContent = 'Официальный бот';
}

function showCommentsMode() {
  const homeScreen = document.getElementById('homeScreen');
  const postCard = document.getElementById('postCard');
  const commentsList = document.getElementById('commentsList');
  const composer = document.getElementById('composer');

  if (homeScreen) homeScreen.hidden = true;
  if (postCard) postCard.style.display = '';
  if (commentsList) commentsList.style.display = '';
  if (composer) composer.style.display = '';
}

function renderHomeHero() {
  const heroText = document.getElementById('heroText');
  const heroPoints = document.getElementById('heroPoints');

  heroText.textContent = HOME_DATA.heroText;
  heroPoints.innerHTML = HOME_DATA.heroPoints
    .map((item) => `<div class="hero-point">${escapeHtml(item)}</div>`)
    .join('');
}

function renderEnterpriseTabs(activeKey) {
  const tabsWrap = document.getElementById('enterpriseTabs');
  const entries = Object.entries(HOME_DATA.enterprises);

  tabsWrap.innerHTML = entries
    .map(([key, item]) => {
      const activeClass = key === activeKey ? 'active' : '';
      return `
        <button class="tab-btn ${activeClass}" data-tab="${key}" type="button">
          ${escapeHtml(item.label)}
        </button>
      `;
    })
    .join('');
}

function renderEnterpriseCard(activeKey) {
  const enterprise = HOME_DATA.enterprises[activeKey];
  const image = document.getElementById('enterpriseImage');
  const name = document.getElementById('enterpriseName');
  const description = document.getElementById('enterpriseDescription');
  const features = document.getElementById('enterpriseFeatures');

  if (!enterprise) return;

  image.src = enterprise.image;
  image.alt = enterprise.name;
  name.textContent = enterprise.name;
  description.textContent = enterprise.description;
  features.innerHTML = enterprise.features
    .map((item) => `<span class="enterprise-chip">${escapeHtml(item)}</span>`)
    .join('');
}

function bindHomeTabs(state) {
  document.getElementById('enterpriseTabs')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const tabKey = target.dataset.tab;
    if (!tabKey || !HOME_DATA.enterprises[tabKey]) return;

    state.activeEnterpriseTab = tabKey;
    renderEnterpriseTabs(state.activeEnterpriseTab);
    renderEnterpriseCard(state.activeEnterpriseTab);
  });
}

function renderHome(state) {
  renderHomeHero();
  renderEnterpriseTabs(state.activeEnterpriseTab);
  renderEnterpriseCard(state.activeEnterpriseTab);
}

function renderPost(state) {
  const postTextEl = document.getElementById('postText');
  const postMediaGridEl = document.getElementById('postMediaGrid');
  const postMediaMetaEl = document.getElementById('postMediaMeta');

  if (!state.post) {
    postTextEl.textContent = 'Публикация не найдена.';
    postMediaGridEl.innerHTML = '';
    postMediaMetaEl.innerHTML = '';
    return;
  }

  postTextEl.textContent = state.post.text || '';

  const imageAttachments = state.post.attachments.filter(
    (item) => item.kind === 'image' && item.imageUrl,
  );

  postMediaGridEl.classList.toggle('single', imageAttachments.length === 1);

  postMediaGridEl.innerHTML = imageAttachments
    .slice(0, 4)
    .map(
      (item) => `
        <div class="post-media-item">
          <img src="${escapeHtml(item.imageUrl)}" alt="photo" loading="lazy" />
        </div>
      `,
    )
    .join('');

  const chips = [];

  if (imageAttachments.length > 4) {
    chips.push(`Ещё фото: ${imageAttachments.length - 4}`);
  }

  postMediaMetaEl.innerHTML = chips
    .map((text) => `<span class="post-media-chip">${escapeHtml(text)}</span>`)
    .join('');
}

function renderComments(state) {
  const listEl = document.getElementById('commentsList');
  const countPillEl = document.getElementById('commentsCountPill');

  const visibleCount = state.comments.filter((item) => !item.isDeleted).length;
  countPillEl.textContent = formatCount(visibleCount);

  if (state.comments.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        Пока комментариев нет. Будьте первым, кто начнёт обсуждение.
      </div>
    `;
    return;
  }

  listEl.innerHTML = state.comments
    .map((comment) => {
      const deleteButton =
        state.viewer?.isAdmin && !comment.isDeleted
          ? `<button class="delete-btn" data-comment-id="${comment.id}" type="button">Удалить</button>`
          : '';

      const normalizedText = String(comment.text || '').replace(/^\s+/u, '');
      const commentText = comment.isDeleted
        ? '<span class="deleted-text">Комментарий удалён модератором.</span>'
        : escapeHtml(normalizedText).replace(/\n/g, '<br>');

      return `
        <div class="comment-item">
          <div class="avatar">${renderAvatar(comment)}</div>
          <div class="comment-bubble">
            <div class="comment-author">${escapeHtml(comment.userName)}</div>
            <div class="comment-text">${commentText}</div>
            <div class="comment-meta">
              <div class="comment-actions">${deleteButton}</div>
              <div class="comment-time">${formatTime(comment.createdAt)}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function apiGetComments(postId, initData) {
  const url = `/api/comments?postId=${encodeURIComponent(postId)}${
    initData ? `&initData=${encodeURIComponent(initData)}` : ''
  }`;

  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`GET /api/comments failed: ${response.status}`);
  }

  return response.json();
}

async function apiCreateComment(postId, text, initData) {
  const response = await fetch('/api/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      postId,
      text,
      initData,
    }),
  });

  if (!response.ok) {
    throw new Error(`POST /api/comments failed: ${response.status}`);
  }

  return response.json();
}

async function apiDeleteComment(commentId, initData) {
  const response = await fetch('/api/comments', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      commentId,
      initData,
    }),
  });

  if (!response.ok) {
    throw new Error(`DELETE /api/comments failed: ${response.status}`);
  }

  return response.json();
}

async function refreshComments(state) {
  const data = await apiGetComments(state.postId, state.initData);
  state.comments = Array.isArray(data.comments) ? data.comments : [];
  state.viewer = data.viewer || null;
  state.post = data.post || null;
  renderPost(state);
  renderComments(state);
}

async function init() {
  const initData = getInitData();
  const startParam = getStartParam();
  const postId = extractPostId(startParam);
  const isHome = isExactRootLanding();

  const inputEl = document.getElementById('commentInput');
  const sendBtn = document.getElementById('sendBtn');

  const state = {
    initData,
    startParam,
    postId,
    comments: [],
    viewer: null,
    post: null,
    sending: false,
    activeEnterpriseTab: 'uksir',
  };

  if (isHome) {
    showHomeScreen();
    renderHome(state);
    bindHomeTabs(state);

    if (window.WebApp?.ready) {
      window.WebApp.ready();
    }

    return;
  }

  showCommentsMode();

  if (!postId) {
    document.getElementById('postText').textContent = 'Публикация не найдена.';
    document.getElementById('commentsList').innerHTML = `
      <div class="empty-state">
        Не удалось определить публикацию для обсуждения.
      </div>
    `;
    document.getElementById('composer').style.display = 'none';

    if (window.WebApp?.ready) {
      window.WebApp.ready();
    }

    return;
  }

  try {
    await refreshComments(state);
  } catch (error) {
    console.error(error);
    alert('Не удалось загрузить комментарии.');
  }

  inputEl.addEventListener('input', () => {
    autoResizeTextarea(inputEl);
  });

  inputEl.addEventListener('focus', () => {
    setTimeout(() => {
      inputEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 250);
  });

  sendBtn.addEventListener('click', async () => {
    const text = inputEl.value.trim();

    if (!postId) {
      alert('Не удалось определить пост для обсуждения.');
      return;
    }

    if (!state.initData) {
      alert('Не удалось подтвердить пользователя MAX.');
      return;
    }

    if (!text || state.sending) {
      return;
    }

    if (text.length > 1000) {
      alert('Комментарий слишком длинный.');
      return;
    }

    state.sending = true;
    sendBtn.disabled = true;

    try {
      await apiCreateComment(postId, text, state.initData);
      inputEl.value = '';
      autoResizeTextarea(inputEl);

      await refreshComments(state);

      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth',
        });
      }, 50);
    } catch (error) {
      console.error(error);
      alert('Не удалось отправить комментарий.');
    } finally {
      state.sending = false;
      sendBtn.disabled = false;
    }
  });

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const commentId = target.dataset.commentId;
    if (!commentId) return;

    if (!state.viewer?.isAdmin) {
      return;
    }

    try {
      await apiDeleteComment(commentId, state.initData);
      await refreshComments(state);
    } catch (error) {
      console.error(error);
      alert('Не удалось удалить комментарий.');
    }
  });

  if (window.WebApp?.ready) {
    window.WebApp.ready();
  }
}

init();