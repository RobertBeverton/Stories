import { BUILD_ID } from "../../scripts/build-id.mjs";

// A content hash of the build inputs (see scripts/build-id.mjs), shared with the
// import map and the CSP hash.
export default () => BUILD_ID;
