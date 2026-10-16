# Switch scenes and response behavior

**English** · [简体中文](../zh/docs/scenes.md)

By the end of this page, you can choose which scene each request gets, for yourself, your whole team, or a single test request, and change delay, status code, or passthrough at runtime. Scenes come from `scenes()` in your mock files or from the admin page; see [Write mock files](writing-mocks.md).

## Know which scene a request gets

easy-mok picks the scene from the first source that names one:

1. The request header `x-mock-scene: <scene>` or the query parameter `__scene=<scene>`, for E2E runs and parallel tabs
2. The scene group named by the cookie `__mock_group=<group>`, set by **Enable for this browser only** (`仅本浏览器启用`) on the admin page or the floating bar
3. The scene you picked for this route on the admin page
4. The global scene group
5. `default`

If the named scene does not exist, easy-mok falls back to the next level and marks the request as downgraded in the request log.

## Pick a scene per request in tests

```bash
curl -H "x-mock-scene: empty" http://127.0.0.1:4100/api/user/1
curl "http://127.0.0.1:4100/api/user/1?__scene=error"
```

The header and the query parameter select a scene for that request only and change no shared state, so parallel E2E runs do not interfere with each other.

## Switch many routes at once with scene groups

![Scene groups: bundle scenes of several routes, then make the group global or enable it for this browser only](images/groups.png)

A scene group bundles one scene per route, for example "logged out" (`未登录`) or "VIP user" (`VIP 用户`). **Set as global** (`设为全局`) applies the group to everyone using this dev server. **Enable for this browser only** writes the `__mock_group` cookie instead, so teammates sharing the dev server keep their own scenes.

## Write a scene as a script on the admin page

When a fixed JSON body is not enough, choose **JS script** (`JS 脚本`) in the scene editor and write a handler function, the same way you write one in a mock file:

```js
// the last statement must be a function; helpers and comments may come before it
const user = require("./_data/user.json"); // relative to the mock folder
(req, res, next) => ({ ...user, id: req.params.id, page: req.query.page })
```

The function receives the parsed `req.params`, `req.query`, and `req.body`. Its return value becomes the response body, unless it responds itself with `res` or calls `next()` to hand the request to your dev server. The status code and headers in the editor are defaults the script can override. Local files the script requires reload on save, like those of mock files. The script is saved in the route's scene file under `__scenes__/`; a script that does not compile is rejected on save, and a hand-edited one that does not compile shows up on the diagnostics page.

A script runs inside the mock server process with the same rights as your mock files, so easy-mok accepts script scenes only from the admin page on the same machine, even with `lan` on.

## Set delay, status code, or passthrough

![Behavior panel: delay, status code override, or passthrough to the real backend](images/behavior.png)

The **Behavior** tab (`行为`) of a route sets three things at runtime:

- A delay of 0-60000 ms; leave it empty for no delay. It overrides any delay stored in the scene itself.
- A status code override of 100-599; leave it empty to keep the scene's status. It applies to data, function, and proxy scenes alike.
- **Pass through to the real backend** (`放行到真实后端`): the route skips mocking and goes to your dev server's proxy or the next middleware, while all other routes stay mocked.

## Turn all mocks off

The switch in the admin page header turns mocking off for every route, so all requests pass through to the host. Writing `MOCK: false` in a mock file turns mocking off from code.
