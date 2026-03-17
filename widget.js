/* ============================================================
   Gamer Chat Overlay — StreamElements Widget JS
   ============================================================ */

'use strict';

// ─── Default field values (overridden by SE on load) ────────
let cfg = {
  fontSize:          14,
  chatWidth:         100,
  alignment:         'left',
  perspectiveX:      0,
  perspectiveY:      0,
  theme:             'dark',
  accentColor:       '#00c8ff',
  backgroundOpacity: 88,
  showBadges:        true,
  showAvatars:       true,
  maxMessages:       12,
  messageAnimation:  'spring',
  showAlerts:        true,
  alertDuration:     5,
  modColor:          '#00ff88',
  vipColor:          '#a855f7',
  subColor:          '#ffc200',
  // Goal bar
  showGoal:          false,
  goalType:          'followers',
  goalTitle:         'Objectif du stream',
  goalCurrent:       0,
  goalTarget:        100,
  goalOrientation:   'horizontal',
  goalColor:         '#00c8ff',
  goalAutoTrack:     true
};

// Alert queue — ensures one alert shows at a time
const alertQueue = [];
let alertBusy    = false;

// Goal tracking counters (auto-track from events)
let goalAutoCount = 0;

// ─── StreamElements: Widget loaded ─────────────────────────
window.addEventListener('onWidgetLoad', (obj) => {
  const fields = obj.detail.fieldData;
  cfg = { ...cfg, ...fields };
  applyConfig();
  applyGoal();
});

// ─── StreamElements: Event received ────────────────────────
window.addEventListener('onEventReceived', (obj) => {
  const listener = obj.detail.listener;
  const event    = obj.detail.event;

  if (listener === 'message') {
    addMessage(event.data);
    return;
  }

  if (cfg.showAlerts) {
    enqueueAlert(listener, event);
  }

  // Auto-track goal progress from events
  if (cfg.showGoal && cfg.goalAutoTrack) {
    trackGoalEvent(listener, event);
  }
});

// ─── Apply all configuration ────────────────────────────────
function applyConfig() {
  const root      = document.documentElement;
  const container = document.getElementById('chat-container');
  const messages  = document.getElementById('chat-messages');

  // CSS vars
  root.style.setProperty('--font-size',         cfg.fontSize + 'px');
  root.style.setProperty('--bg-opacity',        (cfg.backgroundOpacity / 100).toFixed(2));
  root.style.setProperty('--accent-color',      cfg.accentColor);
  root.style.setProperty('--mod-color',         cfg.modColor);
  root.style.setProperty('--vip-color',         cfg.vipColor);
  root.style.setProperty('--sub-color',         cfg.subColor);

  // Width
  container.style.width = cfg.chatWidth + '%';

  // Alignment
  const alignMap = { left: 'flex-start', right: 'flex-end', center: 'center' };
  messages.style.alignItems = alignMap[cfg.alignment] || 'flex-start';

  // Theme
  root.setAttribute('data-theme', cfg.theme);

  // Animation
  root.setAttribute('data-animation', cfg.messageAnimation);

  // 3D perspective
  const px = parseFloat(cfg.perspectiveX) || 0;
  const py = parseFloat(cfg.perspectiveY) || 0;
  container.style.transform = (px || py)
    ? `rotateX(${px}deg) rotateY(${py}deg)`
    : '';
}

// ─── Apply goal bar configuration ───────────────────────────
function applyGoal() {
  const bar = document.getElementById('goal-bar');
  if (!bar) return;

  if (!cfg.showGoal) {
    bar.classList.remove('goal-visible');
    return;
  }

  // Set orientation class
  bar.className = `goal-bar goal-${cfg.goalOrientation}`;
  bar.classList.add('goal-visible');

  // Apply goal accent color
  document.documentElement.style.setProperty('--accent-color', cfg.goalColor || cfg.accentColor);

  // Set title
  const titleEl = document.getElementById('goal-title');
  if (titleEl) titleEl.textContent = cfg.goalTitle || 'Objectif';

  // Reset auto-count to configured current value
  goalAutoCount = parseFloat(cfg.goalCurrent) || 0;

  // Update progress display
  updateGoalProgress(goalAutoCount, cfg.goalTarget);
}

