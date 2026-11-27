/* Staff access model: LEARNING MODEL ONLY. All users, passwords and secrets are fake.
   Real systems keep hashes and secrets on a server, never in the browser. */
(function () {
  'use strict';

  const USERS_KEY = 'staff.users.v1';
  const LOG_KEY = 'staff.log.v1';
  const SESSION_KEY = 'staff.session.v1';
  const PBKDF2_ITERATIONS = 100000;
  const STEP_MS = 30000;          // TOTP time step: 30 seconds
  const MAX_FAILS = 5;            // failures before a short lockout
  const LOCK_MS = 30000;
  const GROUPS = ['Design', 'Sales', 'IT'];
  const ROLES = { Design: ['Designer', 'Senior Designer', 'Art Director'], Sales: ['Account Executive', 'Sales Manager'], IT: ['IT Support', 'IT Admin'] };
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  // Fake demo accounts. The plain passwords exist only here, to seed hashes on first run.
  const SEED = [
    { id: 'amelie', name: 'Amelie Fake', group: 'Design', role: 'Designer', pw: 'learn-amelie-1', secret: 'JBSWY3DPEHPK3PXP' },
    { id: 'bruno', name: 'Bruno Sample', group: 'Design', role: 'Senior Designer', pw: 'learn-bruno-1', secret: 'KRSXG5CTMVRXEZLU' },
    { id: 'carla', name: 'Carla Demo', group: 'Sales', role: 'Account Executive', pw: 'learn-carla-1', secret: 'MFRGGZDFMZTWQ2LK' },
    { id: 'dario', name: 'Dario Placeholder', group: 'Sales', role: 'Sales Manager', pw: 'learn-dario-1', secret: 'NBSWY3DPFQQHO33S' },
    { id: 'eva', name: 'Eva Test', group: 'IT', role: 'IT Support', pw: 'learn-eva-1', secret: 'ORSXG5BAON2HE2LO' },
    { id: 'felix', name: 'Felix Example', group: 'IT', role: 'IT Admin', pw: 'learn-felix-1', secret: 'MNQXEZLSMVZXIZJA' }
  ];

  // ---------- Crypto helpers (Web Crypto API) ----------
  const enc = new TextEncoder();
  const toHex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = hex => Uint8Array.from(hex.match(/../g) || [], h => parseInt(h, 16));

  async function hashPassword(password, saltHex) {
    const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
    return { salt: toHex(salt), hash: toHex(bits) };
  }
  const sameString = (a, b) => { // constant-time-ish compare
    if (a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  async function verifyPassword(password, rec) {
    const { hash } = await hashPassword(password, rec.salt);
    return sameString(hash, rec.hash);
  }

  function base32Decode(s) {
    let bits = '';
    for (const ch of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(ch); if (v < 0) throw new Error('bad base32'); bits += v.toString(2).padStart(5, '0'); }
    const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
    return Uint8Array.from(out);
  }
  function randomBase32(n) { const r = crypto.getRandomValues(new Uint8Array(n)); return Array.from(r, b => B32[b % 32]).join(''); }
  function randomPassword(n) { const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(n)); return Array.from(r, b => a[b % a.length]).join(''); }

  // RFC 4226 HOTP / RFC 6238 TOTP (HMAC-SHA1).
  async function hotp(secretB32, counter, digits = 6) {
    const key = await crypto.subtle.importKey('raw', base32Decode(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const msg = new Uint8Array(8); let c = counter;
    for (let i = 7; i >= 0; i--) { msg[i] = c % 256; c = Math.floor(c / 256); }
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
    const o = h[h.length - 1] & 0x0f;
    const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(bin % Math.pow(10, digits)).padStart(digits, '0');
  }
  const totp = (secret, nowMs = Date.now(), digits = 6) => hotp(secret, Math.floor(nowMs / STEP_MS), digits);

  // Accepts the current step and one either side (clock drift). A step that was
  // already used is refused, so a captured code cannot be replayed.
  async function verifyTotp(secret, code, nowMs, lastStep) {
    if (!/^\d{6}$/.test(code)) return null;
    const cur = Math.floor(nowMs / STEP_MS);
    for (const w of [0, -1, 1]) {
      const step = cur + w;
      if (step <= (lastStep || 0)) continue;
      if (sameString(await hotp(secret, step), code)) return step;
    }
    return null;
  }

  // ---------- Storage ----------
  const readJson = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  const loadUsers = () => readJson(USERS_KEY, []);
  const saveUsers = u => writeJson(USERS_KEY, u);
  const findUser = id => loadUsers().find(u => u.id === id);

  function log(text) {
    const l = readJson(LOG_KEY, []);
    l.unshift({ at: new Date().toISOString(), text });
    writeJson(LOG_KEY, l.slice(0, 50));
  }

  async function seedIfNeeded() {
    if (loadUsers().length) return;
    const users = [];
    for (const s of SEED) {
      const { salt, hash } = await hashPassword(s.pw);
      users.push({ id: s.id, name: s.name, group: s.group, role: s.role, status: 'Active', salt, hash, secret: s.secret, fails: 0, lockUntil: 0, lastStep: 0 });
    }
    saveUsers(users);
    log('Demo data created (6 fake users).');
  }

  // ---------- Rules ----------
  const isActive = u => !!u && u.status === 'Active';
  const canOpenAdmin = u => isActive(u) && u.group === 'IT';

  function updateUser(id, fn) { const all = loadUsers(); const u = all.find(x => x.id === id); if (u) { fn(u); saveUsers(all); } return u; }

  function lockedMessage(u, now) { return u.lockUntil > now ? 'Too many attempts. Try again in ' + Math.ceil((u.lockUntil - now) / 1000) + ' s.' : null; }
  function recordFailure(id, now) {
    updateUser(id, u => { u.fails = (u.fails || 0) + 1; if (u.fails >= MAX_FAILS) { u.lockUntil = now + LOCK_MS; u.fails = 0; } });
  }

  // Step 1: username + password. Returns { ok, pendingId } or { ok:false, error }.
  async function signInPassword(username, password, now = Date.now()) {
    const generic = { ok: false, error: 'Sign-in failed. Check your username and password.' };
    const u = findUser(String(username || '').trim().toLowerCase());
    if (!u) { await hashPassword('x'); return generic; } // similar timing for unknown users
    const lock = lockedMessage(u, now);
    if (lock) return { ok: false, error: lock };
    if (!(await verifyPassword(password, u))) { recordFailure(u.id, now); log('Failed password for ' + u.id); return generic; }
    if (!isActive(u)) { log('Blocked sign-in for leaver ' + u.id); return { ok: false, error: 'This account is disabled because the person has left. Contact IT.' }; }
    return { ok: true, pendingId: u.id };
  }

  // Step 2: the TOTP code. On success, starts the session.
  async function signInCode(pendingId, code, now = Date.now()) {
    const u = findUser(pendingId);
    if (!isActive(u)) return { ok: false, error: 'This account is disabled.' };
    const lock = lockedMessage(u, now);
    if (lock) return { ok: false, error: lock };
    const step = await verifyTotp(u.secret, String(code || '').trim(), now, u.lastStep);
    if (step == null) { recordFailure(u.id, now); log('Failed code for ' + u.id); return { ok: false, error: 'Wrong or already used code.' }; }
    updateUser(u.id, x => { x.lastStep = step; x.fails = 0; x.lockUntil = 0; });
    try { sessionStorage.setItem(SESSION_KEY, u.id); } catch (e) { /* ignore */ }
    log('Signed in: ' + u.id);
    return { ok: true, userId: u.id };
  }

  const sessionId = () => { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; } };
  function signOut() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
  // The current user is always re-read from storage, so a leaver loses access immediately.
  function currentUser() {
    const u = findUser(sessionId());
    if (!isActive(u)) { if (sessionId()) signOut(); return null; }
    return u;
  }

  // Admin actions re-check the actor every time (not just hide the buttons).
  function requireAdmin(actorId) {
    const a = findUser(actorId);
    if (!canOpenAdmin(a)) throw new Error('Access denied: the admin section is for active IT staff only.');
    return a;
  }

  function usernameFor(name, users) {
    const base = (name.trim().split(/\s+/)[0] || 'user').toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    let id = base, n = 2;
    while (users.some(u => u.id === id)) id = base + n++;
    return id;
  }

  async function addJoiner(actorId, { name, group, role }) {
    requireAdmin(actorId);
    name = String(name || '').trim();
    if (name.length < 2 || name.length > 60) throw new Error('Enter a name (2 to 60 characters).');
    if (!GROUPS.includes(group) || !(ROLES[group] || []).includes(role)) throw new Error('Choose a valid group and role.');
    const users = loadUsers();
    const id = usernameFor(name, users);
    const tempPassword = randomPassword(12);
    const { salt, hash } = await hashPassword(tempPassword);
    const secret = randomBase32(16);
    users.push({ id, name, group, role, status: 'Active', salt, hash, secret, fails: 0, lockUntil: 0, lastStep: 0 });
    saveUsers(users);
    log(actorId + ' added joiner ' + id + ' (' + group + ', ' + role + ')');
    return { id, tempPassword, secret };
  }

  function markLeaver(actorId, targetId) {
    requireAdmin(actorId);
    const users = loadUsers();
    const t = users.find(u => u.id === targetId);
    if (!t) throw new Error('No such user.');
    if (!isActive(t)) throw new Error(t.name + ' is already a leaver.');
    if (t.id === actorId) throw new Error('You cannot mark yourself as a leaver.');
    if (t.group === 'IT' && users.filter(u => u.group === 'IT' && isActive(u)).length <= 1) throw new Error('The last active IT person cannot leave.');
    t.status = 'Leaver'; t.leftAt = new Date().toISOString();
    saveUsers(users);
    log(actorId + ' marked ' + t.id + ' as leaver');
    return t;
  }

  function resetDemo() { try { localStorage.removeItem(USERS_KEY); localStorage.removeItem(LOG_KEY); sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }

  const Model = { hashPassword, verifyPassword, base32Decode, hotp, totp, verifyTotp, seedIfNeeded, loadUsers, signInPassword, signInCode, currentUser, signOut, canOpenAdmin, requireAdmin, addJoiner, markLeaver, resetDemo, GROUPS, ROLES, SEED, STEP_MS };
  window.StaffModel = Model; // exposed so the test page can call the model directly

  // ---------- UI ----------
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let pending = null;       // user id after a correct password, waiting for the code
  let adminOpen = false;
  let newJoiner = null;

  function say(id, msg, good) { const n = $(id); n.textContent = msg || ''; n.className = 'msg ' + (good ? 'good' : 'bad'); }

  function renderDemo() {
    const body = $('demoBody'); body.replaceChildren();
    SEED.forEach(s => {
      const tr = el('tr'); [s.id, s.pw, s.group + ' / ' + s.role].forEach(t => tr.append(el('td', null, t))); body.append(tr);
    });
    const sel = $('authUser'); if (!sel.options.length) loadUsers().forEach(u => sel.append(new Option(u.id, u.id)));
  }

  async function renderCode() {
    const u = findUser($('authUser').value);
    if (!u) { $('authCode').textContent = '------'; return; }
    $('authCode').textContent = (await totp(u.secret)).replace(/(\d{3})(\d{3})/, '$1 $2');
    $('authLeft').textContent = Math.ceil((STEP_MS - (Date.now() % STEP_MS)) / 1000) + ' s left';
  }

  function renderSession() {
    const u = currentUser();
    $('signin').hidden = !!u;
    $('app').hidden = !u;
    $('step1').hidden = !!pending; $('step2').hidden = !pending;
    if (!u) { adminOpen = false; return; }
    $('who').textContent = u.name;
    $('whoMeta').textContent = u.group + ' / ' + u.role;
    const dir = $('dir'); dir.replaceChildren();
    loadUsers().filter(isActive).forEach(p => { const tr = el('tr'); [p.name, p.group, p.role].forEach(t => tr.append(el('td', null, t))); dir.append(tr); });
    $('admin').hidden = !adminOpen;
    if (adminOpen) renderAdmin(u);
  }

  function renderAdmin(actor) {
    const body = $('adminBody'); body.replaceChildren();
    loadUsers().forEach(u => {
      const tr = el('tr', u.status === 'Leaver' ? 'left' : '');
      [u.id, u.name, u.group, u.role].forEach(t => tr.append(el('td', null, t)));
      const st = el('td'); st.append(el('span', 'pill ' + u.status, u.status)); tr.append(st);
      const act = el('td');
      if (isActive(u)) {
        const b = el('button', 'small danger', 'Leaver'); b.type = 'button';
        b.addEventListener('click', () => {
          if (!confirm('Mark ' + u.name + ' as a leaver? They will no longer be able to sign in.')) return;
          try { markLeaver(actor.id, u.id); say('adminMsg', u.name + ' is now a leaver.', true); } catch (e) { say('adminMsg', e.message, false); }
          renderSession();
        });
        act.append(b);
      }
      tr.append(act); body.append(tr);
    });
    const lg = $('log'); lg.replaceChildren();
    readJson(LOG_KEY, []).slice(0, 12).forEach(l => lg.append(el('li', null, new Date(l.at).toLocaleTimeString() + '  ' + l.text)));
    const box = $('joinerResult'); box.hidden = !newJoiner; box.replaceChildren();
    if (newJoiner) {
      box.append(el('strong', null, 'Joiner created (shown once in this model)'));
      [['Username', newJoiner.id], ['Temporary password', newJoiner.tempPassword], ['Authenticator secret', newJoiner.secret]].forEach(([k, v]) => { const p = el('div'); p.append(el('span', null, k + ': '), el('code', null, v)); box.append(p); });
    }
  }

  function fillRoles() {
    const g = $('jGroup').value; const r = $('jRole'); r.replaceChildren();
    (ROLES[g] || []).forEach(x => r.append(new Option(x, x)));
  }

  async function init() {
    if (!window.crypto || !crypto.subtle) { $('fatal').hidden = false; return; } // needs https or localhost
    await seedIfNeeded();
    GROUPS.forEach(g => $('jGroup').append(new Option(g, g)));
    fillRoles(); $('jGroup').addEventListener('change', fillRoles);
    renderDemo(); renderSession(); renderCode();
    $('authUser').addEventListener('change', renderCode);
    setInterval(renderCode, 1000);

    $('step1').addEventListener('submit', async e => {
      e.preventDefault();
      const r = await signInPassword($('username').value, $('password').value);
      $('password').value = '';
      if (!r.ok) { say('msg1', r.error, false); return; }
      pending = r.pendingId; say('msg1', ''); say('msg2', 'Password correct. Now enter the 6-digit code from the authenticator.', true);
      renderSession(); $('code').focus();
    });
    $('step2').addEventListener('submit', async e => {
      e.preventDefault();
      const r = await signInCode(pending, $('code').value);
      $('code').value = '';
      if (!r.ok) { say('msg2', r.error, false); return; }
      pending = null; say('msg2', ''); renderSession();
    });
    $('back').addEventListener('click', () => { pending = null; say('msg2', ''); renderSession(); });
    $('signout').addEventListener('click', () => { signOut(); pending = null; newJoiner = null; adminOpen = false; renderSession(); });
    $('openAdmin').addEventListener('click', () => {
      const u = currentUser();
      if (!canOpenAdmin(u)) { adminOpen = false; say('adminDenied', 'Access denied: the admin section is for IT staff only.', false); renderSession(); return; }
      say('adminDenied', ''); adminOpen = !adminOpen; renderSession();
    });
    $('joiner').addEventListener('submit', async e => {
      e.preventDefault();
      const u = currentUser();
      try {
        newJoiner = await addJoiner(u && u.id, { name: $('jName').value, group: $('jGroup').value, role: $('jRole').value });
        say('adminMsg', 'Joiner added.', true); $('jName').value = '';
      } catch (err) { say('adminMsg', err.message, false); }
      renderSession(); renderDemo(); // note: new user also appears in the demo authenticator list
      const sel = $('authUser'); sel.replaceChildren(); loadUsers().forEach(x => sel.append(new Option(x.id, x.id)));
    });
    $('reset').addEventListener('click', async () => {
      if (!confirm('Reset all demo data back to the six starting users?')) return;
      resetDemo(); pending = null; newJoiner = null; adminOpen = false;
      await seedIfNeeded(); const sel = $('authUser'); sel.replaceChildren(); renderDemo(); renderSession(); renderCode();
    });
    window.addEventListener('storage', () => { renderSession(); }); // other tab changed data
    setInterval(() => { if (sessionId()) renderSession(); }, 10000); // drop a session if the account became a leaver
  }

  if (document.getElementById('signin')) Model.ready = init(); // tests await this
})();
