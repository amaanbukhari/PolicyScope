/* ============================================
   PolicyScope — popup.js
   Full rewrite with all features
   ============================================ */

let globalDetections = [];
let lastView = 'main';
let currentBigCategory = null;

const MAX_CLAUSES_FOR_BAR = 8;

const labelMap = {
  data_collection:         'Data Collection',
  data_sharing:            'Data Sharing',
  tracking_cookies:        'Tracking & Cookies',
  data_retention:          'Data Retention',
  sensitive_data:          'Sensitive Data',
  subscription_billing:    'Subscription & Billing',
  cancellation_refunds:    'Cancellation & Refunds',
  price_changes:           'Price Changes',
  liability_limits:        'Liability Limits',
  arbitration_disputes:    'Dispute Resolution',
  terms_changes:           'Terms Changes',
  account_termination:     'Account Termination',
  third_party_services:    'Third-Party Services',
  user_content_license:    'User Content Rights',
  intellectual_property:   'Copyright & Trademarks',
  marketing_communications:'Marketing Communications',
  age_restrictions:        'Age Restrictions'
};

const bigCategoryMap = {
  'Data Collection':                ['data_collection','tracking_cookies','data_retention','sensitive_data'],
  'Data Sharing':                   ['data_sharing','third_party_services'],
  'Billing & Subscriptions':        ['subscription_billing','cancellation_refunds','price_changes'],
  'Legal & Disputes':               ['liability_limits','arbitration_disputes'],
  'Account & Access':               ['account_termination'],
  'Content & User Rights':          ['user_content_license','intellectual_property'],
  'Policy Changes & Communication': ['terms_changes','marketing_communications'],
  'Age Restrictions':               ['age_restrictions']
};

const DEFAULT_BIG_CATEGORY_COLORS = {
  'Data Collection':                '#4aaa78',  // green
  'Data Sharing':                   '#4ab8aa',  // teal
  'Billing & Subscriptions':        '#c99a40',  // amber
  'Legal & Disputes':               '#e06060',  // red
  'Account & Access':               '#8ec5e8',  // ice blue
  'Content & User Rights':          '#a07fd4',  // soft purple
  'Policy Changes & Communication': '#6a9fd4',  // steel blue
  'Age Restrictions':               '#c97840'   // burnt orange
};

const colorDescriptions = {
  'Data Collection':                'Tracking, retention, sensitive data',
  'Data Sharing':                   'Sharing with third parties',
  'Billing & Subscriptions':        'Billing, refunds, price changes',
  'Legal & Disputes':               'Liability, arbitration',
  'Account & Access':               'Termination, suspension',
  'Content & User Rights':          'Licensing, user content, copyright, trademarks',
  'Policy Changes & Communication': 'Terms changes, marketing',
  'Age Restrictions':               'Age gates, parental requirements'
};

let bigCategoryColors = { ...DEFAULT_BIG_CATEGORY_COLORS };

// ── Helpers ─────────────────────────────────

function truncateText(text, maxLength = 140) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

function formatLabel(type) {
  if (labelMap[type]) return labelMap[type];
  return type.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function groupDetectionsByBigCategory(detections) {
  const grouped = {};
  Object.keys(bigCategoryMap).forEach(cat => { grouped[cat] = []; });
  detections.forEach(d => {
    if (!grouped[d.bigCategory]) grouped[d.bigCategory] = [];
    grouped[d.bigCategory].push(d);
  });
  return grouped;
}

function groupDetectionsByType(detections) {
  const grouped = {};
  detections.forEach(d => {
    if (!grouped[d.type]) grouped[d.type] = [];
    grouped[d.type].push(d);
  });
  return grouped;
}

function getSiteLabel() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]?.url) return resolve('');
      try {
        const url = new URL(tabs[0].url);
        let host = url.hostname.replace(/^www\./, '');
        if (host.length > 20) host = host.slice(0, 18) + '…';
        resolve(host);
      } catch {
        resolve('');
      }
    });
  });
}

// ── Theme ────────────────────────────────────

function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.remove('day');
  } else {
    document.body.classList.add('day');
  }
  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.innerHTML = isDark
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  btn.title = isDark ? 'Switch to Day mode' : 'Switch to Night mode';
}

function loadTheme() {
  chrome.storage.sync.get(['darkMode'], result => {
    const isDark = result.darkMode !== false;
    applyTheme(isDark);
    const toggle = document.getElementById('nightModeToggle');
    if (toggle) toggle.checked = isDark;
  });
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const isDark = !document.body.classList.contains('day');
  const goingDark = !isDark;
  chrome.storage.sync.set({ darkMode: goingDark }, () => {
    applyTheme(goingDark);
    const toggle = document.getElementById('nightModeToggle');
    if (toggle) toggle.checked = goingDark;
  });
});

