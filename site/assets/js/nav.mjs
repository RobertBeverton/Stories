// Navigation seam. Modules call nav.go(url) so tests (and the wave 2 router)
// can intercept it.
export const nav = {
  go(url) {
    window.location.assign(url);
  },
};
