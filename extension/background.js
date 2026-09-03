/**
 * TempDrop Background Service Worker (Manifest V3)
 * Handles download interception, prompt lifecycle, alarm sweeps, and native messaging bridge.
 */

import { getSettings, saveSettings, getTempFiles, saveTempFile, updateTempFile, removeTempFile, getRules, saveRules } from './lib/storage.js';
import { evaluateDownloadRules, extractHostname } from './lib/rules.js';
import { checkHostHealth, trashFile } from './lib/native.js';

// In-memory map for in-flight downloads awaiting decision or completion
// downloadId -> { choice: "temporary"|"permanent", retentionDays: number, filename: string, sourceUrl: string }
const PENDING = new Map();

// Initialize alarms on installation or browser launch
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[TempDrop] Extension installed/updated.");
  await setupAlarm();
  await checkAndUpdateHostStatus();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[TempDrop] Extension service worker startup.");
  await setupAlarm();
  await checkAndUpdateHostStatus();
  // Catch-up sweep on startup in case timer expired while browser was closed
  await executeExpirySweep();
});

async function setupAlarm() {
  const settings = await getSettings();
  const period = settings.autoSweepIntervalMinutes || 60;
  chrome.alarms.create("tempdrop-sweep", { periodInMinutes: period });
  console.log(`[TempDrop] Alarm registered: tempdrop-sweep (every ${period}m)`);
}

async function checkAndUpdateHostStatus() {
  const isHealthy = await checkHostHealth();
  await saveSettings({ nativeHostInstalled: isHealthy });
  console.log(`[TempDrop] Native host connection check: ${isHealthy ? "CONNECTED" : "DISCONNECTED"}`);
  return isHealthy;
}

// --------------------------------------------------------------------------
// Download Interception
// --------------------------------------------------------------------------

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  console.log(`[TempDrop] Intercepting download: ${item.filename} (ID: ${item.id})`);

  handleDownloadInterception(item, suggest);
  return true; // Keep suggest callback alive asynchronously
});

async function handleDownloadInterception(item, suggest) {
  try {
    const rules = await getRules();
    const settings = await getSettings();
    const ruleMatch = evaluateDownloadRules(item, rules);

    let choice = "permanent";
    let retentionDays = settings.defaultRetentionDays || 7;

    if (ruleMatch.matched) {
      console.log(`[TempDrop] Auto-rule matched for ${item.filename}: ${ruleMatch.choice}`);
      choice = ruleMatch.choice;
      if (choice === "temporary") {
        retentionDays = ruleMatch.retentionDays || settings.defaultRetentionDays || 7;
        
        // Show auto-route toast notification
        if (settings.showNotifications) {
          chrome.notifications.create(`rule-apply-${item.id}`, {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "TempDrop Auto-Classified",
            message: `"${item.filename}" will be saved to Temporary (expires in ${retentionDays} days).`
          });
        }
      }
    } else {
      // No rule matched, open prompt popup window
      const promptResult = await askUserChoice(item, settings);
      choice = promptResult.choice;
      retentionDays = promptResult.retentionDays || settings.defaultRetentionDays || 7;

      // If user selected "Don't ask again", persist the rule
      if (promptResult.saveRule && promptResult.ruleData) {
        const currentRules = await getRules();
        currentRules.push(promptResult.ruleData);
        await saveRules(currentRules);
        console.log(`[TempDrop] New rule saved:`, promptResult.ruleData);
      }
    }

    if (choice === "temporary") {
      const newPath = `Temporary/${item.filename}`;
      suggest({ filename: newPath, conflictAction: "uniquify" });
      PENDING.set(item.id, {
        choice: "temporary",
        retentionDays,
        filename: item.filename,
        sourceUrl: item.finalUrl || item.url
      });
      console.log(`[TempDrop] Redirected ${item.filename} -> ${newPath} (${retentionDays}d retention)`);
    } else {
      suggest({}); // Standard unmodified download location
      PENDING.set(item.id, {
        choice: "permanent",
        retentionDays: 0,
        filename: item.filename,
        sourceUrl: item.finalUrl || item.url
      });
      console.log(`[TempDrop] Saved permanently: ${item.filename}`);
    }
  } catch (err) {
    console.error("[TempDrop] Error during download interception, defaulting to permanent:", err);
    suggest({}); // Failsafe fallback
  }
}

