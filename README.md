# 视频自动画中画 (Auto Picture-in-Picture)

利用浏览器原生属性与脚本逻辑相结合，实现的极致稳定、简洁的视频自动画中画工具。

## ✨ 核心功能

*   **🚀 自动开启**：切换浏览器标签页（Tab）或点击页面后离开浏览器时，可自动将正在播放的视频转入画中画；点击浏览器顶部扩展图标会被单独屏蔽。
*   **↩️ 自动恢复**：重新回到视频所在页面时，自动退出画中画并恢复原位播放。
*   **⌨️ 快捷键支持**：
    *   `P` 键：手动开启或关闭画中画（支持播放/暂停视频）。
    *   `Q` 键：切换**网页全屏**（视频铺满浏览器窗口）。
    *   `F` 键：在网页全屏状态下切换浏览器原生全屏，避免站点播放器二次全屏导致黑屏。
*   **🛡️ 运行稳定**：优先依赖浏览器自动 PiP 能力处理标签切换，并注册 Media Session 自动 PiP 处理器，同时对手动 PiP、回页退出和动态播放器做兼容增强。

## 💡 使用技巧（必读）

由于浏览器的安全限制，`requestPictureInPicture()` 需要**调用当下仍然有效的瞬时用户激活**。
*   `P` 键属于用户主动操作，适合手动开启/关闭 PiP。
*   标签切换主要依赖浏览器自动 PiP；Chrome 134+ 需要站点或脚本注册 `enterpictureinpicture` Media Session 处理器。
*   “先点一次页面，再切到别的应用自动入 PiP” 在 Chromium 中不可靠。

## 🛠 配置说明

脚本内置了简单的配置项（在代码顶部）：
```javascript
const CONFIG = {
    enabled: true,  // 是否启用
    debug: false,   // 是否在控制台输出运行日志
    autoPiPOnWindowBlur: true, // 点击页面后离开浏览器时尝试自动入 PiP
    nativeAutoPiPReturnMode: 'auto-close', // 原生自动 PiP 回页策略：auto-close 或 continuous
    nativeAutoPiPFallbackExitDelay: 600,   // auto-close 模式下等待浏览器自动退出的兜底延迟
    refreshVideoOnReturn: !isAliyunDrive   // 回页/退出 PiP 后是否主动刷新视频渲染层；阿里云盘默认关闭以减少卡顿
};
```

## 🔄 逻辑说明

| 动作 | 自动入 PiP | 自动出 PiP | 说明 |
| :--- | :--- | :--- | :--- |
| **切换标签页** | ✅ 是 | ✅ 是 | 极速响应，由浏览器原生处理 |
| **离开浏览器窗口** | ⚠️ 受浏览器策略限制 | ✅ 是 | 点击页面后尝试触发，浏览器工具栏失焦会被屏蔽 |
| **按 P 键** | ✅ 受控 | ✅ 受控 | 手动模式，支持所有视频状态 |

## 📦 安装方式

在使用本脚本前，请先安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。

