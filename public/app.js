import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

/* ------------------------------------------------------------------ *
 * Firebase 初始化
 * ------------------------------------------------------------------ */

const CONFIG_READY = !JSON.stringify(firebaseConfig).includes('PASTE_');

let auth = null, db = null;
if(CONFIG_READY){
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // 离线快取：断线时仍看得到资料，回线后自动同步
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
}

const BOOKINGS = 'bookings';
const EXPENSES = 'expenses';
const ADSPEND = 'adSpend';
const SST_RATE = 0.08; // Malaysia SST (service tax), deducted from the booking amount

let bookings = [];
let expenses = [];
let adSpend = [];
let bookingsLoaded = false;
let expensesLoaded = false;
let adSpendLoaded = false;
let unsubscribers = [];
let permissionBannerShown = false;

function calcSST(amount){
  return Number(amount) * SST_RATE;
}
function calcGP(amount){
  return Number(amount) - calcSST(amount);
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const gate = $('gate');
const appEl = $('app');
const overlay = $('overlay');
const addBtn = $('addBtn');
const cancelBtn = $('cancelBtn');
const saveBtn = $('saveBtn');
const togglePast = $('togglePast');
const pastList = $('pastList');
const toggleMonthly = $('toggleMonthly');
const monthlyList = $('monthlyList');
const expenseOverlay = $('expenseOverlay');
const addExpenseBtn = $('addExpenseBtn');
const xCancelBtn = $('xCancelBtn');
const xSaveBtn = $('xSaveBtn');
const statusToggle = $('statusToggle');
const syncStatus = $('syncStatus');
let selectedStatus = 'confirmed';

statusToggle.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    statusToggle.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedStatus = btn.dataset.status;
  });
});

const DOW = ['周日','周一','周二','周三','周四','周五','周六'];
const CAL_DOW = ['日','一','二','三','四','五','六'];
const MON_FULL = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// 柔佛(新山)公共假期 — 2026年为官方公布日期,2027年为目前预测日期,待官方确认后更新
const HOLIDAYS = {
  '2026-02-01': "大宝森节",
  '2026-02-02': "大宝森节假期",
  '2026-02-17': "农历新年",
  '2026-02-18': "农历新年假期",
  '2026-02-19': "斋戒月首日",
  '2026-03-20': "开斋节假期",
  '2026-03-21': "开斋节",
  '2026-03-22': "开斋节假期",
  '2026-03-23': "柔佛苏丹诞辰",
  '2026-03-24': "开斋节假期",
  '2026-05-01': "劳动节",
  '2026-05-27': "哈芝节",
  '2026-05-31': "卫塞节",
  '2026-06-01': "最高元首诞辰",
  '2026-06-02': "卫塞节假期",
  '2026-06-17': "回历新年",
  '2026-07-21': "已故苏丹依斯干达纪念日",
  '2026-08-25': "圣纪节",
  '2026-08-31': "独立日",
  '2026-09-16': "马来西亚日",
  '2026-11-08': "屠妖节",
  '2026-11-09': "屠妖节假期",
  '2026-12-25': "圣诞节",
  '2027-01-22': "大宝森节",
  '2027-02-06': "农历新年",
  '2027-02-07': "农历新年假期",
  '2027-02-08': "斋戒月首日/农历新年假期",
  '2027-03-10': "开斋节",
  '2027-03-11': "开斋节假期",
  '2027-03-23': "柔佛苏丹诞辰",
  '2027-05-01': "劳动节",
  '2027-05-17': "哈芝节",
  '2027-05-20': "卫塞节",
  '2027-06-06': "回历新年",
  '2027-06-07': "最高元首诞辰",
  '2027-07-10': "已故苏丹依斯干达纪念日",
  '2027-08-15': "圣纪节",
  '2027-08-16': "圣纪节假期",
  '2027-08-31': "独立日",
  '2027-09-16': "马来西亚日",
  '2027-10-28': "屠妖节",
  '2027-12-25': "圣诞节"
};

const today0 = new Date(); today0.setHours(0,0,0,0);
let calYear = today0.getFullYear();
let calMonth = today0.getMonth();
let selectedDateStr = null;

/* ------------------------------------------------------------------ *
 * 登入 / 登出
 * ------------------------------------------------------------------ */

function showGateError(msg){
  const el = $('loginErr');
  el.textContent = msg;
  el.classList.add('show');
}

function authErrorText(code){
  switch(code){
    case 'auth/invalid-email':        return '电邮格式不正确。';
    case 'auth/missing-password':     return '请输入密码。';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':       return '电邮或密码不正确。';
    case 'auth/too-many-requests':    return '尝试次数太多，请稍后再试。';
    case 'auth/network-request-failed': return '网络连线失败，请检查网络。';
    case 'auth/operation-not-allowed': return '尚未在 Firebase 开启「电邮/密码」登入方式。';
    case 'auth/unauthorized-domain':  return '这个网址还没加进 Firebase 的授权网域。请到 Authentication → Settings → 授权网域，加入 ' + location.hostname + '。';
    default:                          return '登入失败：' + code;
  }
}

