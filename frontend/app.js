/* ============================================================
   TypeMaster — static/app.js
   ============================================================ */

const TEXTS = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.",
  "Programming is the art of telling another human what one wants the computer to do. Code is like humor: when you have to explain it, it is bad.",
  "In the beginning was the word, and the word was typed at sixty characters per second by a developer who had forgotten to eat lunch.",
  "To be or not to be, that is the question. Whether it is nobler in the mind to suffer the slings and arrows of outrageous fortune.",
  "The only way to do great work is to love what you do. If you have not found it yet, keep looking. Do not settle.",
  "Simplicity is the ultimate sophistication. It takes a lot of hard work to make something simple and come up with elegant solutions.",
];

let state = {
  text: '',
  typed: [],      // [{char, correct}, ...]
  started: false,
  finished: false,
  startTime: null,
  errors: 0,
  timerInterval: null,
  currentToken: null,
  currentUser: null,
};

// DOM refs
const textDisplay  = document.getElementById('textDisplay');
const liveSpeed    = document.getElementById('liveSpeed');
const liveAccuracy = document.getElementById('liveAccuracy');
const liveErrors   = document.getElementById('liveErrors');
const liveTime     = document.getElementById('liveTime');
const liveProgress = document.getElementById('liveProgress');
const typingStatus = document.getElementById('typingStatus');
const resultCard   = document.getElementById('resultCard');
const modalOverlay = document.getElementById('modalOverlay');
const authModal    = document.getElementById('authModal');
const statsModal   = document.getElementById('statsModal');
const authArea     = document.getElementById('authArea');
const userArea     = document.getElementById('userArea');

document.addEventListener('DOMContentLoaded', () => {
  checkTokenInUrl();
  loadUserFromStorage();
  startNewTest();
  setupEvents();
});

function setupEvents() {
  document.addEventListener('keydown', onGlobalKeyDown);
  document.addEventListener('keyup',   onGlobalKeyUp);
  textDisplay.addEventListener('click', () => textDisplay.focus());
  document.getElementById('btnRestart').addEventListener('click', startNewTest);
  document.getElementById('btnNewTest').addEventListener('click', startNewTest);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('statsClose').addEventListener('click', closeModal);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnLogin').addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btnRegister').addEventListener('click', () => openAuthModal('register'));
  document.getElementById('btnStats').addEventListener('click', openStatsModal);
  document.getElementById('doLogin').addEventListener('click', doLogin);
  document.getElementById('doRegister').addEventListener('click', doRegister);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
}

// ── Test ──────────────────────────────────────────────────
function startNewTest() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.text      = TEXTS[Math.floor(Math.random() * TEXTS.length)];
  state.typed     = [];
  state.started   = false;
  state.finished  = false;
  state.startTime = null;
  state.errors    = 0;
  resultCard.style.display = 'none';
  renderText();
  updateLiveStats();
  typingStatus.textContent = 'Нажмите любую клавишу, чтобы начать';
  textDisplay.focus();
}

// ── Keydown ───────────────────────────────────────────────
function onGlobalKeyDown(e) {
  // If focus is on a modal input — only highlight key, don't type into test
  if (e.target.tagName === 'INPUT') {
    pressKey(e.code, false);
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    startNewTest();
    return;
  }

  if (state.finished) {
    pressKey(e.code, false);
    return;
  }

  // Backspace
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (state.typed.length > 0) {
      const last = state.typed.pop();
      if (!last.correct) state.errors = Math.max(0, state.errors - 1);
      pressKey('Backspace', false);
      renderText();
      updateLiveStats();
    }
    return;
  }

  // Printable char (length===1) or Space
  const isPrintable = (e.key.length === 1) && !e.ctrlKey && !e.altKey && !e.metaKey;
  if (!isPrintable) {
    pressKey(e.code, false);
    return;
  }

  e.preventDefault();

  if (!state.started) {
    state.started   = true;
    state.startTime = Date.now();
    typingStatus.textContent = 'Идёт тест...';
    state.timerInterval = setInterval(updateLiveStats, 100);
  }

  const idx      = state.typed.length;
  const expected = state.text[idx];
  // KEY FIX: direct character comparison, case-sensitive, exact
  const correct  = (e.key === expected);

  if (!correct) state.errors++;
  state.typed.push({ char: e.key, correct });

  pressKey(e.code, !correct);
  renderText();
  updateLiveStats();

  if (state.typed.length >= state.text.length) finishTest();
}

function onGlobalKeyUp(e) {
  releaseKey(e.code);
}

// ── Render ────────────────────────────────────────────────
function renderText() {
  const html = state.text.split('').map((ch, i) => {
    let cls = 'char-ghost';
    if (i < state.typed.length) {
      cls = state.typed[i].correct ? 'char-correct' : 'char-error';
    }
    const cursor  = (i === state.typed.length) ? ' char-cursor' : '';
    const display = ch === ' ' ? '&nbsp;' : escapeHtml(ch);
    return `<span class="char ${cls}${cursor}">${display}</span>`;
  }).join('');
  textDisplay.innerHTML = html;
}

