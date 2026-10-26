# Commit what the admin page writes

**English** · [简体中文](../zh/docs/files.md)

By the end of this page, you know which files the admin page creates and which belong in version control. Scenes and routes you create in the browser are written to your mock folder so they can be shared; runtime state stays out of the repository.

| File                                             | Contents                                                                                                                                   | Commit it?                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `<mock folder>/__scenes__/*.json`                | Scenes created or recorded on the admin page, one file per route                                                                           | Yes, recommended                                                                              |
| `<mock folder>/__scenes__/<scene file name>/`    | Response body files of that route's file scenes; deleted with the scene that uses them                                                     | Yes, recommended                                                                              |
| `<mock folder>/__gui__.json`                     | Routes created on the admin page                                                                                                           | Yes, recommended                                                                              |
| `<mock folder>/__debug__/requests/__refs__.json` | Which scenes reference which debug snapshots; rebuilt from `__scenes__/` whenever routes reload                                            | Yes; on a merge conflict, delete it and it is rebuilt                                         |
| `<mock folder>/__debug__/`                       | Debug requests, environments, snapshots, and redaction rules from the debug page; `environments/secret/` and `history/` exclude themselves | Partly; see [Debug real APIs from the admin page](debug.md#commit-what-the-debug-page-writes) |
| `node_modules/.cache/easy-mok/state.json`        | Picked scenes, delays, status codes, scene groups, the global switch, ignore rules, and the active debug environment                       | No; it resets when you delete `node_modules`                                                  |

The state file location can be changed with the `stateFile` option; see [Options and environment variables](options.md).

## Replay saved routes and scenes

A route in `__gui__.json` whose value is `null` replays a JSON `null` body. An empty response saved as a scene, such as a 204 or a DELETE without a body, replays an empty body.

## Fix a hand-edited `__gui__.json`

If `__gui__.json` is not a valid JSON object, for example after a hand edit left a trailing comma, the admin page refuses to change it instead of overwriting your edits. The admin API answers with the error code `GUI_FILE_INVALID`; fix or delete the file, then retry.

## Recover when a new route fails to load

If a route created on the admin page fails to load, easy-mok rolls back `__gui__.json` and the route's scene file to their previous content, so no broken entry is left behind. The admin API answers with the error code `LOAD_ERROR`, a message with the reason, and the related diagnostics.
