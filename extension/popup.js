/**
 * TempDrop Popup Toolbar Dashboard Controller
 */

import { getSettings, getTempFiles, getStats } from './lib/storage.js';

function formatBytes(bytes) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function getRelativeTime(expiresAt) {
  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) {
    return { text: "Expired (Sweeping)", class: "danger" };
  }
  const hours = Math.round(diffMs / (3600 * 1000));
  const days = Math.floor(hours / 24);

  if (days > 1) {
    return { text: `Expires in ${days}d`, class: "active" };
  } else if (hours >= 1) {
    return { text: `Expires in ${hours}h`, class: hours <= 24 ? "warning" : "active" };
  } else {
    const mins = Math.max(1, Math.round(diffMs / (60 * 1000)));
    return { text: `Expires in ${mins}m`, class: "danger" };
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const hostStatusPill = document.getElementById("hostStatusPill");
  const hostStatusText = document.getElementById("hostStatusText");
  const helperBanner = document.getElementById("helperBanner");
  const statActiveCount = document.getElementById("statActiveCount");
  const statExpiringCount = document.getElementById("statExpiringCount");
  const statSavedSpace = document.getElementById("statSavedSpace");
  const fileListEl = document.getElementById("fileList");
  const emptyStateEl = document.getElementById("emptyState");
  const btnSweepNow = document.getElementById("btnSweepNow");
  const btnOpenOptions = document.getElementById("btnOpenOptions");
  const btnOpenHelperSettings = document.getElementById("btnOpenHelperSettings");

  // Check Host Status
  try {
    chrome.runtime.sendMessage({ action: "GET_STATUS" }, (response) => {
      const isInstalled = response && response.nativeHostInstalled;
      if (isInstalled) {
        hostStatusPill.className = "host-pill active";
        hostStatusText.textContent = "Host Active";
        helperBanner.style.display = "none";
      } else {
        hostStatusPill.className = "host-pill inactive";
        hostStatusText.textContent = "Helper Missing";
        helperBanner.style.display = "flex";
      }
    });
  } catch (e) {
    hostStatusPill.className = "host-pill inactive";
    hostStatusText.textContent = "Offline";
  }

  // Render Stats & Files
  await refreshDashboard();

  async function refreshDashboard() {
    const stats = await getStats();
    statActiveCount.textContent = stats.activeCount;
    statExpiringCount.textContent = stats.expiringSoonCount;
    statSavedSpace.textContent = formatBytes(stats.totalSavedBytes);

    const files = await getTempFiles();
    const activeList = Object.values(files).filter(
      (f) => f.status === "active" || f.status === "expiring-soon" || f.status === "trash-failed"
    );

    // Sort by expiresAt ascending (soonest first)
    activeList.sort((a, b) => a.expiresAt - b.expiresAt);

    fileListEl.innerHTML = "";

    if (activeList.length === 0) {
      fileListEl.style.display = "none";
      emptyStateEl.style.display = "block";
    } else {
      fileListEl.style.display = "flex";
      emptyStateEl.style.display = "none";

      for (const item of activeList) {
        const itemEl = document.createElement("div");
        itemEl.className = "file-item";
        itemEl.id = `item-${item.downloadId}`;

        const shortName = (item.filename || "file").split(/[\\/]/).pop();
        const ext = shortName.split(".").pop().slice(0, 4).toUpperCase();
        const timeInfo = getRelativeTime(item.expiresAt);

        itemEl.innerHTML = `
          <div class="item-icon">${ext || "FILE"}</div>
          <div class="item-info">
            <div class="item-name" title="${shortName}">${shortName}</div>
            <div class="item-meta">
              <span class="expiry-tag ${timeInfo.class}">${timeInfo.text}</span>
              <span>•</span>
              <span>${formatBytes(item.fileSize)}</span>
            </div>
          </div>
          <div class="item-actions">
            <button class="item-btn" title="Extend retention +7 days" data-action="extend" data-id="${item.downloadId}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
            </button>
            <button class="item-btn btn-promote" title="Keep permanently" data-action="promote" data-id="${item.downloadId}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
              </svg>
            </button>
            <button class="item-btn btn-trash" title="Move to Recycle Bin now" data-action="trash" data-id="${item.downloadId}" data-path="${item.absolutePath}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;

        fileListEl.appendChild(itemEl);
      }
    }
  }

  // Event Delegation for File Actions
  fileListEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const downloadId = btn.getAttribute("data-id");
    const path = btn.getAttribute("data-path");
    const itemCard = document.getElementById(`item-${downloadId}`);

    btn.disabled = true;

    if (action === "trash") {
      chrome.runtime.sendMessage({ action: "TRASH_FILE", downloadId, path }, async (res) => {
        if (res && res.ok) {
          if (itemCard) {
            itemCard.style.opacity = "0.4";
            itemCard.style.transform = "translateX(20px)";
            setTimeout(refreshDashboard, 200);
          }
        } else {
          alert(`Could not trash file: ${res ? res.error : "Native host error"}`);
          btn.disabled = false;
        }
      });
    } else if (action === "promote") {
      chrome.runtime.sendMessage({ action: "PROMOTE_FILE", downloadId }, async () => {
        if (itemCard) {
          itemCard.style.opacity = "0.4";
          setTimeout(refreshDashboard, 200);
        }
      });
    } else if (action === "extend") {
      chrome.runtime.sendMessage({ action: "EXTEND_FILE", downloadId, additionalDays: 7 }, async () => {
        await refreshDashboard();
      });
    }
  });

  // Sweep Now Action
  btnSweepNow.addEventListener("click", () => {
    btnSweepNow.classList.add("spinning");
    chrome.runtime.sendMessage({ action: "RUN_SWEEP_NOW" }, async () => {
      setTimeout(async () => {
        btnSweepNow.classList.remove("spinning");
        await refreshDashboard();
      }, 500);
    });
  });

  // Navigation
  btnOpenOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  if (btnOpenHelperSettings) {
    btnOpenHelperSettings.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }
});
