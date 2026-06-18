/* ============================================================
   TypeMaster — static/app.js
   ============================================================ */

/* ── State ── */
let state = {
  text:'', typed:[], started:false, finished:false,
  startTime:null, errors:0, timerInterval:null,
  currentToken:null, currentUser:null, prevMaxSpeed:0,
  cursorPos: 0, // позиция курсора в тексте¶
};

/* ── LED state ── */
const leds = { caps:false, num:true, scroll:false };

const API_BASE = "https://utertype.onrender.com"

/* ── Sound ── */
let audioCtx = null;
let soundOn  = true;
let volume   = 0.6;
let pressedKeys = new Set();

function getAudioCtx(){
  if(!audioCtx) audioCtx = new(window.AudioContext||window.webkitAudioContext)();
  return audioCtx;
}

function playKeySound(){
  if(!soundOn) return;
  try{
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 800;
    const oscGain = ctx.createGain();
    oscGain.gain.value = volume * 0.15;
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.01);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    
  }catch(e){}
}

/* ── DOM refs ── */
const textDisplay  = document.getElementById('textDisplay');
const liveSpeed    = document.getElementById('liveSpeed');
const liveAccuracy = document.getElementById('liveAccuracy');
const liveErrors   = document.getElementById('liveErrors');
const liveTime     = document.getElementById('liveTime');
const typingStatus = document.getElementById('typingStatus');
const recordBadge  = document.getElementById('recordBadge');
const modalOverlay = document.getElementById('modalOverlay');
const authModal    = document.getElementById('authModal');
const statsModal   = document.getElementById('statsModal');
const authArea     = document.getElementById('authArea');
const userArea     = document.getElementById('userArea');
const ledCapsEl    = document.getElementById('ledCaps');
const ledNumEl     = document.getElementById('ledNum');
const ledScrollEl  = document.getElementById('ledScroll');

/* ── Flag: modal is open — blocks typing ── */
let modalOpen = false;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  if(leds.num) ledNumEl.classList.add('on');

  checkTokenInUrl();
  loadUserFromStorage();
  startNewTest();

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup',   handleKeyUp);

  textDisplay.addEventListener('click', () => { if(!modalOpen) textDisplay.focus(); });
  document.getElementById('btnRestart').addEventListener('click', startNewTest);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('statsClose').addEventListener('click', closeModal);
  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnLogin').addEventListener('click',    () => openAuthModal('login'));
  document.getElementById('btnRegister').addEventListener('click', () => openAuthModal('register'));
  document.getElementById('btnStats').addEventListener('click', openStatsModal);
  document.getElementById('doLogin').addEventListener('click', doLogin);
  document.getElementById('doRegister').addEventListener('click', doRegister);
  modalOverlay.addEventListener('click', e => { if(e.target===modalOverlay) closeModal(); });

  /* Sound toggle */
  const soundBtn  = document.getElementById('soundToggle');
  const volSlider = document.getElementById('volumeSlider');
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.classList.toggle('muted', !soundOn);
  });
  volSlider.addEventListener('input', e => {
    volume = e.target.value / 100;
    if(volume>0 && !soundOn){ soundOn=true; soundBtn.textContent='🔊'; soundBtn.classList.remove('muted'); }
  });
});

async function fetchRandomText() {
  try {
    const response = await fetch(API_BASE + '/text/random');
    if (response.ok) {
      const data = await response.json();
      return data.text;
    }
  } catch (e) {
    console.warn('Failed to fetch text from API:', e);
  }
  return "ошибка";
}

/* ══════════════════════════════════════════════════════════
   KEYDOWN — single handler, no duplicates
   ══════════════════════════════════════════════════════════ */
