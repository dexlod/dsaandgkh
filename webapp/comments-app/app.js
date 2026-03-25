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
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
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
              <div class="comment-actions"></div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function apiGetComments(postId) {
  const response = await fetch(`/api/comments?postId=${encodeURIComponent(postId)}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`GET /api/comments failed: ${response.status}`);
  }

  return response.json();
}

async function apiCreateComment(postId, text) {
  const response = await fetch('/api/comments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      postId,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`POST /api/comments failed: ${response.status}`);
  }

  return response.json();
}

async function refreshComments(state) {
  const data = await apiGetComments(state.postId);
  state.comments = Array.isArray(data.comments) ? data.comments : [];
  renderComments(state);
}

async function init() {
  const startParam = getStartParam();
  const postId = extractPostId(startParam);

  const subtitleEl = document.getElementById('postIdSubtitle');
  const backBtn = document.getElementById('backBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const inputEl = document.getElementById('commentInput');
  const sendBtn = document.getElementById('sendBtn');

  const state = {
    startParam,
    postId,
    comments: [],
    sending: false,
  };

  subtitleEl.textContent = postId
    ? `Пост: ${postId}`
    : 'Контекст поста не передан';

  if (postId) {
    try {
      await refreshComments(state);
    } catch (error) {
      console.error(error);
      alert('Не удалось загрузить комментарии.');
    }
  } else {
    renderComments(state);
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
      await apiCreateComment(postId, text);
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
    if (!postId) return;

    try {
      await refreshComments(state);
    } catch (error) {
      console.error(error);
      alert('Не удалось обновить комментарии.');
    }
  });

  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = 'https://max.ru';
  });
}

init();