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
.firebaserc           指定 Firebase 专案 (cpt-traning-hall)
.github/workflows/    GitHub 自动部署
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

> ⚠️ 只换大括号里的值，**开头的 `export` 不能删掉** —— Console 复制出来的那段
> 是写 `const firebaseConfig = {`，少了 `export`，`app.js` 就读不到设定，
> 网页会整片空白。

> 这几个值不是密码，放在公开网页里没问题 —— 真正挡人的是下一步的安全规则。

### 4. 部署安全规则（两种做法，选一种）

规则决定「谁能读写资料」。**没做这一步，Firestore 还停在预设状态。**

#### 做法 A：直接在 Firebase Console 贴（最快，先用这个）

1. **Firestore Database → 规则（Rules）分页**。
2. 把这个仓库里 [`firestore.rules`](firestore.rules) 的**整份内容**复制，
   覆盖编辑器里原本的东西。
3. 按 **发布（Publish）**。

一分钟搞定，不用装任何工具。之后规则有改，回来重贴一次就好。

#### 做法 B：让 GitHub 自动部署（顺便解决网站上线）

仓库里已经有 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。
设定好之后，**每次你在 GitHub 网页上改档案存档，它就自动把网站和规则一起部署**，
你完全不用碰指令列。

一次性设定（全部在浏览器）：

1. 到 **Google Cloud Console → IAM 与管理 → 服务帐户**
   （<https://console.cloud.google.com/iam-admin/serviceaccounts?project=cpt-traning-hall>）。
2. **建立服务帐户**，名称随便打，例如 `github-deploy`。
3. 授予角色：**Firebase Admin**，再加一个 **Service Usage Consumer**。建立完成。
4. 点进那个帐户 → **金钥（Keys）→ 新增金钥 → 建立新的金钥 → JSON**，会下载一个 `.json` 档。
5. 用记事本之类的打开那个档案，**整份内容**复制起来。
6. 回到 GitHub 这个仓库 → **Settings → Secrets and variables → Actions →
   New repository secret**。
   - Name：`FIREBASE_SERVICE_ACCOUNT`
   - Secret：贴上刚才整份 JSON
7. 到 **Actions** 分页 → 左边选 **Deploy to Firebase** → 右边 **Run workflow**。

> 🔒 **这份 JSON 是真的密码**，跟前面的 `firebaseConfig` 不一样。
> 不要 commit 进仓库、不要贴在聊天室、不要传给任何人。只放进 GitHub Secrets。
> 万一外流了，回到步骤 4 的金钥页面把那把金钥删掉再重建一把。

### 5. 开帐号 + 加进 members 名单（每位同事各做一次）

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

### 6. 网址

做法 B 跑成功之后，网址是：

- <https://cpt-traning-hall.web.app>
- <https://cpt-traning-hall.firebaseapp.com>

手机浏览器打开，加到主画面，用起来就像一个 app。

### 7. 之后要改东西

直接在 GitHub 网页上编辑档案 → Commit changes → Actions 自动重新部署，
大概一两分钟后重新整理网页就看到新版。

想知道部署成功没有，看 **Actions** 分页：绿色勾勾是成功，红色叉叉点进去看错误讯息。

### 补充：如果你之后有电脑可以装工具

```bash
npm install -g firebase-tools
firebase login
firebase deploy          # .firebaserc 已经指定好专案，不用再 use --add
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
不能用 `file://` 直接开，浏览器会挡掉 ES modules。一定要用步骤 6 的网址。

**改了 `firestore.rules` 之后没生效**
用做法 A 的话，改完要回 Console 重贴一次并按发布。用做法 B 的话，
存档后去 Actions 分页确认那次部署是绿色勾勾。

**Actions 跑出红色叉叉**
点进去看最后一步的讯息：
- `找不到 FIREBASE_SERVICE_ACCOUNT secret` → 步骤 4 做法 B 的第 6 点没做完。
- `Permission denied` / `caller does not have permission` → 服务帐户角色不够，
  回步骤 4 做法 B 第 3 点补上 **Firebase Admin**。
- `开头必须是 export const firebaseConfig` → 设定档的 `export` 被删掉了。

---

## 之后可以做的（还没做）

- **编辑**已存在的预订（目前只能新增和删除）。
- **撞期检查**：同一天同时段已有确定预订时提醒。
- **月结报表**把支出扣进 GP，算真正的净利。
- **假期表**目前写死在 `app.js` 的 `HOLIDAYS`，2027 年是预测值，
  官方公布后要手动更新，或改成存进 Firestore 由你在后台维护。