### 方法 A：通过 GreasyFork 安装 (推荐)
1. [点击此处访问 GreasyFork 页面](https://greasyfork.org/zh-CN/scripts/562978-%E8%A7%86%E9%A2%91%E8%87%AA%E5%8A%A8%E7%94%BB%E4%B8%AD%E7%94%BB)。
2. 点击“安装此脚本”按钮即可。

### 方法 B：通过 GitHub 原地址安装
1. [点击此处访问脚本原地址](https://github.com/mankaki/video-auto-pip/raw/refs/heads/main/auto-pip.user.js)。
2. 浏览器通常会自动识别并弹出 Tampermonkey 安装确认页面。
3. 如果没有自动弹出，请手动全选复制页面代码，并在 Tampermonkey 中新建脚本粘贴保存。

## 📜 版本记录
*   **v4.13.33**: 修复芒果 TV 云导播直播按 `Q` 网页全屏时遗漏弹幕和统一音量控件的问题；完整直播容器原位全屏，保留多机位布局，支持 `Q` / `Esc` 退出和 `F` 原生全屏。
*   **v4.13.32**: 修复点击浏览器工具栏扩展图标、扩展弹窗打开时，网页的 `blur` 被误判为离开浏览器而自动进入画中画。现在会在鼠标从页面顶部进入浏览器 UI 后屏蔽失焦，并在鼠标回到页面后恢复；点击页面后 Alt-Tab 等正常离开窗口的自动 PiP 保持启用。
*   **v4.13.31**: B 站手动按 `P` 时优先使用当前播放器的站内画中画按钮，并在整个播放器文档捕获任意 Video PiP 与 Document PiP 成功事件，兼容 B 站替换或克隆视频节点；手动切换确认期间会忽略重复 `P`，防止重复请求。站内按钮未真正进入且用户激活仍有效时转入原生兜底；新版小窗关闭后恢复自动 PiP，自动场景继续使用稳定的 Chromium Video PiP。
*   **v4.13.13**: 修复视频位于同源 iframe 时，焦点停留在外层页面按 `P` 无法进入或退出画中画的问题；快捷键现在会递归查找同源 iframe 中的播放器。
*   **v4.13.12**: 修复先按 `Q` 进入网页全屏、再按 `F` 进入原生全屏时可能黑屏的问题；网页全屏状态下由脚本接管 `F` 并同步全屏布局。
*   **v4.13.11**: 将脚本提前到 `document-start` 注入以尽早 hook Media Session；页面设置或清空 `enterpictureinpicture` handler 都视为页面接管，避免覆盖站点自己的 PiP 策略。
*   **v4.13.10**: 包装 `navigator.mediaSession.setActionHandler`，当页面后续接管 `enterpictureinpicture` 时不再反复覆盖，并修复脚本 handler 被页面清除后状态标记失真的问题。
*   **v4.13.9**: 注册 `navigator.mediaSession.setActionHandler('enterpictureinpicture', ...)`，修复部分 Chromium 中第一次切换标签页也不会自动进入画中画的问题。
*   **v4.13.8**: 收敛近期兼容性调整：阿里云盘进入快捷键-only 模式以降低播放卡顿并保留 `P`/`Q`；`Q` 网页全屏改用播放器容器覆盖层以保留控件；B 站评论框和常见富文本输入区输入 `p`/`q` 时不再误触发快捷键。
*   **v4.9.4**: 修复切回视频页后画中画退出但画面黑屏、只剩声音的问题。回页退出改为去抖调度避免抢跑，并在 `leavepictureinpicture` 后主动刷新视频渲染层。
*   **v4.9.3**: 修正手势模型说明与日志。改为基于真实 `navigator.userActivation` 判断是否可调用 `requestPictureInPicture()`，避免把“曾经点击过页面”误判为可长期复用的授权；补充 Chromium 在“切到别的应用”场景下的限制提示。
*   **v4.8.3**: 骨灰级性能与鲁棒性调优。重构 ResizeObserver 为单一实例避免内存泄漏；引入防抖机制控制 MutationObserver 防止大规模 DOM 变动时的帧率掉底；修复点击页面 iframe 误触画中画；添加返回原页兜底退出、ESC 退出网页全屏及所有触屏手势响应的支持。
*   **v4.8.2**: 可靠性大幅调优。交互保护策略缩短为 300ms（解决 ALT-TAB 失效），增强 Shadow DOM 监测及 playing 属性守护。
*   **v4.8**: 兼容性大跃进。支持 Shadow DOM 深度扫描、启用 `@allFrames` 穿透 iframe、优化动态加载视频检测。
*   **v4.7**: 引入特定站点(MGTV)兼容性优化。
*   **v4.6**: 网页全屏功能 (Q 键) 及交互防崩溃优化 (1s 冷却)。

## ⚠️ 已知问题
*   **芒果TV (mgtv.com)**：由于该站播放器极重且包含大量统计/广告脚本，若仍有崩溃，请尝试在脚本配置中将 `debug` 设为 `false` 。
*   **iframe 播放器**：已支持检测，但受同源与手势策略限制，自动入 PiP 可能仍需在 iframe 内部先交互一次。

---
**Enjoy watching!** 🍿