// ─── Update goal progress bar ───────────────────────────────
function updateGoalProgress(current, target) {
  const cur = Math.max(0, parseFloat(current) || 0);
  const tgt = Math.max(1, parseFloat(target) || 100);
  const pct = Math.min(100, (cur / tgt) * 100);

  const curEl  = document.getElementById('goal-current');
  const tgtEl  = document.getElementById('goal-target');
  const pctEl  = document.getElementById('goal-percent');
  const fillEl = document.getElementById('goal-fill');
  const barEl  = document.getElementById('goal-bar');

  if (curEl) curEl.textContent = Math.floor(cur).toLocaleString();
  if (tgtEl) tgtEl.textContent = Math.floor(tgt).toLocaleString();
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';

  if (fillEl && barEl) {
    if (barEl.classList.contains('goal-vertical')) {
      fillEl.style.height = pct + '%';
      fillEl.style.width  = '100%';
    } else {
      fillEl.style.width  = pct + '%';
      fillEl.style.height = '100%';
    }
  }
}

// ─── Auto-track goal from stream events ─────────────────────
function trackGoalEvent(listener, event) {
  const type = cfg.goalType;

  if (type === 'followers' && listener === 'follower-latest') {
    goalAutoCount++;
    updateGoalProgress(goalAutoCount, cfg.goalTarget);
  } else if (type === 'subs' && listener === 'subscriber-latest') {
    const count = event.bulkGifted ? (event.amount || 1) : 1;
    goalAutoCount += count;
    updateGoalProgress(goalAutoCount, cfg.goalTarget);
  } else if (type === 'bits' && listener === 'cheer-latest') {
    goalAutoCount += parseFloat(event.amount) || 0;
    updateGoalProgress(goalAutoCount, cfg.goalTarget);
  } else if (type === 'donations' && listener === 'tip-latest') {
    goalAutoCount += parseFloat(event.amount) || 0;
    updateGoalProgress(goalAutoCount, cfg.goalTarget);
  }
}

// ─── Add a chat message ─────────────────────────────────────
function addMessage(data) {
  if (!data) return;

  const messagesEl = document.getElementById('chat-messages');
  const role       = detectRole(data.badges);
  const color      = data.color || roleColor(role);

  // Special message types
  let extraClass = '';
  if (data.tags && data.tags['msg-id'] === 'highlighted-message') extraClass = 'message-highlighted';
  if (data.tags && data.tags['first-msg'] === '1')                extraClass = 'message-firsttime';
  if (data.tags && data.tags['bits'])                             extraClass = 'message-bits';

  const el = document.createElement('div');
  el.className = [
    'message',
    `message-${role}`,
    `align-${cfg.alignment}`,
    extraClass
  ].filter(Boolean).join(' ');

  el.innerHTML = buildMessageHTML(data, role, color);
  messagesEl.appendChild(el);

  // Trigger entry animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('visible'));
  });

  pruneMessages(messagesEl);
}

// ─── Build message inner HTML ───────────────────────────────
function buildMessageHTML(data, role, color) {
  const avatarHTML = cfg.showAvatars ? buildAvatar(data, role)         : '';
  const badgesHTML = cfg.showBadges  ? buildBadges(data.badges, role)  : '';
  const msgHTML    = buildText(data.text || '', data.emotes || '', data.userId || '');
  const username   = escapeHTML(data.displayName || data.userName || 'Anonyme');

  return `
    ${avatarHTML}
    <div class="message-content">
      <div class="message-header">
        ${badgesHTML}
        <span class="username" style="color:${color}">${username}</span>
      </div>
      <div class="message-bubble bubble-${role}">
        <span class="message-text">${msgHTML}</span>
      </div>
    </div>`;
}

// ─── Build avatar element ───────────────────────────────────
function buildAvatar(data, role) {
  const initials = (data.displayName || data.userName || '??')
    .substring(0, 2).toUpperCase();
  const bg   = roleColor(role);
  const ring = role !== 'regular' ? ` ring-${role}` : '';
  return `<div class="avatar${ring}" style="background:${bg}">${initials}</div>`;
}