function askUserChoice(item, settings) {
  return new Promise((resolve) => {
    const timeoutSeconds = settings.promptTimeoutSeconds || 15;
    const hostname = extractHostname(item.finalUrl || item.url);
    const query = new URLSearchParams({
      downloadId: String(item.id),
      filename: item.filename || "file",
      fileSize: String(item.fileSize || 0),
      url: item.finalUrl || item.url || "",
      domain: hostname,
      defaultRetention: String(settings.defaultRetentionDays || 7),
      timeout: String(timeoutSeconds)
    });

    const promptUrl = chrome.runtime.getURL(`prompt.html?${query.toString()}`);
    let popupWindowId = null;
    let resolved = false;

    const cleanupAndResolve = (result) => {
      if (resolved) return;
      resolved = true;
      chrome.runtime.onMessage.removeListener(messageListener);
      if (popupWindowId !== null) {
        chrome.windows.remove(popupWindowId).catch(() => {});
      }
      resolve(result);
    };

    const messageListener = (message, sender) => {
      if (sender.windowId && sender.windowId === popupWindowId && message && message.type === "TEMPDROP_PROMPT_CHOICE") {
        cleanupAndResolve({
          choice: message.choice || "permanent",
          retentionDays: Number(message.retentionDays) || settings.defaultRetentionDays || 7,
          saveRule: Boolean(message.saveRule),
          ruleData: message.ruleData || null
        });
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    chrome.windows.create({
      url: promptUrl,
      type: "popup",
      width: 440,
      height: 380,
      focused: true
    }, (win) => {
      if (!win) {
        // Fallback if window creation fails
        cleanupAndResolve({ choice: "permanent", retentionDays: 0 });
        return;
      }
      popupWindowId = win.id;

      // Chrome timeout fallback: prevent download hanging
      setTimeout(() => {
        if (!resolved) {
          console.warn(`[TempDrop] Prompt timed out after ${timeoutSeconds}s. Defaulting to Permanent.`);
          cleanupAndResolve({ choice: "permanent", retentionDays: 0 });
        }
      }, timeoutSeconds * 1000);
    });
  });
}

// --------------------------------------------------------------------------
// Download Completion & Metadata Storage
// --------------------------------------------------------------------------

chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state && delta.state.current === "complete") {
    const pendingInfo = PENDING.get(delta.id);
    if (pendingInfo && pendingInfo.choice === "temporary") {
      try {
        const [item] = await chrome.downloads.search({ id: delta.id });
        if (item) {
          const settings = await getSettings();
          const now = Date.now();
          
          let durationMs = pendingInfo.retentionDays * 24 * 60 * 60 * 1000;
          if (settings.debugFastExpiry) {
            // Fast expiry debug mode (treat retentionDays as minutes)
            durationMs = pendingInfo.retentionDays * 60 * 1000;
          }

          const expiresAt = now + durationMs;

          await saveTempFile(delta.id, {
            filename: item.filename,
            absolutePath: item.filename,
            fileSize: item.fileSize,
            mime: item.mime,
            sourceUrl: item.finalUrl || item.url,
            domain: extractHostname(item.finalUrl || item.url),
            createdAt: now,
            expiresAt,
            retentionDays: pendingInfo.retentionDays,
            status: "active"
          });

          console.log(`[TempDrop] Registered temporary file #${delta.id}: ${item.filename} (expires ${new Date(expiresAt).toISOString()})`);
        }
      } catch (err) {
        console.error("[TempDrop] Failed to register temporary download record:", err);
      }
    }
    PENDING.delete(delta.id);
  } else if (delta.state && delta.state.current === "interrupted") {
    PENDING.delete(delta.id);
  }
});

// --------------------------------------------------------------------------
// Expiry Sweeper & Native Host Trashing
// --------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "tempdrop-sweep") {
    console.log("[TempDrop] Executing scheduled expiry sweep...");
    await executeExpirySweep();
  }
});

