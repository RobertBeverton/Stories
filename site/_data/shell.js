// Build flags for the app shell. Default export only (see site/_data/stories.js).
// STORIES_ROUTER=off builds the site with the router disabled (<html data-router="off">):
// every link is a normal page load. See site/assets/js/router.mjs for the other
// two switches (localStorage and ?router=off).
export default function () {
  return { router: process.env.STORIES_ROUTER !== "off" };
}
