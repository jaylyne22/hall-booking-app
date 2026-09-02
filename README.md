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
firebase.json         Firebase Hosting / 模拟器设定（选用）
.firebaserc           指定 Firebase 专案 (cpt-traning-hall)
.github/workflows/
  pages.yml           部署到 GitHub Pages（手动，备用）
  deploy.yml          部署到 Firebase Hosting（手动，备用）
```

**线上网址：<https://cpt-hall-booking.vercel.app>**（Vercel 托管）

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

> ⚠️ 只换大括号里的值，**开头的 `export` 不能删掉** —— Console 复制出来的那段
> 是写 `const firebaseConfig = {`，少了 `export`，`app.js` 就读不到设定，
> 网页会整片空白。

> 这几个值不是密码，放在公开网页里没问题 —— 真正挡人的是下一步的安全规则。

### 4. 部署安全规则

规则决定「谁能读写资料」。**没做这一步，Firestore 还停在预设状态。**
这一步不用任何工具：

1. Firebase Console → **Firestore Database → 规则（Rules）分页**。
2. 把这个仓库里 [`firestore.rules`](firestore.rules) 的**整份内容**复制，
   覆盖编辑器里原本的东西。
3. 按 **发布（Publish）**。

之后规则有改，回来重贴一次就好。

### 5. 网站已经上线了

网站跑在 Vercel 上：

**<https://cpt-hall-booking.vercel.app>**

手机浏览器打开，加到主画面，用起来就像一个 app。

> 目前 Vercel 还没跟 GitHub 连起来，所以**在 GitHub 上改档案不会自动更新网站**。
> 要打开自动更新：Vercel → 该专案 → Settings → Git → Connect Git Repository，
> 选 `jaylyne22/hall-booking-app`，Root Directory 填 `public`。
> 连好之后每次 Commit 就会自动重新部署。

### 6. 把网址加进 Firebase 授权网域（不做就登不进去）

Firebase 预设只让自家网域登入，Vercel 的网址要手动加：

**Authentication → Settings（设定）→ 授权网域（Authorized domains）→
新增网域 → 填 `cpt-hall-booking.vercel.app`**

漏了这步，登入时会跳 `auth/unauthorized-domain`（app 里会直接告诉你要加哪个网域）。

### 7. 开帐号 + 加进 members 名单（每位同事各做一次）

先在 **Authentication → Users → 新增使用者** 填电邮和密码建立帐号。

接着不用去翻 UID —— 直接用那个帐号登入这个 app。
因为还没进名单，画面上方会出现一条红字，**里面就印着这个帐号的 UID，旁边有「复制」按钮**：

> 这个帐号还没被加进 `members` 名单，所以看不到资料。
> 请到 Firebase Console → Firestore Database → `members` 集合，
> 新增一份文件，文件 ID 填下面这一串：`xxxxxxxx…` 〔复制〕

照着做：**Firestore Database → 开始收集 → 集合 ID 填 `members` →
新增文件 → 文件 ID 贴上刚复制的那串**。栏位可以随便加一个方便辨认，
例如 `name` (string) = `阿明`。储存后重新整理网页，资料就出来了。

之后要收回某人的权限，删掉他的 `members` 文件即可（帐号还在，但看不到资料）。

### 8. 之后要改东西

直接在 GitHub 网页上编辑档案 → Commit changes → Actions 自动重新部署。
想知道成功没有，看 **Actions** 分页：绿色勾勾是成功，红色叉叉点进去看错误讯息。

---

## 仓库是公开的，资料会外流吗？

不会 —— 但要知道界线在哪：

| 东西 | 公开看得到吗 | 有关系吗 |
|---|---|---|
| `firebaseConfig` 那七个值 | 看得到 | 没关系，这是设计上就公开的 |
| `firestore.rules` | 看得到 | 没关系，规则本来就该经得起被看 |
| **预订／支出资料** | **看不到** | 存在 Firestore，不在仓库里 |
| 帐号密码 | 看不到 | 存在 Firebase Authentication |

陌生人拿到那七个值，最多只能连到你的专案，然后**被规则挡在门外** ——
因为规则要求「必须是 `members` 集合里的 UID」，而 `members` 只有你能在 Console 加。

### 建议再做一层（可选）

因为 API 金钥公开了，别人虽然拿不到资料，但可以拿它去消耗你的免费额度。
把金钥锁在你自己的网域就好：

**[Google Cloud Console → 凭证](https://console.cloud.google.com/apis/credentials?project=cpt-traning-hall)
→ 点那把 Browser key → 应用程式限制选「HTTP 参照网址」→ 加入：**

```
cpt-hall-booking.vercel.app/*
cpt-traning-hall.firebaseapp.com/*
```

加完等几分钟生效。如果之后换了网址，记得回来补。

---

## 想换别的托管？

Vercel 已经够用了。仓库里另外留了两条手动的部署流程当备用：
`pages.yml`（GitHub Pages，需要先在 Settings → Pages 把 Source 选成 GitHub Actions）、
`deploy.yml`（Firebase Hosting）。真的想换到 Firebase Hosting（例如想要
`cpt-traning-hall.web.app` 这个网址），
仓库里的 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 就是干这个的，
它是手动触发的，需要先设一个 `FIREBASE_SERVICE_ACCOUNT` secret：

1. [Google Cloud Console → 服务帐户](https://console.cloud.google.com/iam-admin/serviceaccounts?project=cpt-traning-hall)
   → 建立服务帐户，角色给 **Firebase Admin** + **Service Usage Consumer**
2. 进去 → 金钥 → 新增金钥 → **JSON** → 下载
3. GitHub → Settings → Secrets and variables → Actions → New repository secret
   - Name：`FIREBASE_SERVICE_ACCOUNT`，Secret：整份 JSON
4. Actions → Deploy to Firebase → Run workflow

> 🔒 那份 JSON **是真的密码**，跟 `firebaseConfig` 完全不同。
> 不要 commit、不要贴给任何人，只放 GitHub Secrets。
> 记得把新网域也加进步骤 6 的授权网域。

### 如果你之后有电脑可以装工具

```bash
npm install -g firebase-tools
firebase login
firebase deploy          # .firebaserc 已经指定好专案
```

---

## 把旧资料搬过来

1. 打开旧版那个 HTML，按 **导出资料**，整段复制。
2. 在新版按 **导入资料**，贴上，按导入。

导入只做「新增」，同一段资料贴两次会变成两份，所以只做一次就好。

---

## 常见问题

**登入后画面顶端出现红字「还没被加进 members 名单」**
这是正常的第一步 —— 照红字里的 UID 做步骤 5 就好。如果做了还是出现，
表示文件 ID 打错了：必须**完全等于**红字里那一串，前后不能有空格。

**网页整片空白，Console 出现 `does not provide an export named 'firebaseConfig'`**
`public/firebase-config.js` 开头的 `export` 被删掉了，补回去。

**`auth/operation-not-allowed`**
步骤 2 的电邮／密码登入没开启。

**把 `index.html` 下载下来双击打开，整片空白**
不能用 `file://` 直接开，浏览器会挡掉 ES modules。一定要用步骤 5 的网址。

**登入时跳 `auth/unauthorized-domain`**
步骤 6 没做 —— 网址没加进 Firebase 的授权网域。app 的错误讯息会直接印出要加哪一个。

**改了 `firestore.rules` 之后没生效**
规则不会跟着 Pages 一起走。改完要回 Firebase Console 的规则分页重贴一次并按发布。

**在 GitHub 改了档案，但网站没变**
Vercel 还没跟 GitHub 连起来（见步骤 5 的灰框）。连起来之前，改动只会留在仓库里。

---

## 之后可以做的（还没做）

- **编辑**已存在的预订（目前只能新增和删除）。
- **撞期检查**：同一天同时段已有确定预订时提醒。
- **月结报表**把支出扣进 GP，算真正的净利。
- **假期表**目前写死在 `app.js` 的 `HOLIDAYS`，2027 年是预测值，
  官方公布后要手动更新，或改成存进 Firestore 由你在后台维护。
