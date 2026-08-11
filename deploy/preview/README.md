# PR preview deployment

Each internal pull request gets an isolated preview at
`https://pr-<number>.preview.codingbot.kr`.

The preview is not an empty install. The deploy controller takes a fresh
`mongodump` of the production `issue_tracker` database, restores it into a
PR-local MongoDB container, and copies the production `server/storage` tree
into the PR-local app volume. Existing Mongo ObjectIds are preserved, so games,
builds, issues, articles, and their relationships render as they do in the
service at snapshot time.

The copy is intentionally sanitized before the PR app starts:

- user emails and OAuth/password credentials are replaced or removed;
- Discord webhooks and Gemini keys are removed;
- per-game backend secrets and backend flags are disabled;
- the preview app receives a new JWT secret and a disposable dashboard login.

The PR app and MongoDB share an internal Docker network. The app container has
no production env file, Docker socket, host storage mount, or external network
route. Writes are allowed inside the disposable copy so the preview behaves
like the service; PR redeploys replace that copy with a new production
snapshot. PR close removes the containers, storage, database, credentials, and
Apache vhost.

`previewctl.sh` is installed as a root-owned controller on the server. The
workflow passes only a validated PR number and commit SHA to it; the checked
out PR source is used as Docker build context but cannot change the controller,
Apache target, host mounts, or environment contract.

Apache terminates HTTPS and forwards the preview URL without an HTTP Basic Auth
prompt. Dashboard access still uses the preview-only login link emitted by the
controller; that link is regenerated whenever the preview is redeployed and is
not published as a credential in the public PR comment.

`preview-error-catchall.conf` is enabled after the per-PR vhosts. It prevents a
deleted preview hostname from falling through to another service's default
vhost, and returns the custom static error pages from `/var/www/preview-errors`
with the preview wildcard certificate.