function handleKeyDown(e) {
  if(!pressedKeys.has(e.code) & !modalOpen) playKeySound();;
  pressedKeys.add(e.code);
  
  /* Lock LEDs */
  if(e.key==='CapsLock')  { leds.caps=!leds.caps;    ledCapsEl.classList.toggle('on',leds.caps); }
  if(e.key==='NumLock')   { leds.num=!leds.num;      ledNumEl.classList.toggle('on',leds.num);   }
  if(e.key==='ScrollLock'){ leds.scroll=!leds.scroll; ledScrollEl.classList.toggle('on',leds.scroll); }

  /* Modal is open — only handle Escape to close, nothing else */
  if(modalOpen){
    if(e.key==='Escape') closeModal();
    if(e.target.tagName==='INPUT') return;
    return;
  }
  
   if(state.started && !state.finished){
    if(e.key==='ArrowLeft'){
      e.preventDefault();
      if(state.cursorPos > 0){
        state.cursorPos--;
        // Пересчитываем ошибки при перемещении
        recalcErrors();
        renderText(); updateLiveStats();
      }
      return;
    }
    if(e.key==='ArrowRight'){
      e.preventDefault();
      if(state.cursorPos < state.typed.length){
        state.cursorPos++;
        recalcErrors();
        renderText(); updateLiveStats();
      }
      return;
    }
    if(e.key==='ArrowUp'){
      e.preventDefault();
      // Переход на начало слова
      const textBefore = state.text.substring(0, state.cursorPos);
      const lastSpace = textBefore.lastIndexOf(' ');
      state.cursorPos = lastSpace >= 0 ? lastSpace + 1 : 0;
      recalcErrors();
      renderText(); updateLiveStats();
      return;
    }
    if(e.key==='ArrowDown'){
      e.preventDefault();
      // Переход на конец слова
      const textAfter = state.text.substring(state.cursorPos);
      const nextSpace = textAfter.indexOf(' ');
      if(nextSpace >= 0){
        state.cursorPos += nextSpace + 1;
      } else {
        state.cursorPos = state.text.length;
      }
      recalcErrors();
      renderText(); updateLiveStats();
      return;
    }
  }

  /* Tab = restart */
  if(e.key==='Tab'){e.preventDefault(); startNewTest(); setTimeout(() => {return;}, 1);}

  /* Backspace */
  if(e.key==='Backspace'){
    e.preventDefault();
    if(state.typed.length > 0 && state.cursorPos > 0){
      const removed = state.typed.splice(state.cursorPos - 1, 1)[0];
      state.cursorPos--;
      recalcErrors();
      pressKey('Backspace', false);
      renderText(); updateLiveStats();
    }
    pressKey('Backspace', false);
    renderText(); updateLiveStats();
    return;
  }

  if(e.key==='Delete'){
    e.preventDefault();
    if(state.cursorPos < state.typed.length){
      state.typed.splice(state.cursorPos, 1);
      recalcErrors();
      renderText(); updateLiveStats();
    }
    return;
  }

  if(e.key==='Home'){
    e.preventDefault();
    state.cursorPos = 0;
    renderText(); updateLiveStats();
    return;
  }

  /* End — в конец */
  if(e.key==='End'){
    e.preventDefault();
    state.cursorPos = state.typed.length;
    renderText(); updateLiveStats();
    return;
  }

  /* Printable char */
  if(e.key.length===1 && !e.ctrlKey && !e.altKey && !e.metaKey){
    e.preventDefault();
    if(!state.started){
      state.started   = true;
      state.startTime = Date.now();
      typingStatus.textContent = 'Идёт тест...';
      state.timerInterval = setInterval(updateLiveStats, 50);
    }
    const idx = state.cursorPos;
    const correct = (e.key === state.text[idx]);

    // Вставляем символ на позицию курсора
    state.typed.splice(state.cursorPos, 0, {char: e.key, correct: correct});
    state.cursorPos++;

    recalcErrors();
    pressKey(e.code, !correct);
    renderText(); updateLiveStats();

    if(state.typed.length >= state.text.length) finishTest();
    return;
  }
  pressKey(e.code, false);
}

function handleKeyUp(e){ 
  pressedKeys.delete(e.code);
  releaseKey(e.code); 
}