// ── Views ────────────────────────────────────

const VIEW_IDS = ['mainView','subcategoriesView','detailsView','settingsView'];
const VIEW_DEPTH = { main: 0, subcategories: 1, details: 2, settings: 1 };

let currentViewName = 'main';

function showView(viewName, direction = 'forward') {
  const views = VIEW_IDS.map(id => document.getElementById(id)).filter(Boolean);
  const targetId = viewName + 'View';
  const target = document.getElementById(targetId);
  if (!target) return;

  // Get current visible view
  const current = document.getElementById(currentViewName + 'View');

  // Set initial position of incoming view
  if (direction === 'forward') {
    target.classList.remove('view-hidden-left', 'view-visible');
    target.classList.add('view-hidden-right');
  } else {
    target.classList.remove('view-hidden-right', 'view-visible');
    target.classList.add('view-hidden-left');
  }

  target.style.display = 'flex';

  // Trigger animation frame so initial position is painted first
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Slide out current
      if (current && current !== target) {
        current.classList.remove('view-visible');
        current.classList.add(direction === 'forward' ? 'view-hidden-left' : 'view-hidden-right');
        setTimeout(() => {
          current.style.display = 'none';
          current.classList.remove('view-hidden-left', 'view-hidden-right');
        }, 300);
      }
      // Slide in target
      target.classList.remove('view-hidden-right', 'view-hidden-left');
      target.classList.add('view-visible');
    });
  });

  currentViewName = viewName;
}

// ── Render main ──────────────────────────────

function renderMain(detections) {
  const results   = document.getElementById('results');
  const loading   = document.getElementById('loadingState');
  const empty     = document.getElementById('emptyState');
  const subtitle  = document.getElementById('mainSubtitle');
  if (!results) return;

  loading.style.display = 'none';

  const grouped = groupDetectionsByBigCategory(detections);
  const categories = Object.entries(grouped).filter(([, items]) => items.length > 0);

  if (categories.length === 0) {
    // Empty state
    empty.style.display = 'flex';
    results.style.display = 'none';
    subtitle.textContent = 'Scoped · Nothing Discovered';
    return;
  }

  empty.style.display = 'none';
  results.style.display = 'flex';

  // Total clauses + category count for subtitle
  const totalClauses = detections.length;
  const totalCats = categories.length;
  const cWord = totalClauses === 1 ? 'clause' : 'clauses';
  const catWord = totalCats === 1 ? 'category' : 'categories';
  subtitle.textContent = `${totalClauses} ${cWord} discovered across ${totalCats} ${catWord}`;

  results.innerHTML = '';
  const fills = [];

  categories.forEach(([bigCategory, items]) => {
    const uniqueTypes = new Set(items.map(i => i.type));
    const subCount = uniqueTypes.size;
    const clauseCount = items.length;
    const subWord = subCount === 1 ? 'subcategory' : 'subcategories';
    const clWord = clauseCount === 1 ? 'clause' : 'clauses';
    const fillPct = Math.min(clauseCount / MAX_CLAUSES_FOR_BAR, 1) * 100;
    const color = bigCategoryColors[bigCategory] || '#8ec5e8';

    const div = document.createElement('div');
    div.className = 'card';
    div.style.borderLeft = `3px solid ${color}`;

    const fillId = `fill_${bigCategory.replace(/\W/g, '_')}`;

    div.innerHTML = `
      <div class="cardBody">
        <span class="type">${bigCategory}</span>
        <div class="cardMeta">${subCount} ${subWord} · ${clauseCount} ${clWord} discovered</div>
        <div class="progTrack"><div class="progFill" id="${fillId}" style="background:${color};"></div></div>
      </div>
      <button class="detailsBtn">View</button>
    `;

    div.querySelector('.detailsBtn').addEventListener('click', () => {
      currentBigCategory = bigCategory;
      showSubcategories(bigCategory, items);
    });

    results.appendChild(div);
    fills.push({ id: fillId, pct: fillPct });
  });

  // Staggered bar animation
  requestAnimationFrame(() => {
    fills.forEach(({ id, pct }, i) => {
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.style.width = pct + '%';
      }, 150 + i * 100);
    });
  });
}

// ── Subcategories ─────────────────────────────

