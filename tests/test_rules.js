import { matchDomain, matchExtension, evaluateDownloadRules } from '../extension/lib/rules.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  } else {
    console.log(`  [PASS] ${message}`);
  }
}

console.log('--- Testing TempDrop Rules Engine ---');

// 1. Domain Matcher Tests
assert(matchDomain('*.slack.com', 'app.slack.com'), 'Wildcard sub-domain matches');
assert(matchDomain('*.slack.com', 'slack.com'), 'Wildcard root domain matches');
assert(!matchDomain('*.slack.com', 'notslack.com'), 'Wildcard mismatch fails');
assert(matchDomain('zoom.us', 'zoom.us'), 'Exact domain matches');
assert(!matchDomain('zoom.us', 'sub.zoom.us'), 'Exact domain does not match sub-domain without wildcard');

// 2. Extension Matcher Tests
assert(matchExtension('dmg', 'installer.dmg'), 'Extension dmg matches');
assert(matchExtension('.pdf', 'invoice.pdf'), 'Extension with dot matches');
assert(matchExtension('PDF', 'document.pdf'), 'Extension case-insensitivity matches');
assert(!matchExtension('exe', 'archive.zip'), 'Extension mismatch fails');

// 3. Rule Evaluation Tests
const rules = [
  { id: '1', matchType: 'domain', pattern: '*.slack.com', choice: 'temporary', retentionDays: 3, enabled: true },
  { id: '2', matchType: 'extension', pattern: 'dmg', choice: 'permanent', enabled: true },
  { id: '3', matchType: 'extension', pattern: 'tmp', choice: 'temporary', retentionDays: 1, enabled: false }
];

const item1 = { url: 'https://files.slack.com/files-pri/T0123-F456/notes.txt', filename: 'notes.txt' };
const res1 = evaluateDownloadRules(item1, rules);
assert(res1.matched && res1.choice === 'temporary' && res1.retentionDays === 3, 'Slack file routes to Temporary 3 days');

const item2 = { url: 'https://cdn.example.com/app.dmg', filename: 'app.dmg' };
const res2 = evaluateDownloadRules(item2, rules);
assert(res2.matched && res2.choice === 'permanent', 'DMG file routes to Permanent');

const item3 = { url: 'https://example.com/test.tmp', filename: 'test.tmp' };
const res3 = evaluateDownloadRules(item3, rules);
assert(!res3.matched, 'Disabled rule does not match');

console.log('\n[SUCCESS] All Rules Engine tests passed!\n');
