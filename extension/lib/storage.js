/**
 * TempDrop Storage Helper Module
 * Encapsulates all interactions with chrome.storage.local
 */

export const DEFAULT_SETTINGS = {
  defaultRetentionDays: 7,
  warnBeforeExpiryHours: 24,
  nativeHostInstalled: false,
  autoSweepIntervalMinutes: 60,
  showNotifications: true,
  promptTimeoutSeconds: 15,
  soundAlert: false,
  debugFastExpiry: false // When true, retentionDays is interpreted as minutes for quick testing
};

export const DEFAULT_RULES = [
  { id: "rule_1", matchType: "domain", pattern: "*.zoom.us", choice: "temporary", retentionDays: 1, enabled: true },
  { id: "rule_2", matchType: "extension", pattern: "dmg", choice: "permanent", retentionDays: 0, enabled: true },
  { id: "rule_3", matchType: "extension", pattern: "iso", choice: "permanent", retentionDays: 0, enabled: true }
];

/**
 * Gets the current extension settings, merging with defaults.
 */
export async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

/**
 * Updates extension settings.
 */
export async function saveSettings(newSettings) {
  const current = await getSettings();
  const updated = { ...current, ...newSettings };
  await chrome.storage.local.set({ settings: updated });
  return updated;
}

/**
 * Gets the full tempFiles map.
 */
export async function getTempFiles() {
  const { tempFiles = {} } = await chrome.storage.local.get("tempFiles");
  return tempFiles;
}

/**
 * Retrieves a single temporary file record by downloadId.
 */
export async function getTempFile(downloadId) {
  const files = await getTempFiles();
  return files[String(downloadId)] || null;
}

/**
 * Registers or overwrites a temporary file record.
 */
export async function saveTempFile(downloadId, record) {
  const tempFiles = await getTempFiles();
  tempFiles[String(downloadId)] = {
    downloadId: Number(downloadId),
    filename: record.filename,
    absolutePath: record.absolutePath || record.filename,
    fileSize: record.fileSize || 0,
    mime: record.mime || "",
    sourceUrl: record.sourceUrl || "",
    domain: record.domain || "",
    createdAt: record.createdAt || Date.now(),
    expiresAt: record.expiresAt || (Date.now() + 7 * 86400 * 1000),
    retentionDays: record.retentionDays || 7,
    status: record.status || "active", // "active" | "expiring-soon" | "trashed" | "trash-failed" | "missing" | "promoted"
    notifiedBeforeExpiry: record.notifiedBeforeExpiry || false,
    retryCount: record.retryCount || 0,
    lastError: record.lastError || null,
    trashedAt: record.trashedAt || null
  };
  await chrome.storage.local.set({ tempFiles });
  return tempFiles[String(downloadId)];
}

/**
 * Updates partial fields on an existing temporary file record.
 */
export async function updateTempFile(downloadId, partial) {
  const tempFiles = await getTempFiles();
  const key = String(downloadId);
  if (tempFiles[key]) {
    tempFiles[key] = { ...tempFiles[key], ...partial };
    await chrome.storage.local.set({ tempFiles });
    return tempFiles[key];
  }
  return null;
}

/**
 * Removes a temporary file record from storage.
 */
export async function removeTempFile(downloadId) {
  const tempFiles = await getTempFiles();
  delete tempFiles[String(downloadId)];
  await chrome.storage.local.set({ tempFiles });
}

/**
 * Gets configured auto-classification rules.
 */
export async function getRules() {
  const { rules = DEFAULT_RULES } = await chrome.storage.local.get("rules");
  return rules;
}

/**
 * Saves auto-classification rules.
 */
export async function saveRules(rules) {
  await chrome.storage.local.set({ rules });
  return rules;
}

/**
 * Computes storage metrics and statistics.
 */
export async function getStats() {
  const files = await getTempFiles();
  const list = Object.values(files);
  const now = Date.now();

  let activeCount = 0;
  let expiringSoonCount = 0;
  let trashedCount = 0;
  let totalActiveBytes = 0;
  let totalSavedBytes = 0;

  for (const f of list) {
    if (f.status === "active" || f.status === "expiring-soon") {
      activeCount++;
      totalActiveBytes += (f.fileSize || 0);
      if (f.expiresAt - now <= 24 * 3600 * 1000) {
        expiringSoonCount++;
      }
    } else if (f.status === "trashed") {
      trashedCount++;
      totalSavedBytes += (f.fileSize || 0);
    }
  }

  return {
    totalFiles: list.length,
    activeCount,
    expiringSoonCount,
    trashedCount,
    totalActiveBytes,
    totalSavedBytes
  };
}
