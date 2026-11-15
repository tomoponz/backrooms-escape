// Own browser input listeners and pointer-lock lifetime, independently of the
// simulation. State changes call clear(); non-playing states also release lock.
const RESERVED_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const HELD_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE']);

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft',
  'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

function isEditable(target) {
  return !!target && (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(target.tagName).toUpperCase()) ||
    !!target.closest?.('[contenteditable="true"], [contenteditable=""]'));
}

/**
 * actions: collect, toggleFlash, toggleMap, selectSlot, useSelectedSlot, openInventory, closeInventory, pause,
 *          closeCredits (returns true when it handled Escape).
 * onLook receives raw mouse deltas; the game owns sensitivity and pitch limits.
 * requestPointerLock returns whether a request/valid lock is available. It never
 * leaves a rejected browser promise unhandled or queues a future user gesture.
 */
export function createGameInput({document, window, canvas, keys = new Set(), getState,
  actions = {}, onLook = () => {}, onPointerFailure = () => {}}) {
  let generation = 0, pending = null, acceptedLock = false, releasing = false;
  let dragging = false, disposed = false;
  const recentKeys = [];
  const removers = [];
  const listen = (target, type, listener, lockLifecycle = false) => {
    target.addEventListener(type, listener);
    let removed = false;
    removers.push({lockLifecycle, remove() {
      if (!removed) target.removeEventListener?.(type, listener);
      removed = true;
    }});
  };
  const playing = () => !disposed && getState() === 'playing';
  const finishDisposal = () => {
    if (disposed && !pending) for (const listener of removers) listener.remove();
  };

  function clear() {
    keys.clear();
    recentKeys.length = 0;
    dragging = false;
    // A pending acquisition belongs to the state in which it was requested.
    // Keeping the pending object serializes requests until the browser answers.
    generation++;
  }

  function releasePointerLock() {
    generation++;
    acceptedLock = false;
    dragging = false;
    if (document.pointerLockElement !== canvas) return;
    releasing = true;
    document.exitPointerLock?.();
  }

  function requestPointerLock() {
    if (!playing() || releasing) return false;
    if (document.pointerLockElement === canvas) {
      acceptedLock = true;
      return true;
    }
    // In particular, a stale request from a prior run cannot overlap a new one:
    // pointerlockchange has no request identifier with which to distinguish them.
    if (pending) return false;
    if (typeof canvas.requestPointerLock !== 'function') {
      onPointerFailure();
      return false;
    }
    const request = {generation, acquired: false, failed: false};
    pending = request;
    const failed = error => {
      if (request.failed) return;
      request.failed = true;
      if (pending === request) pending = null;
      if (!request.acquired && request.generation === generation && playing()) onPointerFailure(error);
      finishDisposal();
    };
    request.fail = failed;
    try {
      const result = canvas.requestPointerLock();
      if (result && typeof result.then === 'function') {
        request.promise = true;
        Promise.resolve(result).then(() => {
          // Some implementations settle before delivering pointerlockchange.
          // Keep the request identity until the actual lock becomes observable.
          if (document.pointerLockElement === canvas) pointerLockChanged();
        }, failed);
      }
      return true;
    } catch (error) {
      failed(error);
      return false;
    }
  }

  function pointerLockChanged() {
    if (document.pointerLockElement === canvas) {
      const request = pending;
      if (request) request.acquired = true;
      // Already accepted locks may generate duplicate change notifications.
      const valid = playing() && !releasing &&
        (request ? request.generation === generation : acceptedLock);
      pending = null;
      if (valid) acceptedLock = true;
      else releasePointerLock();
      finishDisposal();
      return;
    }
    const unexpectedlyLost = acceptedLock;
    acceptedLock = false;
    releasing = false;
    if (unexpectedlyLost && playing()) {
      clear();
      actions.pause?.();
    }
  }

  function loseFocus() {
    clear();
    if (playing()) actions.pause?.();
    releasePointerLock();
  }

  listen(document, 'keydown', event => {
    if (disposed || isEditable(event.target)) return;
    const state = getState();
    if (state === 'inventory' && (event.code === 'KeyI' || event.code === 'Escape')) {
      event.preventDefault();
      if (!event.repeat) actions.closeInventory?.();
      return;
    }
    if (event.code === 'Escape') {
      if (event.repeat) return;
      if (!actions.closeCredits?.() && state === 'playing') {actions.pause?.();actions.exitFullscreen?.();}
      return;
    }
    // While held by a pursuer, Space or E is tapped (or simply held) to break free.
    if (state === 'caught') {
      if (event.code === 'Space' || event.code === 'KeyE') {
        event.preventDefault(); keys.add(event.code);
        if (!event.repeat) actions.struggle?.();
      }
      return;
    }
    if (state !== 'playing') return;
    if (RESERVED_KEYS.has(event.code) || event.code === 'KeyI') event.preventDefault();
    if (HELD_KEYS.has(event.code)) keys.add(event.code);
    if (event.repeat) return;
    const slot=/^(?:Digit|Numpad)([1-4])$/.exec(event.code);
    const unmodified=!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing;
    if (unmodified) {
      recentKeys.push(event.code);
      if (recentKeys.length > KONAMI.length) recentKeys.shift();
      if (recentKeys.length === KONAMI.length && KONAMI.every((code,i) => code === recentKeys[i])) {
        recentKeys.length = 0;
        keys.delete(event.code);
        event.preventDefault();
        actions.toggleInvulnerability?.();
        return;
      }
    }
    if (slot && unmodified) {event.preventDefault();actions.selectSlot?.(Number(slot[1])-1);}
    else if (event.code === 'KeyQ' && unmodified) {event.preventDefault();actions.useSelectedSlot?.();}
    else if (event.code === 'KeyI') actions.openInventory?.();
    else if (event.code === 'KeyE') actions.collect?.();
    else if (event.code === 'KeyF') actions.toggleFlash?.();
    else if (event.code === 'Tab') actions.toggleMap?.();
  });
  // Always release held input, even when focus has moved into an editable field.
  listen(document, 'keyup', event => keys.delete(event.code));
  listen(window, 'blur', loseFocus);
  listen(document, 'visibilitychange', () => { if (document.hidden) loseFocus(); });
  listen(document, 'pointerlockchange', pointerLockChanged, true);
  listen(document, 'pointerlockerror', event => {
    const request = pending;
    // Modern requests reject their own identified promise. A late error event
    // from an earlier request must not reject a newer promise-based request.
    if (!request?.promise) request?.fail(event);
  }, true);
  listen(canvas, 'pointerdown', event => {
    if (playing() && (event.button === undefined || event.button === 0)) dragging = true;
    else if (!disposed && getState() === 'caught') actions.struggle?.();
  });
  listen(window, 'pointerup', () => { dragging = false; });
  listen(window, 'pointercancel', () => { dragging = false; });
  listen(document, 'mousemove', event => {
    if (!playing() || !(document.pointerLockElement === canvas && acceptedLock || dragging)) return;
    const dx = Number.isFinite(event.movementX) ? event.movementX : 0;
    const dy = Number.isFinite(event.movementY) ? event.movementY : 0;
    if (dx || dy) onLook(dx, dy);
  });
  listen(canvas, 'contextmenu', event => { if (playing()) event.preventDefault(); });

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    releasePointerLock();
    // Legacy browsers may answer a pending request with only an event. Keep
    // those two listeners just long enough to release that late acquisition.
    for (const listener of removers) if (!listener.lockLifecycle || !pending) listener.remove();
  }

  return Object.freeze({clear, releasePointerLock, requestPointerLock, dispose});
}
