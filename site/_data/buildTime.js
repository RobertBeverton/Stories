import { BUILD_TIME } from "../../scripts/page-security.mjs";

// One value per process, shared with the import map and the CSP hash.
export default () => BUILD_TIME;
