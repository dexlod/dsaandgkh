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

function getStorageKey(postId) {
  return `comments:${postId}`;
}

function loadComments(postId) {
  if (!postId) return [];

  const raw = localStorage.getItem(getStorageKey(postId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveComments(postId, comments) {
  localStorage.setItem(getStorageKey(postId), JSON.stringify(comments));
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

function isAdminMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('admin') === '1';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createMockUserName() {
  return 'Пользователь';
}

function createComment(text) {
  return {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userName: createMockUserName(),
    text,
    isDeleted: false,
    createdAt: new Date().toISOString(),
  };
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
}

function renderComments(state) {
  const listEl = document.getElementById('commentsList');
  const countPillEl = document.getElementById('commentsCountPill');

  countPillEl.textContent = formatCount(state.comments.length);

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
        state.adminMode && !comment.isDeleted
          ? `<button class="delete-btn" data-comment-id="${comment.id}" type="button">Удалить</button>`
          : '';

      return `
        <div class="comment-item">
          <div class="avatar">${createInitials(comment.userName)}</div>

          <div class="comment-bubble">
            <div class="comment-author">${escapeHtml(comment.userName)}</div>

            <div class="comment-text">
              ${
                comment.isDeleted
                  ? '<span class="deleted-text">Комментарий удалён модератором.</span>'
                  : escapeHtml(comment.text).replace(/\n/g, '<br>')
              }
            </div>

            <div class="comment-meta">
              <div class="comment-time">${formatTime(comment.createdAt)}</div>
              <div class="comment-actions">${deleteButton}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function init() {
  const startParam = getStartParam();
  const postId = extractPostId(startParam);
  const adminMode = isAdminMode();

  const subtitleEl = document.getElementById('postIdSubtitle');
  const backBtn = document.getElementById('backBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const inputEl = document.getElementById('commentInput');
  const sendBtn = document.getElementById('sendBtn');

  const state = {
    startParam,
    postId,
    adminMode,
    comments: loadComments(postId),
  };

  subtitleEl.textContent = postId
    ? `Пост: ${postId}`
    : 'Контекст поста не передан';

  renderComments(state);

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

  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();

    if (!postId) {
      alert('Не удалось определить пост для обсуждения.');
      return;
    }

    if (!text) {
      return;
    }

    if (text.length > 1000) {
      alert('Комментарий слишком длинный.');
      return;
    }

    const comment = createComment(text);
    state.comments.push(comment);
    saveComments(postId, state.comments);
    renderComments(state);

    inputEl.value = '';
    autoResizeTextarea(inputEl);

    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth',
      });
    }, 50);
  });

  refreshBtn.addEventListener('click', () => {
    state.comments = loadComments(postId);
    renderComments(state);
  });

  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = 'https://max.ru';
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const commentId = target.dataset.commentId;
    if (!commentId) return;

    const comment = state.comments.find((item) => item.id === commentId);
    if (!comment) return;

    comment.isDeleted = true;
    saveComments(postId, state.comments);
    renderComments(state);
  });
}

init();