/* Пересчёт ошибок после изменения текста */
function recalcErrors(){
  state.errors = 0;
  for(let i = 0; i < state.typed.length; i++){
    const typed = state.typed[i];
    const expected = state.text[i];
    typed.correct = (typed.char === expected);
    if(!typed.correct) state.errors++;
  }
}

/* ══════════════════════════════════════════════════════════
   TEST
   ══════════════════════════════════════════════════════════ */
function startNewTest(){
  if(state.timerInterval) clearInterval(state.timerInterval);
    typingStatus.textContent = 'Загрузка текста...';
    fetchRandomText().then(text => {
    // Этот код выполнится ТОЛЬКО тогда, когда бэкэнд вернет ответ
    state.text = text;
    console.log("Текст получен через .then:", state.text);
    
    // 3. ОТРИСОВЫВАЕМ ТЕКСТ СТРОГО ТУТ (когда он уже записан в state.text)
    renderText(); 
    updateLiveStats();
    
    typingStatus.textContent = 'Нажмите любую клавишу, чтобы начать';
    textDisplay.focus();
  }).catch(err => {
    typingStatus.textContent = 'Не удалось загрузить текст. Попробуйте еще раз.';
    console.error("Ошибка при старте теста:", err);
  });
  state.typed=[]; state.started=false; state.finished=false;
  state.startTime=null; state.errors=0;
  state.cursorPos = 0;
  recordBadge.style.display='none';
  renderText(); updateLiveStats();
  typingStatus.textContent='Нажмите любую клавишу, чтобы начать';
  textDisplay.focus();
}

function renderText(){
  const words = state.text.split(' ');
  let ci = 0;
  let cursorRendered = false;
  const html = words.map((word, wi) => {
    const charSpans = word.split('').map((ch, i) => {
      const idx     = ci + i;
      let cls = 'char-ghost';
      if(idx < state.typed.length) cls = state.typed[idx].correct ? 'char-correct' : 'char-error';
      const cursor = (idx === state.cursorPos && !cursorRendered) ? ' char-cursor' : '';
      if(cursor) cursorRendered = true;
      return `<span class="${cls}${cursor}">${escapeHtml(ch)}</span>`;
    }).join('');
    ci += word.length;
    let spaceSpan = '';
    if(wi < words.length-1){
      const si  = ci;
      let scls  = 'char-ghost';
      if(si < state.typed.length) scls = state.typed[si].correct ? 'char-correct' : 'char-error';
      const sc = (si === state.cursorPos && !cursorRendered) ? ' char-cursor' : '';
      if(sc) cursorRendered = true;
      spaceSpan = `<span class="${scls}${sc}">&nbsp;</span>`;
      ci++;
    }
    return `<span class="word">${charSpans}</span>${spaceSpan}`;
  }).join('');
  textDisplay.innerHTML = html;
}