if(!CONFIG_READY){
  $('loginBtn').disabled = true;
  $('gateNote').innerHTML =
    '还没设定 Firebase。请先照 <code>README.md</code> 建立专案，' +
    '再把设定贴进 <code>public/firebase-config.js</code>。';
} else {
  const loginBtn = $('loginBtn');
  const doLogin = async () => {
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    $('loginErr').classList.remove('show');
    if(!email || !password){
      showGateError('请输入电邮和密码。');
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = '登入中…';
    try{
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);
    }catch(e){
      showGateError(authErrorText(e.code || e.message));
    }finally{
      loginBtn.disabled = false;
      loginBtn.textContent = '登入';
    }
  };
  loginBtn.addEventListener('click', doLogin);
  ['loginEmail','loginPassword'].forEach(id => {
    $(id).addEventListener('keydown', (e) => { if(e.key === 'Enter') doLogin(); });
  });

  onAuthStateChanged(auth, (user) => {
    if(user){
      gate.classList.add('hidden');
      appEl.classList.add('ready');
      $('whoAmI').innerHTML =
        `${escapeHtml(user.email || '')}<button id="logoutBtn" type="button">登出</button>`;
      $('logoutBtn').addEventListener('click', () => signOut(auth));
      $('loginPassword').value = '';
      startListening();
    } else {
      stopListening();
      bookings = []; expenses = []; adSpend = [];
      bookingsLoaded = false; expensesLoaded = false; adSpendLoaded = false;
      appEl.classList.remove('ready');
      gate.classList.remove('hidden');
    }
  });
}

/* ------------------------------------------------------------------ *
 * Firestore 即时同步
 * ------------------------------------------------------------------ */

function startListening(){
  stopListening();
  syncStatus.classList.remove('show');
  permissionBannerShown = false;

  unsubscribers.push(onSnapshot(
    query(collection(db, BOOKINGS), orderBy('date')),
    (snap) => {
      bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      bookingsLoaded = true;
      if(allLoaded()) render();
    },
    (err) => onSnapshotError(err, '预订')
  ));

  unsubscribers.push(onSnapshot(
    query(collection(db, EXPENSES), orderBy('date', 'desc')),
    (snap) => {
      expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      expensesLoaded = true;
      if(allLoaded()) render();
    },
    (err) => onSnapshotError(err, '支出')
  ));

  unsubscribers.push(onSnapshot(
    query(collection(db, ADSPEND), orderBy('month', 'desc')),
    (snap) => {
      adSpend = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      adSpendLoaded = true;
      if(allLoaded()) render();
    },
    (err) => onSnapshotError(err, '广告费')
  ));
}

function allLoaded(){
  return bookingsLoaded && expensesLoaded && adSpendLoaded;
}

function stopListening(){
  unsubscribers.forEach(u => u());
  unsubscribers = [];
}

function onSnapshotError(err, what){
  console.error(err);
  syncStatus.classList.add('show');

  if(err.code !== 'permission-denied'){
    syncStatus.textContent = `${what}资料同步失败：${err.message}`;
    return;
  }

  // 每个 listener 都会报同一个错，只显示一次
  if(permissionBannerShown) return;
  permissionBannerShown = true;

  const uid = auth.currentUser ? auth.currentUser.uid : '';
  syncStatus.innerHTML =
    `这个帐号还没被加进 <code>members</code> 名单，所以看不到资料。<br>` +
    `请到 Firebase Console → Firestore Database → <code>members</code> 集合，` +
    `新增一份文件，<b>文件 ID 填下面这一串</b>：<br>` +
    `<code class="uid">${escapeHtml(uid)}</code>` +
    `<button type="button" id="copyUidBtn">复制</button>`;

  const btn = $('copyUidBtn');
  btn.addEventListener('click', async () => {
    try{
      await navigator.clipboard.writeText(uid);
      btn.textContent = '已复制！';
    }catch(e){
      btn.textContent = '请手动选取复制';
    }
    setTimeout(() => { btn.textContent = '复制'; }, 2000);
  });
}

