const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/../auto-pip.user.js`, 'utf8');

class EventTargetFake {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        this.listeners.set(type, listeners.filter(item => item !== listener));
    }

    dispatchEvent(event) {
        event.target ||= this;
        for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
        return !event.defaultPrevented;
    }
}

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(...names) {
        names.forEach(name => this.values.add(name));
    }

    remove(...names) {
        names.forEach(name => this.values.delete(name));
    }

    contains(name) {
        return this.values.has(name);
    }
}

class FakeElement extends EventTargetFake {
    constructor(tagName = 'div') {
        super();
        this.tagName = tagName.toUpperCase();
        this.nodeType = 1;
        this.dataset = {};
        this.attributes = new Map();
        this.children = [];
        this.parentNode = null;
        this.parentElement = null;
        this.classList = new FakeClassList();
        this.className = '';
        this.id = '';
        this.isConnected = true;
        this.isContentEditable = false;
        this.offsetWidth = 640;
        this.offsetHeight = 360;
        this.style = {
            setProperty() {},
            removeProperty() {}
        };
    }

    appendChild(child) {
        child.parentNode?.removeChild(child);
        this.children.push(child);
        child.parentNode = this;
        child.parentElement = this;
        return child;
    }

    insertBefore(child, reference) {
        child.parentNode?.removeChild(child);
        const index = this.children.indexOf(reference);
        this.children.splice(index < 0 ? this.children.length : index, 0, child);
        child.parentNode = this;
        child.parentElement = this;
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentNode = null;
        child.parentElement = null;
        return child;
    }

    remove() {
        this.parentNode?.removeChild(this);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'contenteditable') this.isContentEditable = value !== 'false';
    }

    getAttribute(name) {
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    matches(selector) {
        return selector.split(',').some(part => {
            const value = part.trim();
            if (value === this.tagName.toLowerCase()) return true;
            if (value === '[contenteditable=""]') return this.getAttribute('contenteditable') === '';
            if (value === '[contenteditable="true"]') return this.getAttribute('contenteditable') === 'true';
            if (value === '[role="textbox"]') return this.getAttribute('role') === 'textbox';
            return value === '#editor.active' && this.id === 'editor' && this.classList.contains('active');
        });
    }

    closest(selector) {
        let element = this;
        while (element) {
            if (element.matches(selector)) return element;
            element = element.parentElement;
        }
        return null;
    }

    querySelector() {
        return null;
    }

    contains(element) {
        return element === this || this.children.some(child => child.contains(element));
    }

    getBoundingClientRect() {
        return { width: this.offsetWidth, height: this.offsetHeight };
    }
}

class FakeVideo extends FakeElement {
    constructor(document) {
        super('video');
        this.ownerDocument = document;
        this.paused = false;
        this.muted = false;
        this.seeking = false;
        this.readyState = 4;
        this.disablePictureInPicture = false;
        this.autoPictureInPicture = false;
        this.requestCount = 0;
    }

    async requestPictureInPicture() {
        this.requestCount += 1;
        this.ownerDocument.pictureInPictureElement = this;
        return this;
    }
}

function setup() {
    let now = 1000;
    let timerId = 0;
    let focused = true;
    const timers = new Map();
    const document = new EventTargetFake();
    const window = new EventTargetFake();
    const body = new FakeElement('body');
    const head = new FakeElement('head');
    const documentElement = new FakeElement('html');
    const video = new FakeVideo(document);
    let exitCount = 0;

    body.appendChild(video);
    document.body = body;
    document.head = head;
    document.documentElement = documentElement;
    document.readyState = 'complete';
    document.hidden = false;
    document.activeElement = body;
    document.pictureInPictureElement = null;
    document.fullscreenElement = null;
    document.defaultView = window;
    document.hasFocus = () => focused && !document.hidden;
    document.createElement = tagName => new FakeElement(tagName);
    document.createTreeWalker = () => ({ nextNode: () => null });
    document.querySelectorAll = selector => {
        if (selector === 'video') return [video];
        return [];
    };
    document.exitPictureInPicture = async () => {
        exitCount += 1;
        document.pictureInPictureElement = null;
    };

    window.window = window;
    window.self = window;
    window.top = window;
    window.parent = window;
    window.frames = [];
    window.document = document;
    window.documentPictureInPicture = undefined;
    window.postMessage = () => {};

    class FakeDate extends Date {
        static now() {
            return now;
        }
    }

    const setTimeoutFake = (callback, delay = 0) => {
        timerId += 1;
        timers.set(timerId, { callback, due: now + delay });
        return timerId;
    };
    const clearTimeoutFake = id => timers.delete(id);
    const advance = async milliseconds => {
        const end = now + milliseconds;
        while (true) {
            const pending = [...timers.entries()]
                .filter(([, timer]) => timer.due <= end)
                .sort((left, right) => left[1].due - right[1].due)[0];
            if (!pending) break;
            const [id, timer] = pending;
            timers.delete(id);
            now = timer.due;
            timer.callback();
            await Promise.resolve();
        }
        now = end;
        await Promise.resolve();
    };

    const context = {
        window,
        document,
        navigator: { userActivation: { isActive: true, hasBeenActive: true } },
        location: { hostname: 'example.com' },
        console,
        Date: FakeDate,
        Element: FakeElement,
        HTMLElement: FakeElement,
        HTMLVideoElement: FakeVideo,
        Node: { ELEMENT_NODE: 1 },
        Event: class {
            constructor(type) { this.type = type; }
        },
        MutationObserver: class {
            observe() {}
            disconnect() {}
        },
        ResizeObserver: class {
            observe() {}
            unobserve() {}
        },
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        requestAnimationFrame: callback => setTimeoutFake(callback, 0),
        setTimeout: setTimeoutFake,
        clearTimeout: clearTimeoutFake,
        queueMicrotask
    };

    vm.runInNewContext(source, context);

    function dispatch(target, type, properties = {}) {
        const event = {
            type,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.propagationStopped = true; },
            stopImmediatePropagation() { this.immediatePropagationStopped = true; },
            composedPath() { return [this.target]; },
            ...properties
        };
        target.dispatchEvent(event);
        return event;
    }

    async function changeVisibility(hidden) {
        document.hidden = hidden;
        focused = !hidden;
        dispatch(document, 'visibilitychange');
        if (hidden && video.autoPictureInPicture && !document.pictureInPictureElement) {
            await video.requestPictureInPicture();
            dispatch(document, 'enterpictureinpicture', { target: video });
        }
    }

    const blur = () => {
        focused = false;
        dispatch(window, 'blur');
    };
    const focus = () => {
        focused = true;
        dispatch(window, 'focus');
    };
    const press = (key, target = body) => dispatch(document, 'keydown', { key, target });

    return { advance, blur, body, changeVisibility, document, exitCount: () => exitCount, focus, press, video };
}

test('switching tabs enters native auto PiP and returning exits it', async () => {
    const page = setup();

    await page.changeVisibility(true);
    assert.equal(page.video.getAttribute('autopictureinpicture'), '');
    assert.equal(page.video.requestCount, 1);
    assert.equal(page.document.pictureInPictureElement, page.video);

    await page.changeVisibility(false);
    await page.advance(780);
    assert.equal(page.exitCount(), 1);
    assert.equal(page.document.pictureInPictureElement, null);
});

test('window blur enters PiP and focus exits it', async () => {
    const page = setup();

    page.blur();
    await Promise.resolve();
    assert.equal(page.video.requestCount, 1);
    assert.equal(page.document.pictureInPictureElement, page.video);

    await page.advance(500);
    page.focus();
    await page.advance(260);
    assert.equal(page.exitCount(), 1);
    assert.equal(page.document.pictureInPictureElement, null);
});

test('P and Q are ignored in inputs, textareas, and contenteditable elements', () => {
    for (const tagName of ['input', 'textarea', 'div']) {
        const page = setup();
        const editor = new FakeElement(tagName);
        if (tagName === 'div') editor.setAttribute('contenteditable', 'true');
        page.body.appendChild(editor);
        page.document.activeElement = editor;

        for (const key of ['p', 'q']) {
            const event = page.press(key, editor);
            assert.equal(event.defaultPrevented, undefined, `${key} should be ignored in ${tagName}`);
        }
        assert.equal(page.video.requestCount, 0);
        assert.equal(page.body.classList.contains('pip-web-fs-active'), false);
    }
});

test('P enters PiP and consumes the shortcut on a normal page', async () => {
    const page = setup();
    const event = page.press('p');
    await Promise.resolve();

    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(page.video.requestCount, 1);
    assert.equal(page.document.pictureInPictureElement, page.video);
});

test('Q enters web fullscreen and consumes the shortcut on a normal page', () => {
    const page = setup();
    const event = page.press('q');

    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(page.body.classList.contains('pip-web-fs-active'), true);
});
