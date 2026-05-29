/* ============================================================
   Apple iOS Chat Overlay — StreamElements Widget JS
   ============================================================ */

'use strict';

// ─── Default field values (overridden by SE on load) ────────
let cfg = {
  widgetWidth:       400,
  widgetHeight:      700,
  fontSize:          15,
  chatWidth:         100,
  alignment:         'left',
  perspectiveX:      0,
  perspectiveY:      0,
  theme:             'dark',
  accentColor:       '#007AFF',
  backgroundOpacity: 80,
  showBadges:        true,
  showAvatars:       true,
  maxMessages:       12,
  messageAnimation:  'spring',
  showAlerts:        true,
  alertDuration:     5,
  modColor:          '#34C759',
  vipColor:          '#BF5AF2',
  subColor:          '#FF9F0A'
};

// Alert queue — ensures one alert shows at a time
const alertQueue  = [];
let alertBusy     = false;

// ─── StreamElements: Widget loaded ─────────────────────────
window.addEventListener('onWidgetLoad', (obj) => {
  const fields = obj.detail.fieldData;
  cfg = { ...cfg, ...fields };
  applyConfig();
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
});

// ─── Apply all configuration ────────────────────────────────
function applyConfig() {
  const root      = document.documentElement;
  const wrapper   = document.getElementById('chat-wrapper');
  const container = document.getElementById('chat-container');
  const messages  = document.getElementById('chat-messages');

  // Widget dimensions
  wrapper.style.width  = cfg.widgetWidth  + 'px';
  wrapper.style.height = cfg.widgetHeight + 'px';

  // CSS vars
  root.style.setProperty('--font-size',    cfg.fontSize + 'px');
  root.style.setProperty('--bg-opacity',   (cfg.backgroundOpacity / 100).toFixed(2));
  root.style.setProperty('--accent-color', cfg.accentColor);
  root.style.setProperty('--mod-color',    cfg.modColor);
  root.style.setProperty('--vip-color',    cfg.vipColor);
  root.style.setProperty('--sub-color',    cfg.subColor);

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
  const avatarHTML = cfg.showAvatars  ? buildAvatar(data, role)  : '';
  const badgesHTML = cfg.showBadges   ? buildBadges(data.badges, role) : '';
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
  const bg    = roleColor(role);
  const ring  = role !== 'regular' ? ` ring-${role}` : '';
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
    const icon  = icons[b.type] || '•';
    const c     = roleBadgeColor(b.type);
    return `<span class="badge badge-${b.type}" style="background:${c}22;border-color:${c}44;color:${c}">${icon}</span>`;
  }).join('');
}

// ─── Parse badges (handles string or array) ─────────────────
function parseBadges(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;  // Already an array of {type, version}

  // Twitch string format: "moderator/1,subscriber/12"
  return String(raw).split(',').map(s => {
    const [type] = s.split('/');
    return { type };
  }).filter(b => b.type);
}

// ─── Parse & render message text (emotes + mentions) ────────
function buildText(text, emotesRaw, userId) {
  let safe = escapeHTML(text);

  // Parse inline emotes from Twitch format "id:start-end/..."
  if (emotesRaw && typeof emotesRaw === 'string' && emotesRaw.length) {
    safe = renderEmotes(text, emotesRaw);
  } else if (emotesRaw && typeof emotesRaw === 'object') {
    safe = renderEmotesObj(text, emotesRaw);
  }

  // Highlight @mentions
  safe = safe.replace(/@(\w+)/g,
    (_, name) => `<span class="mention">@${name}</span>`);

  return safe;
}

// ─── Render emotes from Twitch string format ────────────────
function renderEmotes(text, emotesStr) {
  // Build replacement map: [start, end, imgHTML]
  const replacements = [];

  emotesStr.split('/').forEach(entry => {
    const [id, positions] = entry.split(':');
    if (!positions) return;
    positions.split(',').forEach(pos => {
      const [start, end] = pos.split('-').map(Number);
      const img = emoteImg(id);
      replacements.push({ start, end: end + 1, img });
    });
  });

  // Sort by start position descending to replace from end
  replacements.sort((a, b) => b.start - a.start);

  const chars = [...text]; // handle Unicode
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
  const list = parseBadges(badges);
  const priority = ['broadcaster', 'moderator', 'vip', 'subscriber', 'partner'];
  for (const p of priority) {
    if (list.some(b => b.type === p)) return p;
  }
  return 'regular';
}

// ─── Role → CSS color ───────────────────────────────────────
function roleColor(role) {
  switch (role) {
    case 'broadcaster': return cfg.broadcasterColor || '#007AFF';
    case 'moderator':   return cfg.modColor          || '#34C759';
    case 'vip':         return cfg.vipColor          || '#BF5AF2';
    case 'subscriber':  return cfg.subColor          || '#FF9F0A';
    case 'partner':     return '#9146FF';
    default:            return cfg.accentColor       || '#007AFF';
  }
}

// ─── Role badge border/icon color ───────────────────────────
function roleBadgeColor(type) {
  switch (type) {
    case 'broadcaster': return cfg.broadcasterColor || '#007AFF';
    case 'moderator':   return cfg.modColor          || '#34C759';
    case 'vip':         return cfg.vipColor          || '#BF5AF2';
    case 'subscriber':  return cfg.subColor          || '#FF9F0A';
    case 'partner':     return '#9146FF';
    case 'turbo':       return '#7B68EE';
    case 'premium':     return '#FFD700';
    case 'staff':       return '#00A8FF';
    case 'admin':       return '#FF4500';
    default:            return cfg.accentColor || '#007AFF';
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
    setTimeout(() => el.remove(), 400);
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
    }, 500);
  }, duration);
}

// ─── Build alert display config ─────────────────────────────
function buildAlertConfig(listener, event) {
  const name    = event.name    || event.displayName || event.sender || 'Quelqu\'un';
  const amount  = event.amount  || event.count       || '';
  const months  = event.months  || '';
  const msg     = event.message ? ` — "${event.message}"` : '';
  const gifter  = event.sender  || event.gifterDisplayName || '';

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
        title:   months > 1
                   ? `${months} mois d'abonnement !`
                   : 'Nouvel Abonné !',
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
