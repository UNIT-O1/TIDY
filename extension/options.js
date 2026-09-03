/**
 * TempDrop Options & Downloads Management Dashboard Controller
 */

import { getSettings, saveSettings, getTempFiles, updateTempFile, removeTempFile, getRules, saveRules, getStats } from './lib/storage.js';

function formatBytes(bytes) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function showToast(message, isError = false) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.borderColor = isError ? "rgba(244, 63, 94, 0.5)" : "rgba(14, 165, 233, 0.5)";
  toast.innerHTML = `
    <span>${isError ? "⚠️" : "✓"}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Navigation elements
  const navItems = document.querySelectorAll(".nav-item");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const navFilesBadge = document.getElementById("navFilesBadge");
  const navHostDot = document.getElementById("navHostDot");

  // Overview Metrics
  const overviewActive = document.getElementById("overviewActive");
  const overviewExpiring = document.getElementById("overviewExpiring");
  const overviewTrashed = document.getElementById("overviewTrashed");
  const overviewSavedSpace = document.getElementById("overviewSavedSpace");

  // Files Tab Elements
  const filesTableBody = document.getElementById("filesTableBody");
  const tableEmptyNotice = document.getElementById("tableEmptyNotice");
  const fileSearchInput = document.getElementById("fileSearchInput");
  const filterChips = document.querySelectorAll(".chip");
  const btnOptionsSweep = document.getElementById("btnOptionsSweep");
  const btnClearFinished = document.getElementById("btnClearFinished");

  // Rules Tab Elements
  const rulesListContainer = document.getElementById("rulesListContainer");
  const btnAddNewRule = document.getElementById("btnAddNewRule");
  const ruleFormCard = document.getElementById("ruleFormCard");
  const ruleMatchType = document.getElementById("ruleMatchType");
  const rulePattern = document.getElementById("rulePattern");
  const ruleDomainPattern = document.getElementById("ruleDomainPattern");
  const ruleExtPattern = document.getElementById("ruleExtPattern");
  const ruleChoice = document.getElementById("ruleChoice");
  const ruleRetentionDays = document.getElementById("ruleRetentionDays");
  const groupPattern = document.getElementById("groupPattern");
  const groupDomainPattern = document.getElementById("groupDomainPattern");
  const groupExtPattern = document.getElementById("groupExtPattern");
  const groupRuleRetention = document.getElementById("groupRuleRetention");
  const lblRulePattern = document.getElementById("lblRulePattern");
  const btnSaveRule = document.getElementById("btnSaveRule");
  const btnCancelRule = document.getElementById("btnCancelRule");

  // Settings Elements
  const settingRetentionSlider = document.getElementById("settingRetentionSlider");
  const settingRetentionVal = document.getElementById("settingRetentionVal");
  const settingWarnHours = document.getElementById("settingWarnHours");
  const settingPromptTimeout = document.getElementById("settingPromptTimeout");
  const settingShowNotifications = document.getElementById("settingShowNotifications");
  const settingFastDebug = document.getElementById("settingFastDebug");
  const btnSaveSettings = document.getElementById("btnSaveSettings");

  // Native Tab Elements
  const btnTestNativePing = document.getElementById("btnTestNativePing");
  const diagDot = document.querySelector(".diag-dot");
  const diagTitle = document.getElementById("diagTitle");
  const diagTag = document.getElementById("diagTag");
  const diagDesc = document.getElementById("diagDesc");

  let currentFilter = "all";
  let searchQuery = "";

  // --------------------------------------------------------------------------
  // Tab Navigation
  // --------------------------------------------------------------------------
  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      navItems.forEach(n => n.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const activePane = document.getElementById(targetId);
      if (activePane) activePane.classList.add("active");

      if (targetId === "tab-native") {
        runHostDiagnostic();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Data Refresh & Render
  // --------------------------------------------------------------------------
  async function refreshAll() {
    const stats = await getStats();
    overviewActive.textContent = stats.activeCount;
    overviewExpiring.textContent = stats.expiringSoonCount;
    overviewTrashed.textContent = stats.trashedCount;
    overviewSavedSpace.textContent = formatBytes(stats.totalSavedBytes);
    navFilesBadge.textContent = stats.activeCount;

    await renderFilesTable();
    await renderRules();
  }

  // Initial Load
  await loadSettingsUI();
  await refreshAll();
  runHostDiagnostic();

  // --------------------------------------------------------------------------
  // Files Table & Filtering
  // --------------------------------------------------------------------------
  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.getAttribute("data-filter");
      renderFilesTable();
    });
  });

  fileSearchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderFilesTable();
  });

  async function renderFilesTable() {
    const tempFiles = await getTempFiles();
    let fileList = Object.values(tempFiles);

    // Filter by category
    if (currentFilter === "active") {
      fileList = fileList.filter(f => f.status === "active");
    } else if (currentFilter === "expiring-soon") {
      fileList = fileList.filter(f => f.status === "expiring-soon" || (f.status === "active" && f.expiresAt - Date.now() <= 86400000));
    } else if (currentFilter === "trashed") {
      fileList = fileList.filter(f => f.status === "trashed");
    } else if (currentFilter === "missing") {
      fileList = fileList.filter(f => f.status === "missing" || f.status === "promoted" || f.status === "trash-failed");
    }

    // Filter by search query
    if (searchQuery) {
      fileList = fileList.filter(f => {
        const name = (f.filename || "").toLowerCase();
        const domain = (f.domain || "").toLowerCase();
        return name.includes(searchQuery) || domain.includes(searchQuery);
      });
    }

    // Sort by created descending
    fileList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    filesTableBody.innerHTML = "";

    if (fileList.length === 0) {
      tableEmptyNotice.style.display = "block";
      return;
    }

    tableEmptyNotice.style.display = "none";

    for (const file of fileList) {
      const tr = document.createElement("tr");
      const shortName = (file.filename || "file").split(/[\\/]/).pop();
      const ext = shortName.split(".").pop().slice(0, 4).toUpperCase();
      const now = Date.now();
      const diffMs = file.expiresAt - now;

      let expiresDisplay = "";
      if (file.status === "trashed") {
        expiresDisplay = `<span style="color: #34d399;">Recycled ${new Date(file.trashedAt || file.expiresAt).toLocaleDateString()}</span>`;
      } else if (file.status === "promoted") {
        expiresDisplay = `<span style="color: #94a3b8;">Kept Permanently</span>`;
      } else if (diffMs <= 0) {
        expiresDisplay = `<span style="color: #fb7185; font-weight: 700;">Overdue / Expired</span>`;
      } else {
        const days = Math.floor(diffMs / 86400000);
        const hours = Math.round((diffMs % 86400000) / 3600000);
        expiresDisplay = days > 0 ? `In ${days}d ${hours}h` : `In ${hours}h`;
      }

      let statusBadge = "";
      switch (file.status) {
        case "active":
          statusBadge = `<span class="status-badge active">Active</span>`;
          break;
        case "expiring-soon":
          statusBadge = `<span class="status-badge expiring-soon">Expiring</span>`;
          break;
        case "trashed":
          statusBadge = `<span class="status-badge trashed">Recycled</span>`;
          break;
        case "promoted":
          statusBadge = `<span class="status-badge missing">Permanent</span>`;
          break;
        case "trash-failed":
          statusBadge = `<span class="status-badge trash-failed">Failed</span>`;
          break;
        default:
          statusBadge = `<span class="status-badge missing">${file.status || "Missing"}</span>`;
      }

      tr.innerHTML = `
        <td>
          <div class="file-cell">
            <span class="file-tag">${ext || "FILE"}</span>
            <div class="file-title-col" title="${file.absolutePath || shortName}">${shortName}</div>
          </div>
        </td>
        <td style="color: #94a3b8; font-size: 12px;">${file.domain || "Direct"}</td>
        <td style="color: #94a3b8;">${formatBytes(file.fileSize)}</td>
        <td>${expiresDisplay}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="action-row-btns">
            ${file.status !== "trashed" ? `
              <button class="action-icon-btn" title="+7 Days Extension" data-action="extend" data-id="${file.downloadId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              </button>
              <button class="action-icon-btn" title="Keep Permanently" data-action="promote" data-id="${file.downloadId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg>
              </button>
              <button class="action-icon-btn trash-hover" title="Move to Recycle Bin Now" data-action="trash" data-id="${file.downloadId}" data-path="${file.absolutePath}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : `
              <button class="action-icon-btn" title="Remove Record" data-action="delete-record" data-id="${file.downloadId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            `}
          </div>
        </td>
      `;

      filesTableBody.appendChild(tr);
    }
  }

  // Table Action Handler
  filesTableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const downloadId = btn.getAttribute("data-id");
    const path = btn.getAttribute("data-path");

    btn.disabled = true;

    if (action === "trash") {
      chrome.runtime.sendMessage({ action: "TRASH_FILE", downloadId, path }, async (res) => {
        if (res && res.ok) {
          showToast("Moved file to Recycle Bin");
        } else {
          showToast(`Error: ${res ? res.error : "Failed to trash"}`, true);
        }
        await refreshAll();
      });
    } else if (action === "promote") {
      chrome.runtime.sendMessage({ action: "PROMOTE_FILE", downloadId }, async () => {
        showToast("Marked download as Permanent");
        await refreshAll();
      });
    } else if (action === "extend") {
      chrome.runtime.sendMessage({ action: "EXTEND_FILE", downloadId, additionalDays: 7 }, async () => {
        showToast("Extended retention by 7 days");
        await refreshAll();
      });
    } else if (action === "delete-record") {
      await removeTempFile(downloadId);
      showToast("Removed record from history");
      await refreshAll();
    }
  });

  btnOptionsSweep.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "RUN_SWEEP_NOW" }, async () => {
      showToast("Expiry sweep executed");
      await refreshAll();
    });
  });

  btnClearFinished.addEventListener("click", async () => {
    const tempFiles = await getTempFiles();
    let count = 0;
    for (const [id, f] of Object.entries(tempFiles)) {
      if (f.status === "trashed" || f.status === "missing" || f.status === "promoted") {
        delete tempFiles[id];
        count++;
      }
    }
    await chrome.storage.local.set({ tempFiles });
    showToast(`Cleaned ${count} completed records`);
    await refreshAll();
  });

  // --------------------------------------------------------------------------
  // Rules Engine UI
  // --------------------------------------------------------------------------
  async function renderRules() {
    const rules = await getRules();
    rulesListContainer.innerHTML = "";

    if (rules.length === 0) {
      rulesListContainer.innerHTML = `<div class="table-empty">No auto-routing rules configured yet.</div>`;
      return;
    }

    rules.forEach((rule, idx) => {
      const card = document.createElement("div");
      card.className = "rule-item-card";

      let patternDisplay = "";
      if (rule.matchType === "domain") {
        patternDisplay = `🌐 Domain: <span class="rule-pattern-text">${rule.pattern}</span>`;
      } else if (rule.matchType === "extension") {
        patternDisplay = `📄 Extension: <span class="rule-pattern-text">.${rule.pattern}</span>`;
      } else {
        patternDisplay = `🌐 Domain: <span class="rule-pattern-text">${rule.domainPattern}</span> + 📄 Ext: <span class="rule-pattern-text">.${rule.extensionPattern}</span>`;
      }

      const actionText = rule.choice === "temporary" 
        ? `Auto-Route to Temporary (${rule.retentionDays || 7} Days)` 
        : `Auto-Route to Permanent`;

      card.innerHTML = `
        <div>
          <div>${patternDisplay}</div>
          <div class="rule-meta-tag">${actionText}</div>
        </div>
        <div class="action-row-btns">
          <label class="switch" style="transform: scale(0.85);" title="Toggle rule">
            <input type="checkbox" class="rule-toggle" data-idx="${idx}" ${rule.enabled ? "checked" : ""}>
            <span class="slider-round"></span>
          </label>
          <button class="action-icon-btn trash-hover" data-rule-delete="${idx}" title="Delete Rule">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      rulesListContainer.appendChild(card);
    });

    // Toggle rule events
    document.querySelectorAll(".rule-toggle").forEach((toggle) => {
      toggle.addEventListener("change", async (e) => {
        const idx = parseInt(e.target.getAttribute("data-idx"), 10);
        const currentRules = await getRules();
        currentRules[idx].enabled = e.target.checked;
        await saveRules(currentRules);
        showToast("Rule updated");
      });
    });

    // Delete rule events
    document.querySelectorAll("[data-rule-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.getAttribute("data-rule-delete"), 10);
        const currentRules = await getRules();
        currentRules.splice(idx, 1);
        await saveRules(currentRules);
        showToast("Rule deleted");
        await renderRules();
      });
    });
  }

  btnAddNewRule.addEventListener("click", () => {
    ruleFormCard.style.display = "flex";
  });

  btnCancelRule.addEventListener("click", () => {
    ruleFormCard.style.display = "none";
  });

  ruleMatchType.addEventListener("change", () => {
    const val = ruleMatchType.value;
    if (val === "domain") {
      groupPattern.style.display = "flex";
      groupDomainPattern.style.display = "none";
      groupExtPattern.style.display = "none";
      lblRulePattern.textContent = "Domain Pattern";
      rulePattern.placeholder = "*.slack.com";
    } else if (val === "extension") {
      groupPattern.style.display = "flex";
      groupDomainPattern.style.display = "none";
      groupExtPattern.style.display = "none";
      lblRulePattern.textContent = "File Extension (without dot)";
      rulePattern.placeholder = "dmg, pdf, zip";
    } else {
      groupPattern.style.display = "none";
      groupDomainPattern.style.display = "flex";
      groupExtPattern.style.display = "flex";
    }
  });

  ruleChoice.addEventListener("change", () => {
    groupRuleRetention.style.display = ruleChoice.value === "temporary" ? "flex" : "none";
  });

  btnSaveRule.addEventListener("click", async () => {
    const matchType = ruleMatchType.value;
    const choice = ruleChoice.value;
    const retention = parseInt(ruleRetentionDays.value, 10) || 7;

    const newRule = {
      id: "rule_" + Date.now(),
      matchType,
      choice,
      retentionDays: choice === "temporary" ? retention : 0,
      enabled: true
    };

    if (matchType === "both") {
      newRule.domainPattern = ruleDomainPattern.value.trim();
      newRule.extensionPattern = ruleExtPattern.value.trim();
      if (!newRule.domainPattern || !newRule.extensionPattern) {
        alert("Please specify both domain and extension patterns.");
        return;
      }
    } else {
      newRule.pattern = rulePattern.value.trim();
      if (!newRule.pattern) {
        alert("Please enter a match pattern.");
        return;
      }
    }

    const currentRules = await getRules();
    currentRules.push(newRule);
    await saveRules(currentRules);

    ruleFormCard.style.display = "none";
    showToast("New routing rule saved!");
    await renderRules();
  });

  // --------------------------------------------------------------------------
  // Preferences Settings UI
  // --------------------------------------------------------------------------
  async function loadSettingsUI() {
    const settings = await getSettings();
    settingRetentionSlider.value = settings.defaultRetentionDays || 7;
    settingRetentionVal.textContent = `${settingRetentionSlider.value} Days`;
    settingWarnHours.value = String(settings.warnBeforeExpiryHours || 24);
    settingPromptTimeout.value = String(settings.promptTimeoutSeconds || 15);
    settingShowNotifications.checked = settings.showNotifications !== false;
    settingFastDebug.checked = Boolean(settings.debugFastExpiry);
  }

  settingRetentionSlider.addEventListener("input", (e) => {
    settingRetentionVal.textContent = `${e.target.value} Days`;
  });

  btnSaveSettings.addEventListener("click", async () => {
    await saveSettings({
      defaultRetentionDays: parseInt(settingRetentionSlider.value, 10),
      warnBeforeExpiryHours: parseInt(settingWarnHours.value, 10),
      promptTimeoutSeconds: parseInt(settingPromptTimeout.value, 10),
      showNotifications: settingShowNotifications.checked,
      debugFastExpiry: settingFastDebug.checked
    });
    showToast("Preferences saved successfully!");
  });

  // --------------------------------------------------------------------------
  // Native Helper Diagnostic
  // --------------------------------------------------------------------------
  async function runHostDiagnostic() {
    diagTitle.textContent = "Connecting to Native Host...";
    diagTag.textContent = "TESTING";
    diagTag.style.background = "rgba(245, 158, 11, 0.15)";
    diagTag.style.color = "#fbbf24";
    diagDot.className = "diag-dot";

    chrome.runtime.sendMessage({ action: "PING_HOST" }, (res) => {
      if (res && res.ok) {
        diagDot.className = "diag-dot connected";
        diagTitle.textContent = "Native Messaging Host Connected";
        diagTag.textContent = "ACTIVE";
        diagTag.style.background = "rgba(16, 185, 129, 0.15)";
        diagTag.style.color = "#34d399";
        diagDesc.textContent = "Privileged OS Recycle Bin helper is active and ready to process ephemeral file expirations.";
        navHostDot.className = "status-dot-nav active";
      } else {
        diagDot.className = "diag-dot error";
        diagTitle.textContent = "Native Host Disconnected / Not Installed";
        diagTag.textContent = "DISCONNECTED";
        diagTag.style.background = "rgba(244, 63, 94, 0.15)";
        diagTag.style.color = "#fb7185";
        diagDesc.textContent = "Chrome could not connect to com.tempdrop.host. Run the setup script below to register the host manifest in your OS registry.";
        navHostDot.className = "status-dot-nav";
      }
    });
  }

  btnTestNativePing.addEventListener("click", runHostDiagnostic);
});