function showSubcategories(bigCategory, items) {
  const title     = document.getElementById('subcategoryTitle');
  const container = document.getElementById('subcategoryContent');
  if (!title || !container) return;

  title.textContent = bigCategory.toUpperCase();
  container.innerHTML = '';

  const groupedByType = groupDetectionsByType(items);
  const color = bigCategoryColors[bigCategory] || '#8ec5e8';

  Object.entries(groupedByType).forEach(([type, clauses]) => {
    const card = document.createElement('div');
    card.className = 'subcategoryCard';
    card.style.borderLeft = `3px solid ${color}`;

    const clWord = clauses.length === 1 ? 'clause' : 'clauses';

    card.innerHTML = `
      <div class="subcategoryRow">
        <div class="subcategoryHeaderText">
          <span class="subcategoryType">${formatLabel(type)}</span>
          <div class="subcategoryMeta">${clauses.length} ${clWord} discovered</div>
        </div>
        <button class="detailsBtn">View</button>
      </div>
    `;

    card.querySelector('.detailsBtn').addEventListener('click', () => {
      lastView = 'subcategories';
      showClauseDetails(type, clauses);
    });

    container.appendChild(card);
  });

  lastView = 'main';
  showView('subcategories', 'forward');
}

// ── Clause details ────────────────────────────

function showClauseDetails(type, items) {
  const detailTitle = document.getElementById('detailTitle');
  const container   = document.getElementById('detailContent');
  if (!detailTitle || !container) return;

  detailTitle.textContent = formatLabel(type).toUpperCase();
  container.innerHTML = '';

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'detailCard';

    div.innerHTML = `
      <div class="sectionLabel">Original Clause</div>
      <div class="original shortText">${truncateText(item.text, 170)}</div>
      <div class="fullText">${item.text}</div>
      <div class="aiLabel">AI Summary</div>
      <div class="summary">Loading AI summary...</div>
      <button class="summaryToggleBtn" style="display:none;">Show More</button>
      <div class="detailActions">
        <button class="expandBtn">Show Full Clause</button>
        <button class="locateBtn">Locate</button>
      </div>
    `;

    const summaryEl        = div.querySelector('.summary');
    const shortEl          = div.querySelector('.shortText');
    const fullEl           = div.querySelector('.fullText');
    const expandBtn        = div.querySelector('.expandBtn');
    const locateBtn        = div.querySelector('.locateBtn');
    const summaryToggleBtn = div.querySelector('.summaryToggleBtn');

    chrome.runtime.sendMessage({ action: 'analyzeClause', text: item.text }, res => {
      if (chrome.runtime.lastError) {
        summaryEl.textContent = 'Unable to load summary';
        return;
      }
      if (res?.summary) {
        summaryEl.textContent = res.summary;
        requestAnimationFrame(() => {
          if (summaryEl.scrollHeight > summaryEl.clientHeight + 2) {
            summaryToggleBtn.style.display = 'inline-block';
          }
        });
      } else {
        summaryEl.textContent = 'No response from AI';
      }
    });

    expandBtn.addEventListener('click', () => {
      const showingFull = fullEl.style.display === 'block';
      fullEl.style.display   = showingFull ? 'none' : 'block';
      shortEl.style.display  = showingFull ? 'block' : 'none';
      expandBtn.textContent  = showingFull ? 'Show Full Clause' : 'Collapse Clause';
    });

    summaryToggleBtn.addEventListener('click', () => {
      const expanded = summaryEl.classList.toggle('expanded');
      summaryToggleBtn.textContent = expanded ? 'Show Less' : 'Show More';
    });

    locateBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0]?.id) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollToClause', text: item.text });
      });
    });

    container.appendChild(div);
  });

  showView('details', 'forward');
}

// ── Settings ─────────────────────────────────

function renderColorSettings(colors) {
  const container = document.getElementById('colorSettings');
  if (!container) return;
  container.innerHTML = '';

  Object.entries(colors).forEach(([category, color]) => {
    const row = document.createElement('div');
    row.className = 'settingsRow';
    row.innerHTML = `
      <div class="settingsRowInfo">
        <div class="settingsRowTitle">${category}</div>
        <div class="settingsRowDesc">${colorDescriptions[category] || ''}</div>
      </div>
      <input class="colorChip" type="color" value="${color}" data-category="${category}" aria-label="${category} color"/>
    `;
    container.appendChild(row);
  });
}

