# Hongda Self-Hosted Runner Pool Setup

## Target

Run two independent Agent Control coding jobs at the same wall-clock time on the same Intel Mac.

V1 runner pool:

- existing runner: keep unchanged;
- second runner: new independent GitHub Actions runner service;
- both carry labels `self-hosted`, `macOS`, `X64`, `hongda-agent-control`;
- each runner has a different installation directory and `_work` directory.

Do **not** copy the existing runner's `.runner`, `.credentials`, `.credentials_rsaparams`, or `_diag` identity files into the second runner. The second runner must be registered as a separate runner identity through GitHub's official **New self-hosted runner** flow.

## Recommended directories and names

Use:

- runner 1: existing installation (do not move it during this upgrade);
- runner 2 directory: `~/actions-runner-hongda-2`;
- runner 2 name: `hongda-mac-lane-2`;
- custom label: `hongda-agent-control`.

The directory name is only a local convention. GitHub's generated registration token is short-lived and must not be pasted into repository files, chats, screenshots, logs, or task comments.

## One-time registration

On GitHub, open:

`lenchenalc-hongda/hongda-new-media-platform` → **Settings** → **Actions** → **Runners** → **New self-hosted runner**.

Choose:

- macOS
- x64

GitHub will display the current official download, checksum and `config.sh` registration command. Run those commands in a **new directory** (`~/actions-runner-hongda-2`) rather than the existing runner directory.

When the registration command asks for configuration:

- runner name: `hongda-mac-lane-2`
- additional label: `hongda-agent-control`
- work folder: accept `_work`

After registration, install/start it as a background service using the service commands shown by the downloaded runner package.

## Acceptance

The upgrade is ready for true parallel execution only when GitHub Settings → Actions → Runners shows **two Online/Idle runners** carrying `hongda-agent-control`.

Then trigger CPC and GLH project jobs at nearly the same time and verify:

1. both jobs leave `Queued` and become `In progress` concurrently;
2. each job reports a different `RUNNER_NAME`;
3. each job uses a different runner work directory;
4. neither changes the other's project-owned paths;
5. PM review sees separate project control states/PRs.

## Resource limit

Keep `MAX_PARALLEL_PROJECTS = 2` initially. Two concurrent Codex/DeepSeek jobs are a sensible starting point for the current Mac. Raise the limit only after observing CPU, RAM, thermal behavior and API rate limits during real work.
