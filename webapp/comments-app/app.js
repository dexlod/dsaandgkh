const LANDING_TABS = {
  uksir: {
    title: 'МКУ УКСиР',
    badge: 'Капитальное строительство и ремонт',
    description:
      'Муниципальное казённое учреждение, обеспечивающее сопровождение объектов строительства, капитального ремонта и благоустройства на территории Ханты-Мансийского района.',
    points: [
      {
        title: 'Чем занимается',
        text: 'Подготовка и сопровождение объектов, работа с проектной и сметной документацией, организация и контроль исполнения муниципальных контрактов.',
      },
      {
        title: 'Основные направления работы',
        text: '- строительство и капитальный ремонт социальных, коммунальных и инфраструктурных объектов;',
        text: '- сопровождение проектной документации и технических решений;',
        text: '- взаимодействие с подрядными организациями;',
        text: '- контроль сроков и этапов выполнения работ;',
        text: '- участие в приёмке выполненных работ.',
      },
    ],
  },
  zhek3: {
    title: 'МП «ЖЭК-3»',
    badge: 'Коммунальная инфраструктура',
    description:
      'Муниципальное предприятие, обеспечивающее работу объектов жилищно-коммунального хозяйства в сельских поселениях Ханты-Мансийского района.',
    points: [
      {
        title: 'Чем занимается',
        text: 'Эксплуатация котельных, сетей тепло- и водоснабжения, водоотведения, подготовка объектов к осенне-зимнему периоду, аварийно-восстановительные работы.',
      },
      {
        title: 'Основные направления работы',
        text: '- обеспечение теплом, водой и коммунальными услугами населённых пунктов;',
        text: '- содержание и эксплуатация коммунальной инфраструктуры;',
        text: '- подготовка к отопительному сезону;',
        text: '- устранение аварийных ситуаций;',
        text: '- участие в капитальном ремонте и модернизации объектов ЖКХ.',
      },
    ],
  },
};

function getInitData() {
  return window.WebApp?.initData || window.WebApp?.InitData || '';
}

function safeDecode(value) {
  let result = String(value || '').trim();

  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(result);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }

  return result;
}

function collectStartParamsFromParams(params) {
  return [
    params.get('WebAppStartParam'),
    params.get('webAppStartParam'),
    params.get('startapp'),
    params.get('startApp'),
    params.get('start_param'),
    params.get('startParam'),
    params.get('postId'),
    params.get('post_id'),
  ].filter((value) => typeof value === 'string' && value.trim());
}

