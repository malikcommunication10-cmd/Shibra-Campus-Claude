/* layout.js - har page mein sidebar + topbar banata hai.
   Use:  const ctx = await Layout.init('classes', 'Classes & Sessions');
   ctx = { user, settings, session, readonly }   Page ka content <main id="page"> mein hota hai. */
const Layout = (() => {
  const I = {
    home: '<path d="M3 11l9-8 9 8v10H15v-6H9v6H3z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2.5.6 4 2.5 4 6"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    book: '<path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4z"/><path d="M4 16a4 4 0 014-4h10"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    scale: '<path d="M12 3v18M5 21h14M5 7h14M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-2 5.5-2 6 0M14 10h4M14 14h4"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

  // built:true = file maujood hai. Baqi phases mein khulti jayengi.
  const MENU = [
    ['Main', [['dashboard', 'Dashboard', 'home', 1]]],
    ['Students', [['admission', 'Admission', 'plus', 1], ['students', 'Students', 'users', 1], ['classes', 'Classes & Sessions', 'layers', 1]]],
    ['Fees', [['fee-structure', 'Fee Structure', 'tag', 1], ['fee-collection', 'Fee Collection', 'wallet', 1], ['fee-ledger', 'Fee Ledger', 'book', 1]]],
    ['Book Store', [['books-items', 'Items & Stock', 'box', 0], ['books-purchase', 'Purchase', 'cart', 0], ['books-sale', 'Sale', 'cart', 0]]],
    ['Accounts', [['accounts', 'Accounts', 'scale', 0], ['reports', 'Reports', 'chart', 0]]],
    ['Admin', [['staff', 'Staff & Salary', 'id', 0], ['settings', 'Settings', 'cog', 1]]]
  ];

  async function init(page, title) {
    await DB.init();
    const user = await Auth.current();
    if (!user) { location.replace('index.html'); return new Promise(() => {}); }
    if (!Auth.canOpen(user, page)) { location.replace('dashboard.html'); return new Promise(() => {}); }

    const settings = await DB.getSettings();
    const sessions = await DB.list('sessions');
    let curId = localStorage.getItem('serp_cur_session');
    let session = sessions.find(s => s.id === curId) || sessions.find(s => s.is_active) || sessions[0] || null;
    if (session) localStorage.setItem('serp_cur_session', session.id);

    const nav = MENU.map(([g, items]) => {
      const links = items.filter(([k]) => Auth.canOpen(user, k)).map(([k, l, ic, built]) =>
        built ? `<a href="${k}.html" class="${k === page ? 'on' : ''}">${svg(ic)}<span>${l}</span></a>`
              : `<a href="#" class="dim" data-soon="${l}">${svg(ic)}<span>${l}</span><span class="soon">soon</span></a>`).join('');
      return links ? `<div class="grp">${g}</div>${links}` : '';
    }).join('');

    const body = document.body;
    const pageHTML = $('#page').outerHTML; $('#page').remove();
    body.insertAdjacentHTML('afterbegin', `
      <aside class="sidebar" id="sidebar" aria-label="Main menu">
        <div class="brand"><b>${esc(settings.school_name)}</b><small>School ERP</small></div>
        <nav class="nav">${nav}</nav>
      </aside>
      <div class="overlay hide" id="overlay"></div>
      <div class="main">
        <header class="topbar">
          <button class="menu-btn" id="menuBtn" aria-label="Open menu"><svg viewBox="0 0 24 24">${I.menu}</svg></button>
          <h1>${esc(title)}</h1>
          <select id="sessSel" aria-label="Session">${sessions.map(s => `<option value="${s.id}" ${session && s.id === session.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          <div class="user-chip">
            <div class="av">${esc(user.name[0].toUpperCase())}</div>
            <div class="who">${esc(user.name)}<small>${ROLES[user.role].label}</small></div>
            <button class="btn ghost sm" id="logoutBtn">Logout</button>
          </div>
        </header>
        <div class="content" id="contentWrap">${pageHTML}</div>
      </div>`);
    $('#contentWrap > #page').removeAttribute('hidden');

    const readonly = Auth.isReadonly(user);
    if (readonly) body.classList.add('readonly');

    const sb = $('#sidebar'), ov = $('#overlay');
    const toggle = open => { sb.classList.toggle('open', open); ov.classList.toggle('hide', !open); };
    $('#menuBtn').onclick = () => toggle(!sb.classList.contains('open'));
    ov.onclick = () => toggle(false);
    $$('[data-soon]').forEach(a => a.onclick = e => { e.preventDefault(); toast(a.dataset.soon + ' agli phase mein aayega'); toggle(false); });
    $('#logoutBtn').onclick = () => Auth.logout();
    $('#sessSel').onchange = e => { localStorage.setItem('serp_cur_session', e.target.value); location.reload(); };

    document.title = `${title} - ${settings.school_name}`;
    return { user, settings, session, readonly };
  }
  return { init };
})();