// ─── Build role badge pills ─────────────────────────────────
function buildBadges(badges, role) {
  const badgeData = parseBadges(badges);
  if (!badgeData.length) return '';

  const icons = {
    broadcaster: '📡', moderator: '🛡️', vip: '💎',
    subscriber: '⭐', partner: '✓', turbo: '⚡',
    premium: '👑', staff: '⚙️', admin: '🔑'
  };

  return badgeData.map(b => {
    const icon = icons[b.type] || '•';
    const c    = roleBadgeColor(b.type);
    return `<span class="badge badge-${b.type}" style="background:${c}22;border-color:${c}44;color:${c}">${icon}</span>`;
  }).join('');
}

// ─── Parse badges (handles string or array) ─────────────────
function parseBadges(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw).split(',').map(s => {
    const [type] = s.split('/');
    return { type };
  }).filter(b => b.type);
}

// ─── Parse & render message text (emotes + mentions) ────────
function buildText(text, emotesRaw, userId) {
  let safe = escapeHTML(text);

  if (emotesRaw && typeof emotesRaw === 'string' && emotesRaw.length) {
    safe = renderEmotes(text, emotesRaw);
  } else if (emotesRaw && typeof emotesRaw === 'object') {
    safe = renderEmotesObj(text, emotesRaw);
  }

  safe = safe.replace(/@(\w+)/g,
    (_, name) => `<span class="mention">@${name}</span>`);

  return safe;
}

// ─── Render emotes from Twitch string format ────────────────
function renderEmotes(text, emotesStr) {
  const replacements = [];

  emotesStr.split('/').forEach(entry => {
    const [id, positions] = entry.split(':');
    if (!positions) return;
    positions.split(',').forEach(pos => {
      const [start, end] = pos.split('-').map(Number);
      replacements.push({ start, end: end + 1, img: emoteImg(id) });
    });
  });

  replacements.sort((a, b) => b.start - a.start);

  const chars = [...text];
  replacements.forEach(({ start, end, img }) => {
    chars.splice(start, end - start, img);
  });

  return chars.join('');
}

// ─── Render emotes from object format ───────────────────────
function renderEmotesObj(text, emotesObj) {
  const replacements = [];
  for (const [id, positions] of Object.entries(emotesObj)) {
    const posArr = Array.isArray(positions) ? positions : [positions];
    posArr.forEach(pos => {
      const [start, end] = (typeof pos === 'string' ? pos : `${pos.start}-${pos.end}`)
        .split('-').map(Number);
      replacements.push({ start, end: end + 1, img: emoteImg(id) });
    });
  }

  replacements.sort((a, b) => b.start - a.start);
  const chars = [...text];
  replacements.forEach(({ start, end, img }) => {
    chars.splice(start, end - start, img);
  });

  return chars.join('');
}

// ─── Emote <img> tag (Twitch CDN) ───────────────────────────
function emoteImg(id) {
  const url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
  return `<img class="emote-img" src="${url}" alt="" loading="lazy">`;
}

// ─── Role detection from badges ─────────────────────────────
function detectRole(badges) {
  const list     = parseBadges(badges);
  const priority = ['broadcaster', 'moderator', 'vip', 'subscriber', 'partner'];
  for (const p of priority) {
    if (list.some(b => b.type === p)) return p;
  }
  return 'regular';
}

// ─── Role → CSS color ───────────────────────────────────────
function roleColor(role) {
  switch (role) {
    case 'broadcaster': return cfg.broadcasterColor || '#00c8ff';
    case 'moderator':   return cfg.modColor          || '#00ff88';
    case 'vip':         return cfg.vipColor          || '#a855f7';
    case 'subscriber':  return cfg.subColor          || '#ffc200';
    case 'partner':     return '#9146FF';
    default:            return cfg.accentColor       || '#00c8ff';
  }
}

// ─── Role badge border/icon color ───────────────────────────
function roleBadgeColor(type) {
  switch (type) {
    case 'broadcaster': return cfg.broadcasterColor || '#00c8ff';
    case 'moderator':   return cfg.modColor          || '#00ff88';
    case 'vip':         return cfg.vipColor          || '#a855f7';
    case 'subscriber':  return cfg.subColor          || '#ffc200';
    case 'partner':     return '#9146FF';
    case 'turbo':       return '#7B68EE';
    case 'premium':     return '#FFD700';
    case 'staff':       return '#00A8FF';
    case 'admin':       return '#FF4500';
    default:            return cfg.accentColor || '#00c8ff';
  }
}