function loadSettings() {
  chrome.storage.sync.get(['highlightColors', 'autoScan', 'aiSummaries', 'highlightStyle'], result => {
    const colors = { ...DEFAULT_BIG_CATEGORY_COLORS, ...(result.highlightColors || {}) };
    bigCategoryColors = colors;
    renderColorSettings(colors);

    const autoScan = document.getElementById('autoScanToggle');
    const aiSum    = document.getElementById('aiSummaryToggle');
    if (autoScan) autoScan.checked = result.autoScan !== false;
    if (aiSum)    aiSum.checked    = result.aiSummaries !== false;

    // Set active pill button
    const activeStyle = result.highlightStyle || 'underline';
    document.querySelectorAll('.styleToggleBtn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === activeStyle);
    });
  });
}

function showSettings() {
  loadSettings();
  showView('settings', 'forward');
}

document.getElementById('settingsBackBtn').addEventListener('click', () => {
  showView('main', 'backward');
});

// Highlight style pill buttons
document.querySelectorAll('.styleToggleBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.styleToggleBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  const colors = {};
  document.querySelectorAll('.colorChip').forEach(input => {
    colors[input.dataset.category] = input.value;
  });

  const autoScan    = document.getElementById('autoScanToggle').checked;
  const aiSummaries = document.getElementById('aiSummaryToggle').checked;
  const isDark      = !document.body.classList.contains('day');
  const highlightStyle = document.querySelector('.styleToggleBtn.active')?.dataset.style || 'underline';

  chrome.storage.sync.set({ highlightColors: colors, autoScan, aiSummaries, darkMode: isDark, highlightStyle }, () => {
    bigCategoryColors = { ...DEFAULT_BIG_CATEGORY_COLORS, ...colors };

    // Refresh colors + style on active tab
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshHighlightColors' });
        chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshHighlightStyle' });
      }
    });

    chrome.runtime.sendMessage({ action: 'refreshAllTabsHighlightColors' }, () => {});

    const status = document.getElementById('saveStatus');
    if (status) {
      status.textContent = '✓ Settings saved';
      setTimeout(() => { status.textContent = ''; }, 2500);
    }
  });
});

document.getElementById('resetColorsBtn').addEventListener('click', () => {
  renderColorSettings(DEFAULT_BIG_CATEGORY_COLORS);
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = 'Defaults restored · Save to apply';
});

document.getElementById('nightModeToggle').addEventListener('change', e => {
  const isDark = e.target.checked;
  chrome.storage.sync.set({ darkMode: isDark }, () => applyTheme(isDark));
});

// ── Colors ───────────────────────────────────

function loadColors() {
  chrome.storage.sync.get(['highlightColors'], result => {
    bigCategoryColors = { ...DEFAULT_BIG_CATEGORY_COLORS, ...(result.highlightColors || {}) };
  });
}

// ── Detections ───────────────────────────────

function fetchDetections(retries = 8) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]?.id) return;

    chrome.tabs.sendMessage(tabs[0].id, { action: 'getDetections' }, res => {
      if (chrome.runtime.lastError) {
        if (retries > 0) return setTimeout(() => fetchDetections(retries - 1), 400);
        showEmptyState();
        return;
      }
      if (!res?.data) {
        if (retries > 0) return setTimeout(() => fetchDetections(retries - 1), 400);
        showEmptyState();
        return;
      }

      globalDetections = res.data;
      loadColors();
      renderMain(globalDetections);

      // Badge count
      chrome.action?.setBadgeText({ text: globalDetections.length > 0 ? String(globalDetections.length) : '' });
      chrome.action?.setBadgeBackgroundColor({ color: '#1a4a6e' });
    });
  });
}

function showEmptyState() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('emptyState').style.display   = 'flex';
  document.getElementById('results').style.display      = 'none';
  const subtitle = document.getElementById('mainSubtitle');
  if (subtitle) subtitle.textContent = 'Scoped · Nothing Discovered';
}

// ── Nav buttons ──────────────────────────────

document.getElementById('toggleHighlight').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleHighlight' });
  });
});

document.getElementById('subcategoriesBackBtn').addEventListener('click', () => {
  showView('main', 'backward');
});

document.getElementById('backBtn').addEventListener('click', () => {
  if (lastView === 'subcategories') {
    showView('subcategories', 'backward');
    return;
  }
  showView('main', 'backward');
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  showSettings();
});

// ── Init ─────────────────────────────────────

loadTheme();
loadColors();

// Set site label
getSiteLabel().then(label => {
  const el = document.getElementById('siteLabel');
  if (el && label) el.textContent = label;
});

// Start fetching
fetchDetections();
