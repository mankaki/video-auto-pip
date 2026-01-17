// ==UserScript==
// @name         视频自动画中画
// @namespace    http://tampermonkey.net/
// @version      4.5.1
// @description  利用原生属性实现的高稳定性自动画中画。支持标签页切换、窗口失焦触发及回页自动退出。
// @author       mankaki
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        enabled: true,
        debug: true
    };

    let hasUserGesture = false;

    function log(type, ...args) {
        if (!CONFIG.debug) return;
        const prefix = '[自动画中画]';
        if (type === 'warn') console.warn(prefix, ...args);
        else if (type === 'error') console.error(prefix, ...args);
        else console.log(prefix, ...args);
    }

    async function exitPiP() {
        if (document.pictureInPictureElement) {
            try {
                await document.exitPictureInPicture();
                log('info', '返回页面, 自动退出画中画');
            } catch (err) { }
        }
    }

    async function enterPiP(video, trigger) {
        if (!video || document.pictureInPictureElement) return;

        try {
            await video.requestPictureInPicture();
            log('info', `成功通过 [${trigger}] 开启画中画`);
        } catch (err) {
            if (err.message.includes('user gesture')) {
                log('warn', `受限于浏览器安全策略, [${trigger}] 触发需先在页面内点击一次。`);
                if (!hasUserGesture) {
                    console.log(
                        '%c 👉 💡 提示: 请在网页任意位置点击一下，即可激活“自动画中画”功能！ ',
                        'background: #ffcc00; color: #000; font-weight: bold; padding: 5px; border-radius: 3px;'
                    );
                }
            } else {
                log('error', `${trigger} 失败:`, err.message);
            }
        }
    }

    function setupVideo(video) {
        if (video.dataset.pipObserved) return;
        video.dataset.pipObserved = 'true';

        // 原生属性: 针对标签页切换的最稳方案
        video.autoPictureInPicture = true;

        video.addEventListener('play', () => {
            video.autoPictureInPicture = true;
        });
    }

    function scanVideos() {
        document.querySelectorAll('video').forEach(setupVideo);
    }

    async function toggleManualPiP() {
        if (document.pictureInPictureElement) {
            await exitPiP();
            return;
        }

        const allVideos = Array.from(document.querySelectorAll('video')).filter(v => v.readyState >= 2);
        if (allVideos.length === 0) return;

        // 优先选择播放中的, 其次选择页面第一个(支持暂停视频)
        let target = allVideos.find(v => !v.paused) || allVideos[0];
        if (target) await enterPiP(target, '快捷键 P');
    }

    document.addEventListener('keydown', (e) => {
        if ((e.key === 'p' || e.key === 'P') &&
            !['INPUT', 'TEXTAREA'].includes(e.target.tagName) &&
            !e.target.isContentEditable) {
            toggleManualPiP();
        }
    }, true);

    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.tagName === 'VIDEO') setupVideo(node);
            else if (node.querySelectorAll) node.querySelectorAll('video').forEach(setupVideo);
        }));
    });

    // 监听窗口失焦 (App 切换)
    window.addEventListener('blur', () => {
        if (!CONFIG.enabled || document.pictureInPictureElement || document.hidden) return;
        const playing = Array.from(document.querySelectorAll('video')).find(v => !v.paused);
        if (playing) enterPiP(playing, '窗口失焦');
    });

    // 监听窗口聚焦 (切回页面)
    window.addEventListener('focus', () => {
        if (!CONFIG.enabled) return;
        setTimeout(() => {
            if (document.hasFocus()) exitPiP();
        }, 200);
    });

    // 监听可见性变化 (针对切回标签页时的原生恢复逻辑)
    document.addEventListener('visibilitychange', () => {
        if (!CONFIG.enabled) return;
        if (!document.hidden) log('info', '检测到返回, 正在恢复视频...');
    });

    function init() {
        log('info', '脚本已加载 v4.5.1');
        scanVideos();
        observer.observe(document.body, { childList: true, subtree: true });

        document.addEventListener('mousedown', () => {
            hasUserGesture = true;
            log('info', '手势已激活, 自动触发功能已就绪。');
        }, { once: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