function escapeHtml(c){ return c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function updateLiveStats(){
  if(!state.startTime){
    liveSpeed.textContent=liveErrors.textContent=liveTime.textContent='0';
    liveAccuracy.textContent='100'; return;
  }
  const elapsed = (Date.now()-state.startTime)/1000;
  const typed   = state.typed.length;
  const valid   = Math.max(0, typed-state.errors);
  liveSpeed.textContent    = elapsed>0 ? (valid/elapsed).toFixed(2) : '0';
  liveAccuracy.textContent = typed>0 ? Math.max(0,Math.round((valid/typed)*100)) : 100;
  liveErrors.textContent   = state.errors;
  liveTime.textContent     = elapsed.toFixed(2);
}

async function finishTest(){
  if(state.finished) return;
  state.finished = true;
  state.cursorPos = state.text.length;
  if(state.timerInterval) clearInterval(state.timerInterval);
  const elapsed = (Date.now()-state.startTime)/1000;
  const typed   = state.typed.length;
  const valid   = Math.max(0, typed-state.errors);
  const speed   = elapsed>0 ? parseFloat((valid/elapsed).toFixed(2)) : 0;
  typingStatus.textContent = `✓ Готово — ${speed} сим/сек`;
  if(speed > state.prevMaxSpeed) recordBadge.style.display='inline-flex';

  const endpoint = state.currentToken ? '/typing/submit' : '/typing/guest';
  const headers  = {'Content-Type':'application/json'};
  if(state.currentToken) headers['Authorization'] = 'Bearer '+state.currentToken;
  try{
    const res = await fetch(endpoint,{
      method:'POST', headers,
      body:JSON.stringify({text:state.typed.map(t=>t.char).join(''), time:elapsed*1000, errors:state.errors}),
    });
    if(res.ok && state.currentToken){
      const d = await res.json();
      state.prevMaxSpeed = Math.max(state.prevMaxSpeed, d.max_typing_speed||0);
    }
  }catch(e){ console.warn('Submit failed:',e); }
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD VISUAL
   ══════════════════════════════════════════════════════════ */
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
  'NumLock':'NumLock','NumpadDivide':'NumpadDivide','NumpadMultiply':'NumpadMultiply',
  'NumpadSubtract':'NumpadSubtract',
  'Numpad7':'Numpad7','Numpad8':'Numpad8','Numpad9':'Numpad9','NumpadAdd':'NumpadAdd',
  'Numpad4':'Numpad4','Numpad5':'Numpad5','Numpad6':'Numpad6',
  'Numpad1':'Numpad1','Numpad2':'Numpad2','Numpad3':'Numpad3','NumpadEnter':'NumpadEnter',
  'Numpad0':'Numpad0','NumpadDecimal':'NumpadDecimal',
};

function getKeyEl(code){
  const dk = CODE_MAP[code]||code;
  return document.querySelector(`.key[data-key="${CSS.escape(dk)}"]`);
}
function pressKey(code, isError){
  const el = getKeyEl(code); if(!el) return;
  el.classList.remove('pressed','pressed-error');
  void el.offsetWidth;
  el.classList.add(isError?'pressed-error':'pressed');
}
function releaseKey(code){
  const el = getKeyEl(code); if(!el) return;
  el.classList.remove('pressed','pressed-error');
}

/* ══════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════ */
function checkTokenInUrl(){
  const p=new URLSearchParams(window.location.search), t=p.get('token');
  if(t){ localStorage.setItem('tm_token',t); window.history.replaceState({},'','/'); }
}
async function loadUserFromStorage(){
  const token=localStorage.getItem('tm_token'); if(!token) return;
  state.currentToken=token;
  try{
    const res=await fetch(API_BASE + '/auth/me',{headers:{'Authorization':'Bearer '+token}});
    if(res.ok){ const u=await res.json(); setLoggedIn(u,token); state.prevMaxSpeed=u.max_typing_speed||0; }
    else{ localStorage.removeItem('tm_token'); state.currentToken=null; }
  }catch(e){}
}
function setLoggedIn(user,token){
  state.currentUser=user; state.currentToken=token;
  authArea.style.display='none'; userArea.style.display='flex';
  document.getElementById('btnStats').style.display='inline-block';
  document.getElementById('userName').textContent=user.username||'Пользователь';
  document.getElementById('userAvatar').textContent=(user.username||'U')[0].toUpperCase();
}
function logout(){
  localStorage.removeItem('tm_token');
  state.currentToken=null; state.currentUser=null; state.prevMaxSpeed=0;
  authArea.style.display='flex'; userArea.style.display='none';
  document.getElementById('btnStats').style.display='none';
}

function openAuthModal(tab){
  modalOpen=true;
  authModal.style.display='block'; statsModal.style.display='none';
  modalOverlay.classList.add('open'); switchTab(tab);
  setTimeout(()=>{
    const inp = tab==='login'
      ? document.getElementById('loginUsername')
      : document.getElementById('regUsername');
    inp && inp.focus();
  }, 50);
}
function closeModal(){
  modalOpen=false;
  modalOverlay.classList.remove('open');
  textDisplay.focus();
}
function switchTab(tab){
  document.getElementById('formLogin').style.display    = tab==='login'    ?'block':'none';
  document.getElementById('formRegister').style.display = tab==='register' ?'block':'none';
  document.getElementById('tabLogin').classList.toggle('active',    tab==='login');
  document.getElementById('tabRegister').classList.toggle('active', tab==='register');
  document.getElementById('loginError').textContent='';
  document.getElementById('regError').textContent='';
}

async function doLogin(){
  const u   = document.getElementById('loginUsername').value.trim();
  const p   = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  if(!u||!p){ err.textContent='Заполните все поля'; return; }
  err.textContent='Вход...';
  try{
    const res = await fetch(API_BASE + '/auth/token',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:u,password:p}),
    });
    let d;
    try{ d=await res.json(); } catch(e){ err.textContent='Ошибка сервера'; return; }
    if(!res.ok){ err.textContent=d.detail||'Неверный логин или пароль'; return; }
    localStorage.setItem('tm_token',d.access_token);
    state.currentToken=d.access_token;
    const mr=await fetch(API_BASE + '/auth/me',{headers:{'Authorization':'Bearer '+d.access_token}});
    if(mr.ok){ const usr=await mr.json(); setLoggedIn(usr,d.access_token); state.prevMaxSpeed=usr.max_typing_speed||0; }
    closeModal();
  }catch(e){ err.textContent='Ошибка соединения с сервером'; }
}

