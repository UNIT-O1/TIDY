/**
 * TempDrop Native Messaging Host Client Wrapper
 * Handles persistent port communication, automatic reconnection, and timeout handling.
 */

const HOST_NAME = "com.tempdrop.host";
let activePort = null;
let pendingCallbacks = new Map(); // messageId -> { resolve, reject, timeoutId }
let messageCounter = 0;

/**
 * Initializes or retrieves the long-lived native messaging port.
 */
export function getNativePort(onDisconnectCallback = null) {
  if (activePort) {
    return activePort;
  }

  try {
    activePort = chrome.runtime.connectNative(HOST_NAME);

    activePort.onMessage.addListener((msg) => {
      // If message contains correlation id or dispatch to first pending callback
      if (msg && msg.__msgId && pendingCallbacks.has(msg.__msgId)) {
        const { resolve, timeoutId } = pendingCallbacks.get(msg.__msgId);
        clearTimeout(timeoutId);
        pendingCallbacks.delete(msg.__msgId);
        delete msg.__msgId;
        resolve(msg);
      } else if (pendingCallbacks.size > 0) {
        // Fallback FIFO resolution
        const firstKey = pendingCallbacks.keys().next().value;
        const { resolve, timeoutId } = pendingCallbacks.get(firstKey);
        clearTimeout(timeoutId);
        pendingCallbacks.delete(firstKey);
        resolve(msg);
      }
    });

    activePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Port disconnected";
      console.warn(`[TempDrop] Native host port disconnected: ${err}`);
      activePort = null;

      // Reject all pending promises
      for (const [id, { reject, timeoutId }] of pendingCallbacks.entries()) {
        clearTimeout(timeoutId);
        reject(new Error(`Native host disconnected: ${err}`));
      }
      pendingCallbacks.clear();

      if (typeof onDisconnectCallback === "function") {
        onDisconnectCallback(err);
      }
    });

    return activePort;
  } catch (err) {
    console.error("[TempDrop] Failed to connect to native messaging host:", err);
    activePort = null;
    return null;
  }
}

/**
 * Disconnects the active port if needed.
 */
export function disconnectNativePort() {
  if (activePort) {
    try {
      activePort.disconnect();
    } catch {
      // Ignore
    }
    activePort = null;
  }
}

/**
 * Sends a message to the native host with a timeout.
 */
export function sendToNativeHost(message, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const port = getNativePort();
      if (!port) {
        return resolve({ ok: false, error: "native_host_unavailable", not_installed: true });
      }

      const msgId = ++messageCounter;
      const outgoing = { ...message, __msgId: msgId };

      const timeoutId = setTimeout(() => {
        if (pendingCallbacks.has(msgId)) {
          pendingCallbacks.delete(msgId);
          resolve({ ok: false, error: "native_host_timeout" });
        }
      }, timeoutMs);

      pendingCallbacks.set(msgId, { resolve, reject, timeoutId });
      port.postMessage(outgoing);
    } catch (err) {
      resolve({ ok: false, error: err.message || "send_failed" });
    }
  });
}

/**
 * Performs a health check ping to verify if the helper is alive.
 */
export async function checkHostHealth() {
  try {
    const res = await sendToNativeHost({ action: "ping" }, 4000);
    return res && res.ok === true && res.pong === true;
  } catch {
    return false;
  }
}

/**
 * Requests the native host to move a file to the OS Recycle Bin / Trash.
 */
export async function trashFile(absolutePath) {
  if (!absolutePath) {
    return { ok: false, error: "missing_path" };
  }
  return await sendToNativeHost({ action: "trash", path: absolutePath }, 10000);
}