function escapeHtml(c) {
  return c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateLiveStats() {
  if (!state.startTime) {
    liveSpeed.textContent = liveErrors.textContent = liveTime.textContent = liveProgress.textContent = '0';
    liveAccuracy.textContent = '100';
    return;
  }
  const elapsed  = (Date.now() - state.startTime) / 1000;
  const typed    = state.typed.length;
  const valid    = Math.max(0, typed - state.errors);
  liveSpeed.textContent    = elapsed > 0 ? (valid / elapsed).toFixed(1) : '0';
  liveAccuracy.textContent = typed > 0 ? Math.max(0, Math.round((valid / typed) * 100)) : 100;
  liveErrors.textContent   = state.errors;
  liveTime.textContent     = elapsed.toFixed(1);
  liveProgress.textContent = Math.min(100, Math.round((typed / state.text.length) * 100));
}

async function finishTest() {
  if (state.finished) return;
  state.finished = true;
  if (state.timerInterval) clearInterval(state.timerInterval);

  const elapsed  = (Date.now() - state.startTime) / 1000;
  const typed    = state.typed.length;
  const valid    = Math.max(0, typed - state.errors);
  const speed    = elapsed > 0 ? (valid / elapsed).toFixed(2) : '0';
  const accuracy = typed > 0 ? Math.max(0, Math.round((valid / typed) * 100)) : 100;

  document.getElementById('rSpeed').textContent    = speed + ' сим/с';
  document.getElementById('rAccuracy').textContent = accuracy + '%';
  document.getElementById('rErrors').textContent   = state.errors;
  document.getElementById('rTime').textContent     = elapsed.toFixed(2) + 'с';
  typingStatus.textContent = 'Тест завершён';
  resultCard.style.display = 'block';
  resultCard.scrollIntoView({ behavior:'smooth', block:'nearest' });

  const endpoint = state.currentToken ? '/typing/submit' : '/typing/guest';
  const headers  = { 'Content-Type':'application/json' };
  if (state.currentToken) headers['Authorization'] = 'Bearer ' + state.currentToken;
  try {
    const res = await fetch(endpoint, {
      method:'POST', headers,
      body: JSON.stringify({ text: state.typed.map(t=>t.char).join(''), time: elapsed*1000, errors: state.errors }),
    });
    if (res.ok && state.currentToken) {
      const data = await res.json();
      if (data.max_typing_speed && parseFloat(speed) >= data.max_typing_speed)
        document.getElementById('resultRecord').style.display = 'block';
    }
  } catch(err) { console.warn('API submit failed:', err); }
}

// ── Keyboard visual ───────────────────────────────────────
const CODE_MAP = {
  'Backquote':'`','Digit1':'1','Digit2':'2','Digit3':'3','Digit4':'4',
  'Digit5':'5','Digit6':'6','Digit7':'7','Digit8':'8','Digit9':'9',
  'Digit0':'0','Minus':'-','Equal':'=','Backspace':'Backspace',
  'Tab':'Tab','KeyQ':'q','KeyW':'w','KeyE':'e','KeyR':'r','KeyT':'t',
  'KeyY':'y','KeyU':'u','KeyI':'i','KeyO':'o','KeyP':'p',
  'BracketLeft':'[','BracketRight':']','Backslash':'\\',
  'CapsLock':'CapsLock','KeyA':'a','KeyS':'s','KeyD':'d','KeyF':'f',
  'KeyG':'g','KeyH':'h','KeyJ':'j','KeyK':'k','KeyL':'l',
  'Semicolon':';','Quote':"'",'Enter':'Enter',
  'ShiftLeft':'ShiftLeft','KeyZ':'z','KeyX':'x','KeyC':'c','KeyV':'v',
  'KeyB':'b','KeyN':'n','KeyM':'m','Comma':',','Period':'.','Slash':'/',
  'ShiftRight':'ShiftRight',
  'ControlLeft':'ControlLeft','MetaLeft':'MetaLeft','AltLeft':'AltLeft',
  'Space':' ','AltRight':'AltRight','MetaRight':'MetaRight',
  'ContextMenu':'ContextMenu','ControlRight':'ControlRight',
  'Escape':'Escape',
  'F1':'F1','F2':'F2','F3':'F3','F4':'F4','F5':'F5','F6':'F6',
  'F7':'F7','F8':'F8','F9':'F9','F10':'F10','F11':'F11','F12':'F12',
  'PrintScreen':'PrintScreen','ScrollLock':'ScrollLock','Pause':'Pause',
  'Insert':'Insert','Home':'Home','PageUp':'PageUp',
  'Delete':'Delete','End':'End','PageDown':'PageDown',
  'ArrowUp':'ArrowUp','ArrowLeft':'ArrowLeft','ArrowDown':'ArrowDown','ArrowRight':'ArrowRight',
  'NumLock':'NumLock','NumpadDivide':'/','NumpadMultiply':'*','NumpadSubtract':'NumpadSubtract',
  'Numpad7':'Numpad7','Numpad8':'Numpad8','Numpad9':'Numpad9','NumpadAdd':'NumpadAdd',
  'Numpad4':'Numpad4','Numpad5':'Numpad5','Numpad6':'Numpad6',
  'Numpad1':'Numpad1','Numpad2':'Numpad2','Numpad3':'Numpad3','NumpadEnter':'NumpadEnter',
  'Numpad0':'Numpad0','NumpadDecimal':'NumpadDecimal',
};

function getKeyEl(code) {
  const dataKey = CODE_MAP[code] || code;
  // CSS.escape handles special chars like space, backslash
  return document.querySelector(`.key[data-key="${CSS.escape(dataKey)}"]`);
}

function pressKey(code, isError) {
  const el = getKeyEl(code);
  if (!el) return;
  el.classList.remove('pressed', 'pressed-error');
  void el.offsetWidth; // restart animation
  el.classList.add(isError ? 'pressed-error' : 'pressed');
}

function releaseKey(code) {
  const el = getKeyEl(code);
  if (!el) return;
  el.classList.remove('pressed', 'pressed-error');
}

// ── Auth ──────────────────────────────────────────────────
function checkTokenInUrl() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');
  if (token) { localStorage.setItem('tm_token', token); window.history.replaceState({}, '', '/'); }
}

