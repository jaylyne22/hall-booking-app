// Firebase 网页设定 —— 从 Firebase Console 复制过来贴在这里。
// 路径：Firebase Console → 专案设定 (⚙) → 一般 → 你的应用程式 → SDK 设定与配置 → 配置
//
// 这几个值不是密码，可以放在公开的网页里。真正保护资料的是 firestore.rules
// 里的规则 + 登入帐号，所以规则一定要照 README 部署上去。
export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
