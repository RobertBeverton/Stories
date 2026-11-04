// Navigation seam.
//   nav.go(url)    a full page load. The router's fallback, and the seam tests stub.
//   nav.open(url)  an in-app navigation: through the router while it runs, so the
//                  persistent <audio> keeps playing, else a full load. Modules use this.
export const nav = {
  /** Set by the router while it runs: (href) => Promise. */
  router: null,
  go(url) {
    window.location.assign(url);
  },
  open(url) {
    if (this.router) return this.router(url);
    return this.go(url);
  },
};