export async function executeExpirySweep() {
  const tempFiles = await getTempFiles();
  const settings = await getSettings();
  const now = Date.now();
  let updatedAny = false;

  const warnThresholdMs = (settings.warnBeforeExpiryHours || 24) * 60 * 60 * 1000;

  for (const [id, rec] of Object.entries(tempFiles)) {
    if (rec.status === "trashed" || rec.status === "promoted") {
      continue;
    }

    const timeUntilExpiry = rec.expiresAt - now;

    // 1. Check for expiring-soon notification
    if (timeUntilExpiry > 0 && timeUntilExpiry <= warnThresholdMs && !rec.notifiedBeforeExpiry) {
      if (settings.showNotifications) {
        const hoursLeft = Math.max(1, Math.round(timeUntilExpiry / (3600 * 1000)));
        chrome.notifications.create(`warn-expiry-${id}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "Temporary Download Expiring Soon",
          message: `"${rec.filename.split(/[\\/]/).pop()}" will be moved to the Recycle Bin in ~${hoursLeft} hours.`
        });
      }
      rec.notifiedBeforeExpiry = true;
      rec.status = "expiring-soon";
      updatedAny = true;
    }

    // 2. Check for elapsed expiry
    if (now >= rec.expiresAt) {
      console.log(`[TempDrop] File expired: ${rec.absolutePath}`);

      const result = await trashFile(rec.absolutePath);
      console.log(`[TempDrop] Native host trash result:`, result);

      if (result && result.ok) {
        rec.status = "trashed";
        rec.trashedAt = now;
        updatedAny = true;

        if (settings.showNotifications) {
          const shortName = rec.filename.split(/[\\/]/).pop();
          chrome.notifications.create(`trashed-${id}`, {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Temporary Download Cleaned",
            message: `"${shortName}" was moved to the Recycle Bin / Trash.`
          });
        }
      } else if (result && result.error === "not_found") {
        // File was already moved or deleted manually by the user
        rec.status = "missing";
        updatedAny = true;
      } else {
        // Trashing failed (e.g. native host unavailable or disk locked)
        rec.retryCount = (rec.retryCount || 0) + 1;
        rec.status = "trash-failed";
        rec.lastError = result ? result.error : "Unknown error";
        updatedAny = true;

        if (rec.retryCount >= 3 && settings.showNotifications) {
          chrome.notifications.create(`error-trash-${id}`, {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "TempDrop Trash Warning",
            message: `Could not move "${rec.filename.split(/[\\/]/).pop()}" to Recycle Bin (${rec.lastError}).`
          });
        }
      }
    }
  }

  if (updatedAny) {
    await chrome.storage.local.set({ tempFiles });
  }

  // Update native host status
  await checkAndUpdateHostStatus();
}

// --------------------------------------------------------------------------
// Runtime Message Dispatcher (Popup & Options Communication)
// --------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_STATUS") {
    checkHostHealth().then((isHealthy) => {
      sendResponse({ nativeHostInstalled: isHealthy });
    });
    return true;
  }

  if (request.action === "TRASH_FILE") {
    (async () => {
      const { downloadId, path } = request;
      const res = await trashFile(path);
      if (res && res.ok) {
        await updateTempFile(downloadId, { status: "trashed", trashedAt: Date.now() });
      }
      sendResponse(res);
    })();
    return true;
  }

  if (request.action === "PROMOTE_FILE") {
    (async () => {
      const { downloadId } = request;
      await updateTempFile(downloadId, { status: "promoted" });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === "EXTEND_FILE") {
    (async () => {
      const { downloadId, additionalDays = 7 } = request;
      const file = await getTempFiles().then(f => f[String(downloadId)]);
      if (file) {
        const newExpiresAt = Math.max(Date.now(), file.expiresAt) + (additionalDays * 24 * 3600 * 1000);
        await updateTempFile(downloadId, {
          expiresAt: newExpiresAt,
          retentionDays: (file.retentionDays || 0) + additionalDays,
          status: "active",
          notifiedBeforeExpiry: false
        });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === "RUN_SWEEP_NOW") {
    executeExpirySweep().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (request.action === "PING_HOST") {
    checkHostHealth().then((ok) => {
      sendResponse({ ok });
    });
    return true;
  }
});
