// ==UserScript==
// @name         视频自动画中画
// @namespace    http://tampermonkey.net/
// @version      4.9.7
// @description  自动画中画，支持标签页切换、窗口失焦触发、回页自动退出，支持网页全屏
// @author       mankaki
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @allFrames    true
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        enabled: true,
        debug: true,
        isMgtv: location.hostname.includes('mgtv.com')
    };

    let hasEverInteracted = false;
    let iframeBlurPending = false; // 标记：是否刚点击了 iframe 等嵌入元素（可能导致假 blur）
    let webFullscreenSession = null;
    let returnToPageTimer = null;
    let lastPipVideo = null;

    // 网页全屏样式注入
    const style = document.createElement('style');
    style.textContent = `
        .pip-web-fullscreen-container {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 2147483647 !important;
            background: #000 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        .pip-web-fullscreen-container video {
            width: 100% !important;
            height: 100% !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            object-fit: contain !important;
        }
        .pip-web-fs-player {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 2147483647 !important;
            background: #000 !important;
        }
        body.pip-web-fs-active {
            overflow: hidden !important;
        }
        .pip-web-fullscreen-anchor {
            display: none !important;
        }
    `;
    document.head.appendChild(style);

    function log(type, ...args) {
        if (!CONFIG.debug) return;
        const prefix = `[自动画中画][${location.hostname}]`;
        if (type === 'warn') console.warn(prefix, ...args);
        else if (type === 'error') console.error(prefix, ...args);
        else console.log(prefix, ...args);
    }

    let lastActionTime = 0;
    const ACTION_COOLDOWN = 500; // 调优：减少冷却时间，响应更快速

    function getActivationState() {
        const activation = navigator.userActivation;
        return {
            isActive: !!activation?.isActive,
            hasBeenActive: !!activation?.hasBeenActive
        };
    }

    function scheduleReturnToPageExit(delay = 180) {
        if (!CONFIG.enabled) return;
        if (returnToPageTimer) clearTimeout(returnToPageTimer);
        returnToPageTimer = setTimeout(() => {
            returnToPageTimer = null;
            if (document.hidden || !document.hasFocus()) return;
            exitPiP();
        }, delay);
    }

    function refreshVideoRendering(video) {
        if (!video || !video.isConnected) return;
        if (video.readyState >= 2) {
            video.currentTime = video.currentTime;
        }
        video.style.transform = 'translateZ(0)';
        void video.offsetHeight;
        requestAnimationFrame(() => {
            if (!video.isConnected) return;
            video.style.removeProperty('transform');
        });
    }

    async function exitPiP() {
        if (!CONFIG.enabled || Date.now() - lastActionTime < ACTION_COOLDOWN) return;
        if (document.pictureInPictureElement) {
            try {
                lastActionTime = Date.now();
                await document.exitPictureInPicture();
                log('info', '返回页面, 自动退出画中画');
            } catch (err) { }
        }
    }

    async function enterPiP(video, trigger) {
        const activation = getActivationState();
        log('info', `>>> enterPiP 调用: trigger=${trigger}, hasVideo=${!!video}, alreadyPiP=${!!document.pictureInPictureElement}, cooldown=${Date.now() - lastActionTime}ms, activation=${activation.isActive}/${activation.hasBeenActive}`);
        if (!video || document.pictureInPictureElement || Date.now() - lastActionTime < ACTION_COOLDOWN) {
            log('info', `>>> enterPiP 被拦截: noVideo=${!video}, alreadyPiP=${!!document.pictureInPictureElement}, inCooldown=${Date.now() - lastActionTime < ACTION_COOLDOWN}`);
            return;
        }
        if (trigger.startsWith('窗口失焦') && !activation.isActive) {
            log('warn', '窗口失焦时当前没有瞬时用户激活，跳过 requestPictureInPicture 调用；若是标签切换，交给浏览器原生 autoPictureInPicture 处理。');
            return;
        }
        try {
            lastActionTime = Date.now();
            await video.requestPictureInPicture();
            log('info', `成功通过 [${trigger}] 开启画中画`);
        } catch (err) {
            lastActionTime = 0; // 失败时重置冷却，允许立即重试
            log('error', `>>> enterPiP 异常: ${err.name}: ${err.message}`);
            const isGestureError = err.name === 'NotAllowedError' || err.message.includes('user gesture');
            if (isGestureError) {
                const latestActivation = getActivationState();
                log('warn', `受限于安全策略, [${trigger}] 调用当下缺少瞬时用户激活: activation=${latestActivation.isActive}/${latestActivation.hasBeenActive}, everInteracted=${hasEverInteracted}`);
                if (trigger.startsWith('窗口失焦')) {
                    log('warn', '当前 Chromium 策略下，切到别的应用时无法复用之前的页面点击手势；标签切换可继续依赖原生 autoPictureInPicture。');
                } else if (!hasEverInteracted) {
                    console.log('%c 提示: 请先与页面交互，再使用快捷键 P 手动触发画中画。', 'background: #ffcc00; color: #000; font-weight: bold; padding: 5px;');
                }
            } else {
                log('error', `${trigger} 失败:`, err.message);
            }
        }
    }

    // 深度搜索视频元素 (支持 Shadow DOM)
    function findVideosDeep(root = document) {
        let videos = Array.from(root.querySelectorAll('video'));
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.shadowRoot) {
                videos = videos.concat(findVideosDeep(node.shadowRoot));
            }
        }
        return videos;
    }

    // 全局单例重置尺寸监听器，避免为每个未达到尺寸的视频单独创建而引发内存泄露
    const SharedResizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            const video = entry.target;
            if (width >= 200 || height >= 150) {
                applyPipConfig(video);
                SharedResizeObserver.unobserve(video);
            }
        }
    });

    function applyPipConfig(video) {
        if (video.dataset.pipObserved) return;
        video.dataset.pipObserved = 'true';

        // 属性强效守护：确保 autoPictureInPicture 始终启用
        const enforceNative = () => {
            if (video.autoPictureInPicture !== true) {
                video.autoPictureInPicture = true;
                log('debug', '重新锁定原生自动画中画属性');
            }
        };

        enforceNative();
        video.addEventListener('play', enforceNative);
        video.addEventListener('playing', enforceNative);

        log('info', '检测到有效播放器, 已应用配置');
    }

    function setupVideo(video) {
        if (!video || video.dataset.pipObserved) return;

        if (video.offsetWidth >= 200 || video.offsetHeight >= 150) {
            applyPipConfig(video);
        } else {
            // 如果尺寸不够，交给全局监听器，不要在此新建监听
            SharedResizeObserver.observe(video);
        }
    }

    function scanVideos() {
        findVideosDeep().forEach(setupVideo);
    }

    async function toggleManualPiP() {
        if (document.pictureInPictureElement) {
            await exitPiP();
            return;
        }
        const allVideos = findVideosDeep().filter(v => v.readyState >= 2);
        if (allVideos.length === 0) return;
        let target = allVideos.find(v => !v.paused) || allVideos[0];
        if (target) await enterPiP(target, '快捷键 P');
    }

    function findPlayerContainer(video) {
        let el = video.parentElement;
        let candidate = null;
        while (el && el !== document.body) {
            const id = (el.id || '').toLowerCase();
            const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
            if (/player/.test(id) || /player/.test(cls)) candidate = el;
            el = el.parentElement;
        }
        return candidate;
    }

    function exitWebFullscreen() {
        if (!webFullscreenSession) return;
        const { mode } = webFullscreenSession;

        if (mode === 'inplace') {
            const { container, previousStyle, chain } = webFullscreenSession;
            container.classList.remove('pip-web-fs-player');
            if (previousStyle === null) container.removeAttribute('style');
            else container.setAttribute('style', previousStyle);
            chain.forEach(({ el, prev }) => {
                if (prev === null) el.removeAttribute('style');
                else el.setAttribute('style', prev);
            });
            window.dispatchEvent(new Event('resize'));
        } else {
            const { video, anchor, overlay, previousInlineStyle } = webFullscreenSession;
            const fallbackParent = anchor?.parentNode || document.body;
            if (anchor?.parentNode) {
                anchor.parentNode.insertBefore(video, anchor);
                anchor.remove();
            } else if (overlay?.contains(video)) {
                fallbackParent.appendChild(video);
            }
            overlay?.remove();
            if (previousInlineStyle === null) video.removeAttribute('style');
            else video.setAttribute('style', previousInlineStyle);
        }

        document.body.classList.remove('pip-web-fs-active');
        webFullscreenSession = null;
        log('info', '退出网页全屏');
    }

    function toggleWebFullscreen() {
        const allVideos = findVideosDeep().filter(v => v.readyState >= 2);
        if (allVideos.length === 0) return;
        let video = allVideos.find(v => !v.paused) || allVideos[0];
        if (!video) return;

        if (webFullscreenSession?.video === video) {
            exitWebFullscreen();
            return;
        }
        if (webFullscreenSession) exitWebFullscreen();

        const container = findPlayerContainer(video);
        document.body.classList.add('pip-web-fs-active');

        if (container) {
            const previousStyle = container.getAttribute('style');
            container.classList.add('pip-web-fs-player');
            const chain = [];
            let el = video.parentElement;
            while (el && el !== container) {
                chain.push({ el, prev: el.getAttribute('style') });
                el.style.setProperty('width', '100%', 'important');
                el.style.setProperty('height', '100%', 'important');
                el = el.parentElement;
            }
            window.dispatchEvent(new Event('resize'));
            webFullscreenSession = { video, container, previousStyle, chain, mode: 'inplace' };
            log('info', '进入网页全屏 (播放器容器模式)');
        } else {
            const parent = video.parentNode;
            if (!parent) return;
            const anchor = document.createElement('div');
            anchor.className = 'pip-web-fullscreen-anchor';
            const overlay = document.createElement('div');
            overlay.className = 'pip-web-fullscreen-container';
            const previousInlineStyle = video.getAttribute('style');
            parent.insertBefore(anchor, video);
            overlay.appendChild(video);
            document.body.appendChild(overlay);
            video.style.removeProperty('max-width');
            video.style.removeProperty('max-height');
            video.style.removeProperty('width');
            video.style.removeProperty('height');
            webFullscreenSession = { video, anchor, overlay, previousInlineStyle, mode: 'overlay' };
            log('info', '进入网页全屏 (覆盖层模式)');
        }
    }

    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
        const key = e.key.toLowerCase();

        // 支持按 ESC 退出网页全屏
        if (key === 'escape' && document.body.classList.contains('pip-web-fs-active')) {
            exitWebFullscreen();
            return;
        }

        if (key === 'p' || key === 'q') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (key === 'p') toggleManualPiP();
            else if (key === 'q') toggleWebFullscreen();
        }
    }, true);

    let scanTimeout = null;
    const observer = new MutationObserver(mutations => {
        let hasPotentialNodes = false;
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (node.tagName === 'VIDEO') {
                setupVideo(node);
            } else {
                hasPotentialNodes = true;
            }
        }));

        // 防抖：如果有很多节点被连续插入(例如信息流滚动)，只在最后一次性整体扫描
        // 从而避免 TreeWalker 陷入深渊级的重度算力消耗
        if (hasPotentialNodes) {
            if (scanTimeout) clearTimeout(scanTimeout);
            scanTimeout = setTimeout(() => {
                scanVideos(); // 重复检测有防重入机制，所以直接全局重扫代价反而比遍历几十次 subtree 要小得多
                scanTimeout = null;
            }, 800);
        }
    });

    window.addEventListener('blur', () => {
        const activation = getActivationState();
        log('info', `>>> blur 触发! enabled=${CONFIG.enabled}, pipEl=${!!document.pictureInPictureElement}, hidden=${document.hidden}, hasFocus=${document.hasFocus()}, activeEl=${document.activeElement?.tagName}, iframePending=${iframeBlurPending}, activation=${activation.isActive}/${activation.hasBeenActive}, everInteracted=${hasEverInteracted}`);

        if (!CONFIG.enabled || document.pictureInPictureElement || document.hidden) {
            log('debug', '前置条件不满足，跳过。');
            return;
        }

        // 防御1：焦点转移到页内 iframe
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
            log('debug', '焦点转移到了 iframe 内部，属于页内交互，忽略失焦。');
            return;
        }

        // 防御2：刚刚点击了 iframe/embed/object 元素导致的 blur
        if (iframeBlurPending) {
            iframeBlurPending = false;
            log('debug', '检测到 iframe 点击导致的失焦，忽略。');
            return;
        }

        // 直接同步尝试触发画中画
        const allVideos = findVideosDeep();
        const playing = allVideos.find(v => !v.paused && v.readyState >= 1);
        log('info', `>>> 视频搜索: 总数=${allVideos.length}, 播放中=${playing ? 'YES readyState=' + playing.readyState : 'NO'}, cooldown剩余=${Math.max(0, ACTION_COOLDOWN - (Date.now() - lastActionTime))}ms`);

        if (playing) {
            enterPiP(playing, '窗口失焦');
        } else {
            setTimeout(() => {
                if (!document.hasFocus() && !document.hidden && !document.pictureInPictureElement) {
                    const retryPlaying = findVideosDeep().find(v => !v.paused && v.readyState >= 1);
                    log('info', `>>> 延迟重试: 播放中=${retryPlaying ? 'YES' : 'NO'}`);
                    if (retryPlaying) enterPiP(retryPlaying, '窗口失焦(延迟重试)');
                }
            }, 500);
        }
    });

    window.addEventListener('focus', () => {
        if (!CONFIG.enabled) return;
        if (lastPipVideo && lastPipVideo.isConnected) {
            refreshVideoRendering(lastPipVideo);
            setTimeout(() => refreshVideoRendering(lastPipVideo), 120);
            lastPipVideo = null;
        }
        scheduleReturnToPageExit(260);
    });

    document.addEventListener('visibilitychange', () => {
        if (!CONFIG.enabled) return;
        if (!document.hidden) {
            if (lastPipVideo && lastPipVideo.isConnected) {
                refreshVideoRendering(lastPipVideo);
                setTimeout(() => refreshVideoRendering(lastPipVideo), 120);
                lastPipVideo = null;
            }
            log('info', '检测到页面恢复可见, 安排退出画中画...');
            scheduleReturnToPageExit();
        }
    });

    document.addEventListener('leavepictureinpicture', (event) => {
        const video = event.target;
        lastPipVideo = video;
        if (returnToPageTimer) {
            clearTimeout(returnToPageTimer);
            returnToPageTimer = null;
        }
        if (video instanceof HTMLVideoElement) {
            refreshVideoRendering(video);
            setTimeout(() => refreshVideoRendering(video), 120);
        }
    }, true);

    function init() {
        log('info', `脚本已加载 v4.9.7 [${window.self === window.top ? 'Main' : 'Iframe'}]`);
        if (CONFIG.isMgtv) log('info', '检测到 MGTV, 已应用增强兼容性配置。');
        scanVideos();
        observer.observe(document.body, { childList: true, subtree: true });

        // 支持触控设备，涵盖鼠标与触摸(iPad等)
        document.addEventListener('pointerdown', (e) => {
            hasEverInteracted = true;
            // 点击 iframe/embed/object 可能导致窗口 blur，设置标记以忽略该次 blur
            if (e.target && (e.target.tagName === 'IFRAME' || e.target.tagName === 'EMBED' || e.target.tagName === 'OBJECT')) {
                iframeBlurPending = true;
                setTimeout(() => { iframeBlurPending = false; }, 500);
                log('info', `记录到页面交互（iframe/嵌入元素点击），activation=${getActivationState().isActive}/${getActivationState().hasBeenActive}`);
            } else {
                log('info', `记录到页面交互，activation=${getActivationState().isActive}/${getActivationState().hasBeenActive}`);
            }
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