function addStartParamCandidate(bucket, rawValue) {
  const value = safeDecode(rawValue);
  if (!value || bucket.has(value)) {
    return;
  }

  bucket.add(value);

  const normalized = value.replace(/^[?#]/, '').trim();
  if (normalized && !bucket.has(normalized)) {
    bucket.add(normalized);
  }

  if (normalized.includes('=')) {
    const nestedParams = new URLSearchParams(normalized);
    collectStartParamsFromParams(nestedParams).forEach((item) => {
      addStartParamCandidate(bucket, item);
    });
  }

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const nestedUrl = new URL(normalized);

      collectStartParamsFromParams(nestedUrl.searchParams).forEach((item) => {
        addStartParamCandidate(bucket, item);
      });

      const hashParams = new URLSearchParams(nestedUrl.hash.replace(/^#/, ''));
      collectStartParamsFromParams(hashParams).forEach((item) => {
        addStartParamCandidate(bucket, item);
      });
    } catch {
      // ignore invalid nested URL
    }
  }
}

function extractPostId(startParam) {
  const normalized = safeDecode(startParam).trim();
  if (!normalized) return '';

  const postIdMatch = normalized.match(/\bPST-\d{8}-\d{5}\b/i);
  const looksLikePostContext =
    normalized.startsWith('post-') ||
    /^PST-\d{8}-\d{5}$/i.test(normalized) ||
    /(?:^|[?&#])(postId|post_id)=/i.test(normalized);

  if (!looksLikePostContext || !postIdMatch) {
    return '';
  }

  return postIdMatch[0].toUpperCase();
}

function getLaunchContext() {
  const bucket = new Set();

  addStartParamCandidate(bucket, window.WebApp?.initDataUnsafe?.start_param);

  const searchParams = new URLSearchParams(window.location.search);
  collectStartParamsFromParams(searchParams).forEach((item) => {
    addStartParamCandidate(bucket, item);
  });

  const hashRaw = window.location.hash.replace(/^#/, '');
  if (hashRaw) {
    addStartParamCandidate(bucket, hashRaw);

    const hashParams = new URLSearchParams(hashRaw);
    collectStartParamsFromParams(hashParams).forEach((item) => {
      addStartParamCandidate(bucket, item);
    });
  }

  const candidates = [...bucket]
    .map((item) => safeDecode(item).trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const postId = extractPostId(candidate);
    if (postId) {
      return {
        startParam: candidate,
        postId,
        candidates,
      };
    }
  }

  return {
    startParam: candidates[0] || '',
    postId: '',
    candidates,
  };
}

function getStartParam() {
  return getLaunchContext().startParam;
}

function extractPostId(startParam) {
  if (!startParam) return '';
  if (!startParam.startsWith('post-')) return '';
  return startParam.slice('post-'.length);
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

function renderLanding(tabKey) {
  const config = LANDING_TABS[tabKey] || LANDING_TABS.uksir;
  const cardTitleEl = document.getElementById('landingCardTitle');
  const cardBadgeEl = document.getElementById('landingCardBadge');
  const cardDescriptionEl = document.getElementById('landingCardDescription');
  const pointsEl = document.getElementById('landingPoints');
  const tabEls = document.querySelectorAll('.landing-tab');

  cardTitleEl.textContent = config.title;
  cardBadgeEl.textContent = config.badge;
  cardDescriptionEl.textContent = config.description;

  pointsEl.innerHTML = config.points
    .map(
      (point) => `
        <div class="landing-point">
          <h3 class="landing-point-title">${escapeHtml(point.title)}</h3>
          <p class="landing-point-text">${escapeHtml(point.text)}</p>
        </div>
      `,
    )
    .join('');

  tabEls.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tabKey);
  });
}

function renderAvatar(comment) {
  if (comment.userPhotoUrl) {
    return `<img src="${escapeHtml(comment.userPhotoUrl)}" alt="${escapeHtml(comment.userName)}" />`;
  }

  return createInitials(comment.userName);
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

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { error: text } : {};
}

async function apiGetComments(postId, initData) {
  const headers = {};

  if (initData) {
    headers['x-max-init-data'] = initData;
  }

  const response = await fetch(
    url: `https://max.ru/${env.BOT_USERNAME}?startapp=${encodeURIComponent(post.discussionPayload)}`,
    {
      method: 'GET',
      headers,
    },
  );

  const payload = await readApiResponse(response);

  if (!response.ok) {
    throw new Error(
      payload?.details ||
        payload?.error ||
        `GET /api/comments failed: ${response.status}`,
    );
  }

  return payload;
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

function showLandingMode() {
  document.getElementById('landingView').classList.remove('hidden');
  document.getElementById('commentsView').classList.add('hidden');
}

function showCommentsMode() {
  document.getElementById('landingView').classList.add('hidden');
  document.getElementById('commentsView').classList.remove('hidden');
}


function setComposerDisabled(disabled) {
  const inputEl = document.getElementById('commentInput');
  const sendBtn = document.getElementById('sendBtn');

  if (inputEl) {
    inputEl.disabled = disabled;
  }

  if (sendBtn) {
    sendBtn.disabled = disabled;
  }
}

function renderCommentsLaunchError(message) {
  showCommentsMode();
  setComposerDisabled(true);

  document.getElementById('postText').textContent = message;
  document.getElementById('postMediaGrid').innerHTML = '';
  document.getElementById('postMediaMeta').innerHTML = '';
  document.getElementById('commentsCountPill').textContent = '0 комментариев';
  document.getElementById('commentsList').innerHTML = `
    <div class="empty-state">
      ${escapeHtml(message)}
    </div>
  `;
}



async function init() {
  const initData = getInitData();
  const launchContext = getLaunchContext();
  const startParam = launchContext.startParam;
  const postId = launchContext.postId;
  const hasExplicitLaunchContext = launchContext.candidates.length > 0;

  if (!postId) {
    if (hasExplicitLaunchContext) {
      console.warn('Unable to resolve postId from launch context', {
        startParam,
        candidates: launchContext.candidates,
        search: window.location.search,
        hash: window.location.hash,
      });

      renderCommentsLaunchError(
        'Не удалось определить публикацию для комментариев. Откройте обсуждение повторно из кнопки под постом.',
      );

      if (window.WebApp?.ready) {
        window.WebApp.ready();
      }

      return;
    }

    showLandingMode();
    renderLanding('uksir');

    document.getElementById('landingTabs').addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const tab = target.dataset.tab;
      if (!tab) return;
      renderLanding(tab);
    });

    if (window.WebApp?.ready) {
      window.WebApp.ready();
    }
    return;
  }

  showCommentsMode();
  setComposerDisabled(false);

  const refreshBtn = document.getElementById('refreshBtn');
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
  };

    try {
      await refreshComments(state);
    } catch (error) {
      console.error(error);

      renderCommentsLaunchError(
        'Не удалось загрузить комментарии. Если публикация только что вышла, откройте обсуждение повторно через несколько секунд.',
      );

      if (window.WebApp?.ready) {
        window.WebApp.ready();
      }

      return;
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

  refreshBtn.addEventListener('click', async () => {
    try {
      await refreshComments(state);
    } catch (error) {
      console.error(error);
      alert('Не удалось обновить комментарии.');
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