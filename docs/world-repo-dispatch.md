# Rebuilding the site when a world repo changes

The Stories repo has no stories. They are pulled from the world repos at build time, so a push to a world repo's `main` does nothing here until the site is rebuilt. Two triggers cover that:

| Trigger | Where | Role |
|---|---|---|
| `workflow_dispatch` call from the world repo | A small workflow in each world repo (this page) | Primary. Rebuilds within a minute or two of a push. |
| Nightly `schedule` (03:17 UTC) | [build.yml](../.github/workflows/build.yml) | Backstop. Catches a missed or failed dispatch. |

Nothing in this document is installed. The workflow below is text to copy into each world repo when you choose to.

## 1. Create the token

Use a **fine-grained personal access token** (GitHub: Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token).

| Setting | Value |
|---|---|
| Resource owner | `RobertBeverton` |
| Repository access | **Only select repositories**, then `RobertBeverton/Stories` and nothing else |
| Repository permissions | **Actions: Read and write** |
| Everything else | No access (Metadata: Read-only is added automatically) |
| Expiration | Up to you. Note the date and add the calendar reminder (section 4). |

GitHub's permissions table lists `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` under the **Actions** repository permission, write level. That permission does not allow pushing code or changing files, so a leaked token can only start or cancel workflow runs on this one repo. Do not use a classic token: its `repo` scope grants push access to every repo.

Store it in **each world repo** as an Actions secret named `STORIES_DISPATCH_TOKEN` (repo Settings, Secrets and variables, Actions, New repository secret). Never commit it.

## 2. Add the workflow to each world repo

Save as `.github/workflows/notify-stories.yml` in the world repo (`isles-of-yum`, `bramble-wall`, and later the Gods repo):

```yaml
name: Rebuild Stories site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions: {}

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Ask the Stories repo to rebuild
        env:
          GH_TOKEN: ${{ secrets.STORIES_DISPATCH_TOKEN }}
        run: |
          gh api --method POST \
            repos/RobertBeverton/Stories/actions/workflows/build.yml/dispatches \
            -f ref=main
```

Notes:

- `build.yml` is the workflow file name in the Stories repo. `ref` must be a branch or tag, here `main`, which is the branch that deploys. Only runs on `main` publish to Pages.
- The call needs no `inputs`. `build.yml`'s `workflow_dispatch` takes none.
- The `gh` CLI is preinstalled on GitHub-hosted runners. The equivalent with curl:

  ```bash
  curl -fsS -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    https://api.github.com/repos/RobertBeverton/Stories/actions/workflows/build.yml/dispatches \
    -d '{"ref":"main"}'
  ```

  A successful call returns a 2xx status (historically 204 with no body, GitHub's current REST docs describe 200 with run details). Treat any non-2xx as failure. `gh api` and `curl -f` already fail the step.
- Pushes to several world repos at once start several runs. The build's concurrency group cancels in-progress runs only when the ref is not `main`, so main builds are not cancelled mid-run. GitHub keeps one running and one pending run per concurrency group, and replaces an older pending run with the newest. That is safe: each build fetches the latest content.
- `repository_dispatch` (event type `content-updated`) is still accepted by `build.yml`, but `workflow_dispatch` is simpler and is the recommended route.

## 3. The scheduled build can silently stop

GitHub **disables scheduled workflows in a public repository after 60 days with no repository activity**. The commits happen in the world repos, not in Stories, so a quiet spell here can switch the nightly build off without any failure message beyond a notice email. Scheduled runs also use UTC, run only from the default branch's latest commit, and can be delayed under load (hence 03:17, not 03:00).

Because the world-repo dispatch is the primary trigger, losing the nightly build is survivable, but it removes the backstop. To re-enable: Actions tab, select **Build and Deploy**, click **Enable workflow**. Any push to Stories also resets the clock.

## 4. Operations checklist

Add these to the operations calendar:

- **Token expiry.** A reminder two weeks before the fine-grained token's expiry date. When it lapses, world-repo dispatches fail (the world repo's Actions tab shows a red run) and only the nightly build keeps the site fresh. To rotate: generate a new token with the same settings, update the `STORIES_DISPATCH_TOKEN` secret in every world repo.
- **Quarterly check** (every 3 months): open the Stories Actions tab and confirm that
  1. a scheduled run happened in the last day or two (the **Build and Deploy** workflow is not showing "disabled"), and
  2. a recent run was triggered by `workflow_dispatch` from a world-repo push, by pushing a trivial change to one world repo and watching the run appear.
- **Adding a world.** Create the secret and the workflow file in the new repo, and add it to `content-sources.json`.
