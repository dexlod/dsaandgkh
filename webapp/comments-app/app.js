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
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
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

  if (postId) {
    try {
      await refreshComments(state);
    } catch (error) {
      console.error(error);
      alert('Не удалось загрузить комментарии.');
    }
  } else {
    renderPost(state);
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
    if (!postId) return;

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