// Tests for shared/permission-error.mjs. Run: node scripts/test-permission-error.mjs
import { isPermissionDenied } from '../shared/permission-error.mjs';

let checks = 0;
function check(label, condition) {
  if (!condition) { console.error('FAILED:', label); process.exit(1); }
  checks++;
}
const withCode = (code, message) => Object.assign(new Error(message), { code });

// The shapes the Firebase web SDK produced against the real project
check('a refused write: code and message', isPermissionDenied(withCode('PERMISSION_DENIED', 'PERMISSION_DENIED: Permission denied')));
check('a refused read: message with a space and no code', isPermissionDenied(new Error('Permission denied')));
check('the same message in other letter case', isPermissionDenied(new Error('permission denied')) && isPermissionDenied(new Error('PERMISSION DENIED')));
check('the underscore form without a code', isPermissionDenied(new Error('permission_denied at /tables/x')));
check('code alone is enough', isPermissionDenied(withCode('PERMISSION_DENIED', '')));
check('code alone, message missing', isPermissionDenied({ code: 'PERMISSION_DENIED' }));
check('a plain object with only a message', isPermissionDenied({ message: 'Permission denied' }));

// Things that must NOT count as "not allowed"
check('a network error is not a refusal', !isPermissionDenied(new Error('Failed to fetch')));
check('offline is not a refusal', !isPermissionDenied(new Error('Client is offline.')));
check('another code is not a refusal', !isPermissionDenied(withCode('NETWORK_ERROR', 'The network request failed')));
check('a validation message is not a refusal', !isPermissionDenied(new Error('Type a name first.')));
check('a word that merely contains "permission" is not a refusal', !isPermissionDenied(new Error('Ask for permission first')));
check('"denied" alone is not a refusal', !isPermissionDenied(new Error('Request denied')));
check('missing values are not a refusal', !isPermissionDenied(undefined) && !isPermissionDenied(null) && !isPermissionDenied({}) && !isPermissionDenied(''));
check('a message that is not a string does not crash', !isPermissionDenied({ message: 42 }));

console.log(`All ${checks} permission error checks passed.`);
