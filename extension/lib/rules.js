/**
 * TempDrop Auto-Classification Rules Engine
 * Evaluates downloads against per-domain and per-extension rules.
 */

/**
 * Checks if a hostname matches a wildcard domain pattern (e.g., "*.slack.com" or "zoom.us").
 */
export function matchDomain(pattern, hostname) {
  if (!pattern || !hostname) return false;
  pattern = pattern.trim().toLowerCase();
  hostname = hostname.trim().toLowerCase();

  if (pattern === "*" || pattern === "*.*") return true;

  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith("." + suffix);
  }

  if (pattern.startsWith(".")) {
    const suffix = pattern.slice(1);
    return hostname === suffix || hostname.endsWith("." + suffix);
  }

  return hostname === pattern;
}

/**
 * Checks if a filename matches an extension pattern (e.g., "dmg", "pdf", ".zip").
 */
export function matchExtension(pattern, filename) {
  if (!pattern || !filename) return false;
  pattern = pattern.trim().toLowerCase().replace(/^\./, "");
  
  const ext = filename.split(".").pop().toLowerCase();
  return ext === pattern;
}

/**
 * Extracts hostname safely from a URL.
 */
export function extractHostname(urlStr) {
  if (!urlStr) return "";
  try {
    const url = new URL(urlStr);
    return url.hostname;
  } catch {
    return "";
  }
}

/**
 * Evaluates an incoming download item against a list of rules.
 * Returns { matched: true, rule, choice, retentionDays } or { matched: false }.
 */
export function evaluateDownloadRules(item, rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { matched: false };
  }

  const hostname = extractHostname(item.finalUrl || item.url);
  const filename = item.filename || "";

  for (const rule of rules) {
    if (!rule.enabled) continue;

    let isMatch = false;

    if (rule.matchType === "domain" && rule.pattern) {
      isMatch = matchDomain(rule.pattern, hostname);
    } else if (rule.matchType === "extension" && rule.pattern) {
      isMatch = matchExtension(rule.pattern, filename);
    } else if (rule.matchType === "both" && rule.domainPattern && rule.extensionPattern) {
      isMatch = matchDomain(rule.domainPattern, hostname) && matchExtension(rule.extensionPattern, filename);
    }

    if (isMatch) {
      return {
        matched: true,
        rule,
        choice: rule.choice || "temporary",
        retentionDays: rule.choice === "temporary" ? (rule.retentionDays || 7) : 0
      };
    }
  }

  return { matched: false };
}
