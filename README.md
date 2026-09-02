# CPT Traning Hall — 订场管理 (Firebase)

订场、支出、月结统计的小应用。资料存在 **Cloud Firestore**，团队成员登入后
即时共用同一份资料 —— 一个人新增，其他人的画面马上更新。

```
public/
  index.html          界面
  styles.css          样式
  app.js              程式逻辑 + Firestore 同步
  firebase-config.js  ← 你要填的 Firebase 设定
firestore.rules       安全规则（谁可以读写）
firebase.json         Hosting / Firestore / 模拟器设定
```

---

## 从旧版有什么改变

| | 旧版 | 现在 |
|---|---|---|
| 存放位置 | `window.storage` 两大包 JSON | Firestore，每笔预订／支出各一份文件 |
| 多人同时用 | 后存的覆盖先存的 | 每笔独立，不会互相覆盖 |
| 更新 | 要重新整理 | `onSnapshot` 即时推送 |
| 权限 | 无 | 登入 + `members` 名单 |
| 离线 | 不行 | 本机快取，断线可看，回线自动同步 |

资料结构：

```jsonc
// bookings/{自动ID}
{
  "date": "2026-03-14", "endDate": "2026-03-14",
  "startTime": "18:00",  "endTime": "22:00",
  "customer": "陈家生日会", "amount": 350, "notes": "",
  "status": "confirmed",          // 或 "tentative"
  "createdAt": "2026-03-01T…", "createdBy": "<uid>"
}

// expenses/{自动ID}
{ "date": "2026-03-02", "item": "桌布", "amount": 120,
  "createdAt": "…", "createdBy": "<uid>" }
```

---

## 设定步骤

### 1. 建立 Firebase 专案

1. 到 <https://console.firebase.google.com> → **新增专案**（名称例如 `cpt-hall`）。
   Google Analytics 可以不开。
2. 左侧 **建构 → Firestore Database → 建立资料库**。
   - 位置选 **asia-southeast1 (Singapore)**，离马来西亚最近。
   - 模式选 **正式版模式**（production mode）。等一下会用我们自己的规则覆盖。

### 2. 开启电邮／密码登入

**建构 → Authentication → 开始使用 → 电子邮件/密码 → 启用 → 储存**。

> 不要开「电子邮件连结（无密码登入）」，也不要开自助注册以外的其他方式。
> 帐号一律由你在后台手动开，见步骤 5。

### 3. 把设定贴进 `firebase-config.js`

**专案设定 (⚙) → 一般 → 你的应用程式 → 新增应用程式 → 网页 (`</>`)**，
取个暱称，**不用**勾 Firebase Hosting（等一下用 CLI 设定）。

复制画面上 `firebaseConfig = { … }` 里的值，覆盖 `public/firebase-config.js`
里的 `PASTE_…` 占位字串。

> 这几个值不是密码，放在公开网页里没问题 —— 真正挡人的是下一步的安全规则。

### 4. 部署安全规则

安装 CLI 并登入（只需一次）：

```bash
npm install -g firebase-tools
firebase login
```

在专案资料夹里绑定你的 Firebase 专案，然后送出规则：

```bash
cd hall-booking-app
firebase use --add          # 选你刚建立的专案，别名填 default
firebase deploy --only firestore:rules
```

规则的意思：**只有出现在 `members` 集合里的登入帐号**才能读写
`bookings` 和 `expenses`，其余一律拒绝。

### 5. 开帐号 + 加进 members 名单（每位同事各做一次）

1. **Authentication → Users → 新增使用者**，填电邮和密码，建立。
2. 复制那一列的 **使用者 UID**。
3. **Firestore Database → 开始收集 → 集合 ID 填 `members`**。
4. 新增文件，**文件 ID 就贴刚才的 UID**，栏位可以随便加一个方便辨认，例如
   `name` (string) = `阿明`。储存。

之后要收回某人的权限，删掉他的 `members` 文件即可（帐号还在，但看不到资料）。

### 6. 本机试跑

ES modules 不能用 `file://` 直接开，要起一个小伺服器：

```bash
firebase serve --only hosting     # http://localhost:5000
# 或者
npx serve public
```

用步骤 5 建的帐号登入，试着新增一笔预订，再开另一个浏览器视窗登入同一帐号 ——
应该马上同步出现。

### 7. 部署上线

```bash
firebase deploy --only hosting
```

完成后会给你一个 `https://<专案>.web.app` 的网址，手机浏览器加到主画面就像 app 一样。

以后要一次送出规则和网站：

```bash
firebase deploy
```

---

## 把旧资料搬过来

1. 打开旧版那个 HTML，按 **导出资料**，整段复制。
2. 在新版按 **导入资料**，贴上，按导入。

导入只做「新增」，同一段资料贴两次会变成两份，所以只做一次就好。

---

## 常见问题

**登入后画面顶端出现红字「还没被加进 members 名单」**
步骤 5 的 `members` 文件没建，或文件 ID 打错。文件 ID 必须**完全等于**
Authentication 里的 UID。

**`auth/operation-not-allowed`**
步骤 2 的电邮／密码登入没开启。

**打开网页整片空白，Console 出现 CORS 或 module 错误**
你用 `file://` 直接开了。要照步骤 6 起伺服器。

**改了 `firestore.rules` 之后没生效**
规则不会随 hosting 一起走，要另外 `firebase deploy --only firestore:rules`。

---

## 之后可以做的（还没做）

- **编辑**已存在的预订（目前只能新增和删除）。
- **撞期检查**：同一天同时段已有确定预订时提醒。
- **月结报表**把支出扣进 GP，算真正的净利。
- **假期表**目前写死在 `app.js` 的 `HOLIDAYS`，2027 年是预测值，
  官方公布后要手动更新，或改成存进 Firestore 由你在后台维护。
