/**
 * TempDrop Prompt Popup Controller
 */

function formatBytes(bytes) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const downloadId = params.get("downloadId");
  const filename = params.get("filename") || "download";
  const fileSize = parseInt(params.get("fileSize") || "0", 10);
  const domain = params.get("domain") || "website";
  const defaultRetention = parseInt(params.get("defaultRetention") || "7", 10);
  const totalTimeoutSeconds = parseInt(params.get("timeout") || "15", 10);

  // DOM Elements
  const fileNameEl = document.getElementById("fileName");
  const fileSizeEl = document.getElementById("fileSize");
  const fileDomainEl = document.getElementById("fileDomain");
  const fileExtTagEl = document.getElementById("fileExtTag");
  const timerTextEl = document.getElementById("timerText");
  const timerBarEl = document.getElementById("timerBar");
  const btnTemporary = document.getElementById("btnTemporary");
  const btnPermanent = document.getElementById("btnPermanent");
  const chkRememberRule = document.getElementById("chkRememberRule");
  const lblRememberRule = document.getElementById("lblRememberRule");
  const retentionPills = document.querySelectorAll(".pill");
  const containerEl = document.querySelector(".prompt-container");

  // Populate File Information
  fileNameEl.textContent = filename;
  fileNameEl.title = filename;
  fileSizeEl.textContent = formatBytes(fileSize);
  fileDomainEl.textContent = domain || "Local / Direct";
  fileDomainEl.title = domain;

  const extMatch = filename.split(".").pop();
  if (extMatch && extMatch !== filename) {
    fileExtTagEl.textContent = extMatch.slice(0, 4).toUpperCase();
  } else {
    fileExtTagEl.textContent = "FILE";
  }

  lblRememberRule.textContent = domain ? `Always save downloads from ${domain} this way` : `Always save this filetype this way`;

  // State
  let selectedRetentionDays = defaultRetention;
  let isPaused = false;
  let hasSubmitted = false;
  let remainingMs = totalTimeoutSeconds * 1000;
  const intervalStepMs = 100;

  // Set active retention pill matching default
  retentionPills.forEach((pill) => {
    const days = parseInt(pill.getAttribute("data-days"), 10);
    if (days === defaultRetention) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }

    pill.addEventListener("click", () => {
      retentionPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      selectedRetentionDays = days;
    });
  });

  // Hover to pause countdown
  containerEl.addEventListener("mouseenter", () => { isPaused = true; });
  containerEl.addEventListener("mouseleave", () => { isPaused = false; });

  // Countdown timer loop
  const timerInterval = setInterval(() => {
    if (!isPaused && !hasSubmitted) {
      remainingMs -= intervalStepMs;
      const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
      timerTextEl.textContent = `${secondsLeft}s`;

      const progressRatio = Math.max(0, remainingMs / (totalTimeoutSeconds * 1000));
      timerBarEl.style.width = `${progressRatio * 100}%`;

      if (remainingMs <= 0) {
        clearInterval(timerInterval);
        submitChoice("permanent");
      }
    }
  }, intervalStepMs);

  function submitChoice(choice) {
    if (hasSubmitted) return;
    hasSubmitted = true;
    clearInterval(timerInterval);

    const saveRule = chkRememberRule.checked;
    let ruleData = null;

    if (saveRule) {
      if (domain) {
        ruleData = {
          id: "rule_" + Date.now(),
          matchType: "domain",
          pattern: `*.${domain.replace(/^www\./, "")}`,
          choice: choice,
          retentionDays: choice === "temporary" ? selectedRetentionDays : 0,
          enabled: true
        };
      } else if (extMatch) {
        ruleData = {
          id: "rule_" + Date.now(),
          matchType: "extension",
          pattern: extMatch.toLowerCase(),
          choice: choice,
          retentionDays: choice === "temporary" ? selectedRetentionDays : 0,
          enabled: true
        };
      }
    }

    chrome.runtime.sendMessage({
      type: "TEMPDROP_PROMPT_CHOICE",
      downloadId,
      choice,
      retentionDays: selectedRetentionDays,
      saveRule,
      ruleData
    });

    window.close();
  }

  btnTemporary.addEventListener("click", () => submitChoice("temporary"));
  btnPermanent.addEventListener("click", () => submitChoice("permanent"));

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "t" || e.key === "T") {
      submitChoice("temporary");
    } else if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      submitChoice("permanent");
    } else if (e.key === "Enter") {
      submitChoice("temporary");
    }
  });
});