async function loadUserFromStorage() {
  const token = localStorage.getItem('tm_token');
  if (!token) return;
  state.currentToken = token;
  try {
    const res = await fetch('/auth/me', { headers: {'Authorization':'Bearer '+token} });
    if (res.ok) setLoggedIn(await res.json(), token);
    else localStorage.removeItem('tm_token');
  } catch {}
}

function setLoggedIn(user, token) {
  state.currentUser = user; state.currentToken = token;
  authArea.style.display = 'none';
  userArea.style.display = 'flex';
  document.getElementById('btnStats').style.display = 'inline-block';
  document.getElementById('userName').textContent   = user.username || 'Пользователь';
  document.getElementById('userAvatar').textContent = (user.username||'U')[0].toUpperCase();
}

function logout() {
  localStorage.removeItem('tm_token');
  state.currentToken = null; state.currentUser = null;
  authArea.style.display = 'flex';
  userArea.style.display = 'none';
  document.getElementById('btnStats').style.display = 'none';
}

function openAuthModal(tab) {
  authModal.style.display = 'block'; statsModal.style.display = 'none';
  modalOverlay.classList.add('open'); switchTab(tab);
}
function closeModal() { modalOverlay.classList.remove('open'); }

function switchTab(tab) {
  document.getElementById('formLogin').style.display    = tab==='login'    ? 'block' : 'none';
  document.getElementById('formRegister').style.display = tab==='register' ? 'block' : 'none';
  document.getElementById('tabLogin').classList.toggle('active',    tab==='login');
  document.getElementById('tabRegister').classList.toggle('active', tab==='register');
  document.getElementById('loginError').textContent = '';
  document.getElementById('regError').textContent   = '';
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  if (!username || !password) { errEl.textContent = 'Заполните все поля'; return; }
  try {
    const res  = await fetch('/auth/token', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail||'Ошибка входа'; return; }
    localStorage.setItem('tm_token', data.access_token);
    state.currentToken = data.access_token;
    const mr = await fetch('/auth/me', {headers:{'Authorization':'Bearer '+data.access_token}});
    if (mr.ok) setLoggedIn(await mr.json(), data.access_token);
    closeModal();
  } catch { errEl.textContent = 'Ошибка соединения'; }
}

async function doRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('regError');
  if (!username||!password) { errEl.textContent='Заполните обязательные поля'; return; }
  if (password.length < 4)  { errEl.textContent='Пароль минимум 4 символа'; return; }
  try {
    const body = {username,password}; if (email) body.email=email;
    const res  = await fetch('/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data = await res.json();
    if (!res.ok) { errEl.textContent=data.detail||'Ошибка регистрации'; return; }
    const lr = await fetch('/auth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const ld = await lr.json();
    if (lr.ok) {
      localStorage.setItem('tm_token', ld.access_token);
      state.currentToken = ld.access_token;
      const mr = await fetch('/auth/me',{headers:{'Authorization':'Bearer '+ld.access_token}});
      if (mr.ok) setLoggedIn(await mr.json(), ld.access_token);
    }
    closeModal();
  } catch { errEl.textContent='Ошибка соединения'; }
}

async function openStatsModal() {
  authModal.style.display='none'; statsModal.style.display='block';
  modalOverlay.classList.add('open');
  if (!state.currentToken) return;
  try {
    const res = await fetch('/typing/stats',{headers:{'Authorization':'Bearer '+state.currentToken}});
    if (res.ok) {
      const d = await res.json();
      document.getElementById('smMaxSpeed').textContent = d.max_typing_speed?.toFixed(2)||'—';
      document.getElementById('smTotal').textContent    = d.total_tests||'0';
    }
  } catch {}
}