// ─── Prune old messages ─────────────────────────────────────
function pruneMessages(container) {
  const all = container.querySelectorAll('.message:not(.removing)');
  const max = parseInt(cfg.maxMessages) || 12;
  if (all.length <= max) return;

  const excess = all.length - max;
  for (let i = 0; i < excess; i++) {
    const el = all[i];
    el.classList.add('removing');
    setTimeout(() => el.remove(), 350);
  }
}

// ─── Alert queue management ─────────────────────────────────
function enqueueAlert(listener, event) {
  alertQueue.push({ listener, event });
  if (!alertBusy) drainAlertQueue();
}

function drainAlertQueue() {
  if (!alertQueue.length) { alertBusy = false; return; }
  alertBusy = true;
  const { listener, event } = alertQueue.shift();
  displayAlert(listener, event);
}

// ─── Display a single alert ─────────────────────────────────
function displayAlert(listener, event) {
  const config = buildAlertConfig(listener, event);
  if (!config) { drainAlertQueue(); return; }

  const container = document.getElementById('alert-container');
  const card      = document.createElement('div');
  card.className  = `alert-card alert-${config.type}`;
  card.innerHTML  = `
    <div class="alert-icon">${config.icon}</div>
    <div class="alert-content">
      <div class="alert-title">${escapeHTML(config.title)}</div>
      <div class="alert-message">${escapeHTML(config.message)}</div>
    </div>`;

  container.appendChild(card);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add('visible'));
  });

  const duration = (parseFloat(cfg.alertDuration) || 5) * 1000;

  setTimeout(() => {
    card.classList.add('hiding');
    setTimeout(() => {
      card.remove();
      drainAlertQueue();
    }, 450);
  }, duration);
}

// ─── Build alert display config ─────────────────────────────
function buildAlertConfig(listener, event) {
  const name   = event.name    || event.displayName || event.sender || 'Quelqu\'un';
  const amount = event.amount  || event.count       || '';
  const months = event.months  || '';
  const msg    = event.message ? ` — "${event.message}"` : '';
  const gifter = event.sender  || event.gifterDisplayName || '';

  switch (listener) {

    case 'follower-latest':
      return {
        type:    'follow',
        icon:    '💙',
        title:   'Nouveau Suiveur !',
        message: `${name} suit maintenant la chaîne !`
      };

    case 'subscriber-latest':
      if (event.bulkGifted) {
        return {
          type:    'giftsub',
          icon:    '🎁',
          title:   `${amount} Abonnements Offerts !`,
          message: `${name} offre ${amount} abonnements à la communauté !`
        };
      }
      if (event.gifted) {
        return {
          type:    'giftsub',
          icon:    '🎁',
          title:   'Cadeau Abonnement !',
          message: `${gifter} offre un abonnement à ${name} !`
        };
      }
      return {
        type:    'sub',
        icon:    '⭐',
        title:   months > 1 ? `${months} mois d'abonnement !` : 'Nouvel Abonné !',
        message: months > 1
          ? `${name} est abonné depuis ${months} mois !${msg}`
          : `${name} vient de s'abonner !${msg}`
      };

    case 'cheer-latest':
      return {
        type:    'bits',
        icon:    '💎',
        title:   `${amount} Bits !`,
        message: `${name} envoie ${amount} bits !${msg}`
      };

    case 'tip-latest':
      return {
        type:    'donation',
        icon:    '💰',
        title:   `Don de ${amount}€ !`,
        message: `${name} a fait un don de ${amount}€ !${msg}`
      };

    case 'raid-latest':
      return {
        type:    'raid',
        icon:    '⚔️',
        title:   'RAID INCOMING !',
        message: `${name} arrive avec ${amount} raiders !`
      };

    case 'host-latest':
      return {
        type:    'host',
        icon:    '📡',
        title:   'Host !',
        message: `${name} host la chaîne avec ${amount} viewers !`
      };

    default:
      return null;
  }
}

// ─── Utility: escape HTML to prevent XSS ────────────────────
function escapeHTML(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
