# Offline listening: device checklist

For the two Samsung Galaxy Tab A9 tablets (Chrome on Android). Do this at home on wifi after a deploy, once per tablet.

## Before the flight

1. Save everything **before** you leave, on wifi. Nothing can be saved in the air.
2. Open the Offline page, expand the world, and check every story you want reads "Saved" (plain text on its row) and the meter looks right. In the Library, saved stories show the Saved badge.
3. Test in airplane mode at home (steps 5 to 7 below) while you can still fix things.
4. Charge the tablets and bring headphones.
5. Do not clear Chrome's site data or storage before the flight.

## Checklist

1. **Install and open.** Open `https://robertbeverton.github.io/Stories/` in Chrome. Menu, **Add to Home screen**, then open the app from its icon.
2. **Meter.** Go to the Offline tab. The free space should read in gigabytes, not 0.
3. **Save two stories.** Open a story, tap Save for offline, and watch the progress. When done each shows Saved, and the Offline meter grows.
4. **Lock mid-download.** Start a save, lock the screen for a minute, unlock. The story must either finish or show Retry. It must never show as saved when it is not. Tap Retry if shown.
5. **Airplane mode.** Turn it on. Close the app fully (swipe it away from recents) and reopen it from the icon (this is also the "reopen Chrome offline" test). Home, Library and Offline must load. Saved stories show the Saved badge and the others look dimmed.
6. **Play and seek.** Play a saved story with headphones. Seek forward and back, and tap the middle of the bar.
7. **Lock and resume.** Lock the screen mid-story, resume from the lock screen controls, and let the sleep timer run out once.
8. **Unsaved story.** Open one that is not saved. The Offline page should appear, not a browser error.
9. **Back on wifi.** Turn airplane mode off. Remove one story from the Offline page and confirm the meter drops and the badge goes.
10. **Save a whole world.** On the Offline page save everything for one world. Watch the totals and progress, and check each story ends saved.
11. **Large selection and free space.** Try to save everything. If it will not fit it must say how much is needed against how much is free and save nothing, rather than failing part way.
12. **Update available.** To simulate a re-narration: on a laptop, change one saved story's `audioUrl` `?v=` value in its world repo (any other working value for the same file is enough), push, and let the site deploy. On the tablet, online, open the Offline page. That story shows "Update available" as plain text on its row. Tick the story and press Save (or press "Update available" on the story page) and confirm it re-saves and the state clears.
13. **Kill switch.** Open `https://robertbeverton.github.io/Stories/?sw=off`. The site must still work, now without offline. Open `...?sw=on` and reload to turn it back on, then check the saved stories are still there.

## If Chrome clears site data

Android can clear a site's storage when space is low, or if someone clears it by hand. Saved stories then show as not saved. Nothing else is lost except reading progress held in that storage. Go online and save them again from the Offline page.
