import { pageSecurity } from "../../scripts/page-security.mjs";

// Default export only (see site/_data/stories.js). { json, hash, csp }: the
// import map body, its CSP hash and the whole policy, computed together so the
// hash always matches. buildTime.js reads the same BUILD_TIME.
export default function () {
  return pageSecurity();
}