async function doRegister(){
  const u   = document.getElementById('regUsername').value.trim();
  const em  = document.getElementById('regEmail').value.trim();
  const p   = document.getElementById('regPassword').value;
  const err = document.getElementById('regError');
  if(!u||!p){ err.textContent='Заполните обязательные поля'; return; }
  if(u.length<3||u.length>20){ err.textContent='Имя: 3–20 символов'; return; }
  if(!/^[a-zA-Z0-9_]+$/.test(u)){ err.textContent='Имя: только латиница, цифры, _'; return; }
  if(p.length<4){ err.textContent='Пароль минимум 4 символа'; return; }
  err.textContent='Регистрация...';
  try{
    const body={username:u,password:p}; if(em) body.email=em;
    const res = await fetch(API_BASE + '/auth/register',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    let d;
    try{ d=await res.json(); } catch(e){ err.textContent='Ошибка сервера (не JSON)'; return; }
    if(!res.ok){
      const msg = typeof d.detail==='string' ? d.detail
                : Array.isArray(d.detail) ? d.detail.map(x=>x.msg).join('; ')
                : JSON.stringify(d.detail);
      err.textContent=msg||'Ошибка регистрации'; return;
    }
    // auto-login
    const lr=await fetch(API_BASE + '/auth/token',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:u,password:p}),
    });
    let ld; try{ ld=await lr.json(); } catch(e){ closeModal(); return; }
    if(lr.ok){
      localStorage.setItem('tm_token',ld.access_token);
      state.currentToken=ld.access_token;
      const mr=await fetch(API_BASE + '/auth/me',{headers:{'Authorization':'Bearer '+ld.access_token}});
      if(mr.ok){ const usr=await mr.json(); setLoggedIn(usr,ld.access_token); state.prevMaxSpeed=usr.max_typing_speed||0; }
    }
    closeModal();
  }catch(e){ err.textContent='Ошибка соединения с сервером'; }
}

async function openStatsModal(){
  modalOpen=true;
  authModal.style.display='none'; statsModal.style.display='block';
  modalOverlay.classList.add('open');
  if(!state.currentToken) return;
  try{
    const res=await fetch(API_BASE + '/typing/stats',{headers:{'Authorization':'Bearer '+state.currentToken}});
    if(res.ok){ const d=await res.json();
      document.getElementById('smMaxSpeed').textContent=d.max_typing_speed?.toFixed(2)||'—';
      document.getElementById('smTotal').textContent=d.total_tests||'0';
    }
  }catch(e){}
}