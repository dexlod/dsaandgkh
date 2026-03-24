function getStartParam() {
  // 1. MAX WebApp object, если доступен
  const fromWebApp = window.WebApp?.initDataUnsafe?.start_param;
  if (fromWebApp) return fromWebApp;

  // 2. Официальный GET-параметр MAX
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('WebAppStartParam');
  if (fromQuery) return fromQuery;

  // 3. Фолбэк на случай обычного теста в браузере
  const fallback = params.get('startapp');
  if (fallback) return fallback;

  return '';
}

function extractPostId(startParam) {
  if (!startParam) return '';
  if (!startParam.startsWith('post-')) return '';
  return startParam.slice('post-'.length);
}

function init() {
  const startParam = getStartParam();
  const postId = extractPostId(startParam);

  const subtitleEl = document.getElementById('subtitle');
  const postIdEl = document.getElementById('postIdValue');
  const payloadEl = document.getElementById('payloadValue');
  const backBtn = document.getElementById('backBtn');

  payloadEl.textContent = startParam || 'Параметр не найден';
  postIdEl.textContent = postId || 'Не удалось определить postId';
  subtitleEl.textContent = postId
    ? `Обсуждение поста ${postId}`
    : 'Контекст поста не передан';

  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    // Фолбэк, если истории нет
    window.location.href = 'https://max.ru';
  });
}

init();