function writeErrorText(err){
  if(err.code === 'permission-denied'){
    return '没有权限写入：这个帐号还没被加进 members 名单。';
  }
  return '保存失败，请重试。（' + (err.code || err.message) + '）';
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function dateKey(y,m,d){
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function expandDates(b){
  const start = parseLocalDate(b.date);
  const end = b.endDate ? parseLocalDate(b.endDate) : start;
  const keys = [];
  const cur = new Date(start);
  while(cur <= end){
    keys.push(dateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function fmtTime(t){
  if(!t) return '';
  const [h,m] = t.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  let h12 = h % 12; if(h12 === 0) h12 = 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2,'0')}${period}`;
}

function fmtMoney(n){
  return 'RM' + Number(n).toLocaleString('en-MY', {minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2});
}

function parseLocalDate(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d);
}

function isConfirmed(b){
  return !b.status || b.status === 'confirmed';
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

/* ------------------------------------------------------------------ *
 * 日历
 * ------------------------------------------------------------------ */

function renderCalendar(){
  $('calMonthLabel').textContent = `${calYear}年${MON_FULL[calMonth]}`;

  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const byDate = {};
  bookings.forEach(b => {
    expandDates(b).forEach(key => {
      (byDate[key] = byDate[key] || []).push(b);
    });
  });

  let html = CAL_DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');

  for(let i=0; i<firstDow; i++){
    html += `<div class="cal-day empty"></div>`;
  }

  for(let d=1; d<=daysInMonth; d++){
    const key = dateKey(calYear, calMonth, d);
    const dayBookings = byDate[key] || [];
    const isToday = key === dateKey(today0.getFullYear(), today0.getMonth(), today0.getDate());
    const holidayName = HOLIDAYS[key];
    const classes = ['cal-day'];
    if(isToday) classes.push('today');
    if(dayBookings.length) classes.push('has-booking');
    if(holidayName) classes.push('holiday');
    if(key === selectedDateStr) classes.push('selected');

    let dots = '';
    if(dayBookings.length){
      dots = `<div class="cal-dot-wrap">` + dayBookings.slice(0,2).map(b => {
        const confirmed = isConfirmed(b);
        return `<span class="cal-dot${confirmed ? '' : ' tentative'}" title="${escapeHtml(b.customer)}${confirmed ? '' : '（暂定）'}">${confirmed ? '🍗 ' : ''}${escapeHtml(b.customer)}</span>`;
      }).join('') +
        (dayBookings.length > 2 ? `<span class="cal-dot">+${dayBookings.length-2}</span>` : '') + `</div>`;
    }
    const holidayLabel = holidayName ? `<div class="cal-holiday-label" title="${escapeHtml(holidayName)}">${escapeHtml(holidayName)}</div>` : '';

    html += `<div class="${classes.join(' ')}" data-date="${dayBookings.length ? key : ''}">
        <div class="dnum">${d}</div>
        ${holidayLabel}
        ${dots}
      </div>`;
  }

  $('calGrid').innerHTML = html;

  document.querySelectorAll('.cal-day.has-booking').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.date;
      selectedDateStr = (selectedDateStr === key) ? null : key;
      renderCalendar();
    });
  });

  renderCalDetail(byDate);
}

function renderCalDetail(byDate){
  const detail = $('calDetail');
  if(!selectedDateStr || !byDate[selectedDateStr]){
    detail.classList.remove('open');
    detail.innerHTML = '';
    return;
  }
  const d = parseLocalDate(selectedDateStr);
  const list = byDate[selectedDateStr];
  detail.innerHTML = `<div class="cd-title">${d.getFullYear()}年${MON_FULL[d.getMonth()]}${d.getDate()}日 · ${DOW[d.getDay()]}</div>` +
    list.map(b => bookingRow(b)).join('');
  detail.classList.add('open');

  detail.querySelectorAll('.del').forEach(btn => {
    attachDeleteConfirm(btn, () => removeDoc(BOOKINGS, btn.dataset.id, btn));
  });
}

/* ------------------------------------------------------------------ *
 * 列表 / 统计
 * ------------------------------------------------------------------ */

function render(){
  const today = new Date();
  today.setHours(0,0,0,0);

  renderCalendar();

  const upcoming = bookings.filter(b => parseLocalDate(b.endDate || b.date) >= today)
    .sort((a,b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date));
  const past = bookings.filter(b => parseLocalDate(b.endDate || b.date) < today)
    .sort((a,b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : b.date.localeCompare(a.date));

  // stats
  const now = new Date();
  const thisMonthBookings = bookings.filter(b => {
    const d = parseLocalDate(b.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthConfirmed = thisMonthBookings.filter(isConfirmed);
  const monthTentativeCount = thisMonthBookings.length - monthConfirmed.length;
  const monthCount = monthConfirmed.length;
  const monthRevenue = monthConfirmed.reduce((s,b) => s + Number(b.amount || 0), 0);
  const monthGP = monthConfirmed.reduce((s,b) => s + calcGP(b.amount || 0), 0);

  const totalConfirmed = bookings.filter(isConfirmed);
  const totalTentativeCount = bookings.length - totalConfirmed.length;
  const totalCount = totalConfirmed.length;
  const totalRevenue = totalConfirmed.reduce((s,b) => s + Number(b.amount || 0), 0);
  const totalGP = totalConfirmed.reduce((s,b) => s + calcGP(b.amount || 0), 0);

  $('statsArea').outerHTML = `
    <div class="stats" id="statsArea">
      <div class="stat">
        <div class="label">本月</div>
        <div class="row">
          <div class="num">${monthCount}</div>
          <div class="sub">场${monthTentativeCount ? ` · 另有${monthTentativeCount}笔暂定` : ''}</div>
        </div>
        <div class="amt">${fmtMoney(monthRevenue)}</div>
        <div class="breakdown">GP <span class="gp">${fmtMoney(monthGP)}</span></div>
      </div>
      <div class="stat">
        <div class="label">总计</div>
        <div class="row">
          <div class="num">${totalCount}</div>
          <div class="sub">场${totalTentativeCount ? ` · 另有${totalTentativeCount}笔暂定` : ''}</div>
        </div>
        <div class="amt">${fmtMoney(totalRevenue)}</div>
        <div class="breakdown">GP <span class="gp">${fmtMoney(totalGP)}</span></div>
      </div>
    </div>`;

  $('upcomingList').innerHTML = upcoming.length
    ? upcoming.map(b => bookingRow(b)).join('')
    : `<div class="empty">暂无预订，点击上方"新增预订"开始。</div>`;

  $('pastList').innerHTML = past.length
    ? past.map(b => bookingRow(b)).join('')
    : `<div class="empty">暂无历史记录。</div>`;

  renderMonthly();
  renderMarketing();
  renderExpenses();

  document.querySelectorAll('#upcomingList .del, #pastList .del').forEach(btn => {
    attachDeleteConfirm(btn, () => removeDoc(BOOKINGS, btn.dataset.id, btn));
  });
}

function renderMonthly(){
  const groups = {}; // "YYYY-MM" -> {count, revenue, gp, tentative}
  bookings.forEach(b => {
    const key = b.date.slice(0,7); // YYYY-MM
    if(!groups[key]) groups[key] = {count:0, revenue:0, gp:0, tentative:0};
    if(isConfirmed(b)){
      groups[key].count += 1;
      groups[key].revenue += Number(b.amount || 0);
      groups[key].gp += calcGP(b.amount || 0);
    } else {
      groups[key].tentative += 1;
    }
  });

  const keys = Object.keys(groups).sort((a,b) => b.localeCompare(a)); // most recent first

  $('monthlyList').innerHTML = keys.length
    ? keys.map(key => {
        const [y,m] = key.split('-').map(Number);
        const g = groups[key];
        return `<div class="month-row">
          <div class="m-label">${y}年${MON_FULL[m-1]}</div>
          <div class="m-mid">${g.count} 场 · GP ${fmtMoney(g.gp)}${g.tentative ? ` · 另有${g.tentative}笔暂定` : ''}</div>
          <div class="m-amt">${fmtMoney(g.revenue)}</div>
        </div>`;
      }).join('')
    : `<div class="empty">暂无记录。</div>`;
}

/* ------------------------------------------------------------------ *
 * 广告 / 行销看板
 * ------------------------------------------------------------------ */

const AD_PLATFORMS = ['Facebook / IG', 'Google', 'TikTok', '小红书', '其他'];
let marketingBasis = 'closed'; // 'closed' = 按成交日 (createdAt)，'event' = 按活动日 (date)

// 一笔预订算在哪个月：按成交日看「广告带来的单」，按活动日看「那个月的场」
function bookingMonth(b){
  if(marketingBasis === 'closed' && b.createdAt){
    const d = new Date(b.createdAt);
    if(!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  return b.date.slice(0,7);
}

function monthLabel(key){
  const [y,m] = key.split('-').map(Number);
  return `${y}年${MON_FULL[m-1]}`;
}

function marketingRows(){
  const groups = {}; // "YYYY-MM" -> {spend, deals, gp, byPlatform}
  const g = (key) => groups[key] = groups[key] || {spend:0, deals:0, gp:0, byPlatform:{}};

  adSpend.forEach(a => {
    const row = g(a.month);
    row.spend += Number(a.amount || 0);
    row.byPlatform[a.platform] = (row.byPlatform[a.platform] || 0) + Number(a.amount || 0);
  });
  bookings.filter(isConfirmed).forEach(b => {
    const row = g(bookingMonth(b));
    row.deals += 1;
    row.gp += calcGP(b.amount || 0);
  });

  return Object.keys(groups).sort().map(key => ({ key, ...groups[key] }));
}

function fmtRatio(gp, spend){
  return spend > 0 ? (gp / spend).toFixed(1) + 'x' : '—';
}

function renderMarketing(){
  const rows = marketingRows();
  const totalSpend = rows.reduce((s,r) => s + r.spend, 0);
  const totalDeals = rows.reduce((s,r) => s + r.deals, 0);
  const totalGP = rows.reduce((s,r) => s + r.gp, 0);
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const cur = rows.find(r => r.key === thisKey) || {spend:0, deals:0, gp:0};

  $('mktStats').innerHTML = `
    <div class="stat">
      <div class="label">本月广告费</div>
      <div class="row"><div class="num">${fmtMoney(cur.spend)}</div></div>
      <div class="breakdown">成交 ${cur.deals} 场 · GP <span class="gp">${fmtMoney(cur.gp)}</span></div>
      <div class="breakdown">ROI ${fmtRatio(cur.gp, cur.spend)}${cur.deals && cur.spend ? ` · 每场成本 ${fmtMoney(cur.spend / cur.deals)}` : ''}</div>
    </div>
    <div class="stat">
      <div class="label">累计广告费</div>
      <div class="row"><div class="num">${fmtMoney(totalSpend)}</div></div>
      <div class="breakdown">成交 ${totalDeals} 场 · GP <span class="gp">${fmtMoney(totalGP)}</span></div>
      <div class="breakdown">ROI ${fmtRatio(totalGP, totalSpend)}${totalDeals && totalSpend ? ` · 每场成本 ${fmtMoney(totalSpend / totalDeals)}` : ''}</div>
    </div>`;

  // 图表只画最近 12 个有资料的月份
  renderMarketingChart(rows.slice(-12));

  const recent = [...rows].reverse();
  $('mktTable').innerHTML = recent.length ? `
    <table class="mkt-table">
      <thead><tr>
        <th>月份</th><th>广告费</th><th>成交</th><th>成交 GP</th><th>ROI</th><th>每场成本</th>
      </tr></thead>
      <tbody>
        ${recent.map(r => `<tr${r.key === thisKey ? ' class="current"' : ''}>
          <td>${monthLabel(r.key)}</td>
          <td title="${escapeHtml(Object.entries(r.byPlatform).map(([p,v]) => `${p} ${fmtMoney(v)}`).join('\n'))}">${r.spend ? fmtMoney(r.spend) : '—'}</td>
          <td>${r.deals} 场</td>
          <td class="gp">${fmtMoney(r.gp)}</td>
          <td>${fmtRatio(r.gp, r.spend)}</td>
          <td>${r.spend && r.deals ? fmtMoney(r.spend / r.deals) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">暂无资料。点击上方"+ 新增广告费"开始记录。</div>`;

  const sortedSpend = [...adSpend].sort((a,b) => b.month.localeCompare(a.month));
  $('adSpendList').innerHTML = sortedSpend.length
    ? sortedSpend.map(a => `
      <div class="expense-row">
        <div class="e-mid">
          <div class="e-item">${escapeHtml(a.platform)}</div>
          <div class="e-date">${monthLabel(a.month)}${a.notes ? ' · ' + escapeHtml(a.notes) : ''}</div>
        </div>
        <div class="e-right">
          <div class="e-amt">-${fmtMoney(a.amount)}</div>
          <button class="del del-ad" data-id="${a.id}" title="删除">✕</button>
        </div>
      </div>`).join('')
    : '';

  document.querySelectorAll('.del-ad').forEach(btn => {
    attachDeleteConfirm(btn, () => removeDoc(ADSPEND, btn.dataset.id, btn));
  });
}

// 每月两根柱：广告费 vs 成交 GP（同一个 RM 轴）
function renderMarketingChart(rows){
  const el = $('mktChart');
  if(!rows.length){ el.innerHTML = ''; return; }

  // 按容器实际宽度画，手机上字才不会被缩小
  const W = Math.max(300, (el.clientWidth || 720) - 14), H = 220, padL = 44, padR = 8, padT = 10, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(1, ...rows.map(r => Math.max(r.spend, r.gp)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v) => padT + plotH - (v / top) * plotH;

  const band = plotW / rows.length;
  const barW = Math.max(4, Math.min(22, (band - 10) / 2));

  let svg = '';
  for(let v = 0; v <= top; v += step){
    svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${shortMoney(v)}</text>`;
  }
  rows.forEach((r, i) => {
    const cx = padL + band * i + band / 2;
    svg += bar(cx - barW - 1, barW, r.spend, 'spend');
    svg += bar(cx + 1, barW, r.gp, 'gp');
    const [yy, mm] = r.key.split('-');
    svg += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${Number(mm)}月${i === 0 || mm === '01' ? ` '${yy.slice(2)}` : ''}</text>`;
    // 整个月份的透明感应区，比柱子大，方便手机点
    svg += `<rect class="hit" data-i="${i}" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}"/>`;
  });

  function bar(x, w, v, cls){
    if(v <= 0) return '';
    const h = Math.max(1, y(0) - y(v));
    const r = Math.min(4, w / 2, h);
    // 顶端圆角、底部贴齐基线
    return `<path class="bar ${cls}" d="M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + w - r} Q${x + w},${y(0) - h} ${x + w},${y(0) - h + r} V${y(0)} Z"/>`;
  }

  el.innerHTML = `
    <div class="mkt-legend">
      <span><i class="sw spend"></i>广告费</span>
      <span><i class="sw gp"></i>成交 GP</span>
    </div>
    <div class="mkt-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每月广告费与成交 GP">${svg}</svg>
      <div class="mkt-tip" id="mktTip"></div>
    </div>`;

  const tip = $('mktTip');
  el.querySelectorAll('.hit').forEach(h => {
    const show = () => {
      const r = rows[Number(h.dataset.i)];
      el.querySelectorAll('.hit').forEach(o => o.classList.toggle('on', o === h));
      tip.innerHTML = `<b>${monthLabel(r.key)}</b>
        <div><i class="sw spend"></i>广告费 ${fmtMoney(r.spend)}</div>
        <div><i class="sw gp"></i>成交 GP ${fmtMoney(r.gp)}</div>
        <div class="muted">${r.deals} 场 · ROI ${fmtRatio(r.gp, r.spend)}</div>`;
      const pct = (Number(h.getAttribute('x')) + band / 2) / W * 100;
      tip.style.left = Math.min(80, Math.max(20, pct)) + '%';
      tip.classList.add('show');
    };
    h.addEventListener('mouseenter', show);
    h.addEventListener('click', show);
  });
  el.querySelector('svg').addEventListener('mouseleave', () => {
    tip.classList.remove('show');
    el.querySelectorAll('.hit').forEach(o => o.classList.remove('on'));
  });
}

function niceStep(raw){
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function shortMoney(v){
  return v >= 1000 ? (v / 1000).toLocaleString('en-MY', {maximumFractionDigits: 1}) + 'k' : String(v);
}

document.querySelectorAll('#mktBasis .status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mktBasis .status-btn').forEach(b => b.classList.toggle('active', b === btn));
    marketingBasis = btn.dataset.basis;
    if(allLoaded()) renderMarketing();
  });
});

function renderExpenses(){
  const sorted = [...expenses].sort((a,b) => b.date.localeCompare(a.date));

  $('expenseList').innerHTML = sorted.length
    ? sorted.map(x => expenseRow(x)).join('')
    : `<div class="empty">暂无支出记录。</div>`;

  document.querySelectorAll('.del-expense').forEach(btn => {
    attachDeleteConfirm(btn, () => removeDoc(EXPENSES, btn.dataset.id, btn));
  });
}

function expenseRow(x){
  const d = parseLocalDate(x.date);
  return `
    <div class="expense-row">
      <div class="e-mid">
        <div class="e-item">${escapeHtml(x.item)}</div>
        <div class="e-date">${d.getFullYear()}年${MON_FULL[d.getMonth()]}${d.getDate()}日</div>
      </div>
      <div class="e-right">
        <div class="e-amt">-${fmtMoney(x.amount)}</div>
        <button class="del del-expense" data-id="${x.id}" title="删除">✕</button>
      </div>
    </div>`;
}

function bookingRow(b){
  const d = parseLocalDate(b.date);
  const isRange = b.endDate && b.endDate !== b.date;
  const dEnd = isRange ? parseLocalDate(b.endDate) : null;
  const tentative = !isConfirmed(b);
  return `
    <div class="booking${tentative ? ' tentative' : ''}">
      <div class="date-block">
        <div class="dow">${isRange ? DOW[d.getDay()] + '–' + DOW[dEnd.getDay()] : DOW[d.getDay()]}</div>
        <div class="dnum">${isRange ? d.getDate() + '–' + dEnd.getDate() : d.getDate()}</div>
        <div class="mon">${isRange && d.getMonth() !== dEnd.getMonth() ? MON_FULL[d.getMonth()] + '/' + MON_FULL[dEnd.getMonth()] : MON_FULL[d.getMonth()]}</div>
      </div>
      <div class="mid">
        <div class="cust">${escapeHtml(b.customer)}${tentative ? '<span class="tag-tentative">暂定</span>' : ''}</div>
        <div class="time">${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}</div>
        ${b.notes ? `<div class="note">${escapeHtml(b.notes)}</div>` : ''}
      </div>
      <div class="right">
        <div class="amounts">
          <div class="price">${fmtMoney(b.amount)}</div>
          <div class="breakdown">SST ${fmtMoney(calcSST(b.amount))} · <span class="gp">GP ${fmtMoney(calcGP(b.amount))}</span></div>
        </div>
        <button class="del" data-id="${b.id}" title="删除">✕</button>
      </div>
    </div>`;
}

function attachDeleteConfirm(btn, onDelete){
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if(btn.classList.contains('confirming')){
      clearTimeout(btn._confirmTimeout);
      btn.disabled = true;
      await onDelete();
    } else {
      btn.classList.add('confirming');
      btn.textContent = '✓';
      btn.title = '再点一次确认删除';
      btn._confirmTimeout = setTimeout(() => {
        btn.classList.remove('confirming');
        btn.textContent = '✕';
        btn.title = '删除';
      }, 3000);
    }
  });
}

async function removeDoc(col, id, btn){
  try{
    await deleteDoc(doc(db, col, id));
  }catch(e){
    console.error(e);
    alert(writeErrorText(e));
    if(btn) btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ *
 * 新增预订
 * ------------------------------------------------------------------ */

addBtn.addEventListener('click', () => {
  ['fDate','fEndDate','fStart','fEnd','fCustomer','fAmount','fNotes'].forEach(id => { $(id).value = ''; });
  $('formErr').classList.remove('show');
  $('formErr').textContent = '请填写日期、时间、顾客名称和金额。';
  selectedStatus = 'confirmed';
  statusToggle.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === 'confirmed'));
  overlay.classList.add('open');
});

cancelBtn.addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', (e) => { if(e.target === overlay) overlay.classList.remove('open'); });

saveBtn.addEventListener('click', async () => {
  const date = $('fDate').value;
  let endDate = $('fEndDate').value;
  const startTime = $('fStart').value;
  const endTime = $('fEnd').value;
  const customer = $('fCustomer').value.trim();
  const amount = $('fAmount').value;
  const notes = $('fNotes').value.trim();
  const formErr = $('formErr');

  if(!date || !startTime || !endTime || !customer || amount === ''){
    formErr.textContent = '请填写日期、时间、顾客名称和金额。';
    formErr.classList.add('show');
    return;
  }

  if(!endDate) endDate = date;

  if(endDate < date){
    formErr.textContent = '结束日期不能早于开始日期。';
    formErr.classList.add('show');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = '保存中…';
  try{
    await addDoc(collection(db, BOOKINGS), {
      date, endDate, startTime, endTime, customer,
      amount: Number(amount), notes,
      status: selectedStatus,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser.uid
    });
    overlay.classList.remove('open');
  }catch(e){
    console.error(e);
    formErr.textContent = writeErrorText(e);
    formErr.classList.add('show');
  }finally{
    saveBtn.disabled = false;
    saveBtn.textContent = '保存预订';
  }
});

/* ------------------------------------------------------------------ *
 * 新增支出
 * ------------------------------------------------------------------ */

addExpenseBtn.addEventListener('click', () => {
  ['xDate','xItem','xAmount'].forEach(id => { $(id).value = ''; });
  $('xErr').classList.remove('show');
  expenseOverlay.classList.add('open');
});

xCancelBtn.addEventListener('click', () => expenseOverlay.classList.remove('open'));
expenseOverlay.addEventListener('click', (e) => { if(e.target === expenseOverlay) expenseOverlay.classList.remove('open'); });

xSaveBtn.addEventListener('click', async () => {
  const date = $('xDate').value;
  const item = $('xItem').value.trim();
  const amount = $('xAmount').value;
  const xErr = $('xErr');

  if(!date || !item || amount === ''){
    xErr.textContent = '请填写日期、项目和金额。';
    xErr.classList.add('show');
    return;
  }

  xSaveBtn.disabled = true;
  xSaveBtn.textContent = '保存中…';
  try{
    await addDoc(collection(db, EXPENSES), {
      date, item, amount: Number(amount),
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser.uid
    });
    expenseOverlay.classList.remove('open');
  }catch(e){
    console.error(e);
    xErr.textContent = writeErrorText(e);
    xErr.classList.add('show');
  }finally{
    xSaveBtn.disabled = false;
    xSaveBtn.textContent = '保存支出';
  }
});

/* ------------------------------------------------------------------ *
 * 新增广告费
 * ------------------------------------------------------------------ */

const adOverlay = $('adOverlay');
const aSaveBtn = $('aSaveBtn');

$('aPlatform').innerHTML = AD_PLATFORMS.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');

$('addAdBtn').addEventListener('click', () => {
  const now = new Date();
  $('aMonth').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  $('aPlatform').value = AD_PLATFORMS[0];
  $('aAmount').value = '';
  $('aNotes').value = '';
  $('aErr').classList.remove('show');
  adOverlay.classList.add('open');
});

$('aCancelBtn').addEventListener('click', () => adOverlay.classList.remove('open'));
adOverlay.addEventListener('click', (e) => { if(e.target === adOverlay) adOverlay.classList.remove('open'); });

aSaveBtn.addEventListener('click', async () => {
  const month = $('aMonth').value;
  const platform = $('aPlatform').value;
  const amount = $('aAmount').value;
  const notes = $('aNotes').value.trim();
  const aErr = $('aErr');

  if(!/^\d{4}-\d{2}$/.test(month) || !platform || amount === ''){
    aErr.textContent = '请填写月份、平台和金额。';
    aErr.classList.add('show');
    return;
  }

  aSaveBtn.disabled = true;
  aSaveBtn.textContent = '保存中…';
  try{
    await addDoc(collection(db, ADSPEND), {
      month, platform, amount: Number(amount), notes,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser.uid
    });
    adOverlay.classList.remove('open');
  }catch(e){
    console.error(e);
    aErr.textContent = writeErrorText(e);
    aErr.classList.add('show');
  }finally{
    aSaveBtn.disabled = false;
    aSaveBtn.textContent = '保存';
  }
});

$('toggleAdList').addEventListener('click', () => {
  const list = $('adSpendList');
  const showing = list.style.display !== 'none';
  list.style.display = showing ? 'none' : 'block';
  $('toggleAdList').textContent = showing ? '显示广告费明细' : '隐藏广告费明细';
});

/* ------------------------------------------------------------------ *
 * 日历切换 / 折叠
 * ------------------------------------------------------------------ */

$('calPrev').addEventListener('click', () => {
  calMonth--; if(calMonth < 0){ calMonth = 11; calYear--; }
  selectedDateStr = null;
  renderCalendar();
});
$('calNext').addEventListener('click', () => {
  calMonth++; if(calMonth > 11){ calMonth = 0; calYear++; }
  selectedDateStr = null;
  renderCalendar();
});

toggleMonthly.addEventListener('click', () => {
  const showing = monthlyList.style.display !== 'none';
  monthlyList.style.display = showing ? 'none' : 'block';
  toggleMonthly.textContent = showing ? '显示' : '隐藏';
});

togglePast.addEventListener('click', () => {
  const showing = pastList.style.display !== 'none';
  pastList.style.display = showing ? 'none' : 'block';
  togglePast.textContent = showing ? '显示' : '隐藏';
});

/* ------------------------------------------------------------------ *
 * 导出 / 导入
 * ------------------------------------------------------------------ */

const exportOverlay = $('exportOverlay');
const exportText = $('exportText');
const exportCopyBtn = $('exportCopyBtn');

$('exportBtn').addEventListener('click', () => {
  exportText.value = JSON.stringify({ bookings, expenses, adSpend }, null, 2);
  exportOverlay.classList.add('open');
});

$('exportCloseBtn').addEventListener('click', () => exportOverlay.classList.remove('open'));
exportOverlay.addEventListener('click', (e) => { if(e.target === exportOverlay) exportOverlay.classList.remove('open'); });

exportCopyBtn.addEventListener('click', async () => {
  exportText.select();
  try{
    await navigator.clipboard.writeText(exportText.value);
    exportCopyBtn.textContent = '已复制！';
    setTimeout(() => { exportCopyBtn.textContent = '复制'; }, 2000);
  }catch(e){
    document.execCommand('copy');
  }
});

const importOverlay = $('importOverlay');
const importRunBtn = $('importRunBtn');

$('importBtn').addEventListener('click', () => {
  $('importText').value = '';
  $('importErr').classList.remove('show');
  importOverlay.classList.add('open');
});

$('importCloseBtn').addEventListener('click', () => importOverlay.classList.remove('open'));
importOverlay.addEventListener('click', (e) => { if(e.target === importOverlay) importOverlay.classList.remove('open'); });

importRunBtn.addEventListener('click', async () => {
  const importErr = $('importErr');
  importErr.classList.remove('show');

  let data;
  try{
    data = JSON.parse($('importText').value);
  }catch(e){
    importErr.textContent = '这段文字不是有效的 JSON，请重新复制一次。';
    importErr.classList.add('show');
    return;
  }

  const inBookings = Array.isArray(data.bookings) ? data.bookings : [];
  const inExpenses = Array.isArray(data.expenses) ? data.expenses : [];
  const inAdSpend = Array.isArray(data.adSpend) ? data.adSpend : [];
  if(!inBookings.length && !inExpenses.length && !inAdSpend.length){
    importErr.textContent = '找不到 bookings、expenses 或 adSpend 资料。';
    importErr.classList.add('show');
    return;
  }

  const uid = auth.currentUser.uid;
  const writes = [];
  for(const b of inBookings){
    if(!b || !b.date || !b.customer) continue;
    writes.push([BOOKINGS, {
      date: String(b.date),
      endDate: String(b.endDate || b.date),
      startTime: String(b.startTime || '00:00'),
      endTime: String(b.endTime || '00:00'),
      customer: String(b.customer),
      amount: Number(b.amount || 0),
      notes: String(b.notes || ''),
      status: b.status === 'tentative' ? 'tentative' : 'confirmed',
      createdAt: String(b.createdAt || new Date().toISOString()),
      createdBy: uid
    }]);
  }
  for(const x of inExpenses){
    if(!x || !x.date || !x.item) continue;
    writes.push([EXPENSES, {
      date: String(x.date),
      item: String(x.item),
      amount: Number(x.amount || 0),
      createdAt: String(x.createdAt || new Date().toISOString()),
      createdBy: uid
    }]);
  }
  for(const a of inAdSpend){
    if(!a || !/^\d{4}-\d{2}$/.test(a.month)) continue;
    writes.push([ADSPEND, {
      month: String(a.month),
      platform: String(a.platform || '其他'),
      amount: Number(a.amount || 0),
      notes: String(a.notes || ''),
      createdAt: String(a.createdAt || new Date().toISOString()),
      createdBy: uid
    }]);
  }

  if(!writes.length){
    importErr.textContent = '资料格式不符合，没有任何一笔可以导入。';
    importErr.classList.add('show');
    return;
  }

  importRunBtn.disabled = true;
  importRunBtn.textContent = '导入中…';
  try{
    // Firestore 一个 batch 最多 500 笔，分批送
    for(let i = 0; i < writes.length; i += 400){
      const batch = writeBatch(db);
      writes.slice(i, i + 400).forEach(([col, payload]) => {
        batch.set(doc(collection(db, col)), payload);
      });
      await batch.commit();
    }
    importOverlay.classList.remove('open');
    alert(`已导入 ${writes.length} 笔资料。`);
  }catch(e){
    console.error(e);
    importErr.textContent = writeErrorText(e);
    importErr.classList.add('show');
  }finally{
    importRunBtn.disabled = false;
    importRunBtn.textContent = '导入';
  }
});

// 转向 / 改视窗大小时重画图表
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if(allLoaded()) renderMarketing(); }, 150);
});
