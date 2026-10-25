# Allow other hosts, the LAN, and cross-origin pages

**English** · [简体中文](../zh/docs/security.md)

By the end of this page, you can reach mocks and the admin page from a custom domain, another device on your LAN, or a page on another origin, and you know which defaults stand in the way. easy-mok is built for development servers only; do not mount it in production.

## Open the admin page from another machine

The admin API can write to your mock folder, so by default it only accepts requests from the local machine. Write operations also require the header `x-mock-ui: 1`, a same-origin request, and the `application/json` content type.

To use the admin page from the LAN, turn on **Allow LAN access** (`局域网`) in the admin page header. Only an admin page opened on the local machine can flip this switch, and it resets to its initial value when easy-mok restarts; `lan: true`, `MOCK_LAN=1`, or `--lan` sets that initial value.

The switch only helps if LAN devices can reach the server:

- The standalone server listens on `127.0.0.1` by default. While the switch is on, it also listens on each private-network IPv4 address of this machine on the same port, and the page banner lists those addresses. With `--host 0.0.0.0` it is reachable from the LAN already.
- When easy-mok is mounted in a dev server, the dev server decides where it listens. If it only listens on the local machine, the header shows **LAN unreachable** (`局域网不可达`); start it with a LAN-facing host, such as `vite --host`.

While the switch is on, a banner at the top of every admin page reminds you that LAN devices can open the admin page.

## Use a custom domain

Add the domain to `hosts`, or set `MOCK_HOSTS=a.test,b.test`; a leading `.`, as in `.example.com`, also matches subdomains.

Mock routes that match a request check its Host header. `localhost`, `*.localhost`, any IP address (including LAN IPs), and the names in `hosts` pass; any other Host gets a 403 that explains how to allow it with `MOCK_HOSTS`. This stops an attacker from pointing their own domain at your machine (DNS rebinding) and reading mock and proxy responses as a same-origin page. Requests that match no mock are not checked and go to the host as usual.

Setting `hosts` to `*` turns off the Host check for mock routes; the admin API keeps checking. The Vite plugin uses Vite's `server.allowedHosts` when neither `hosts` nor `MOCK_HOSTS` is set.

## Let pages on other origins read mock responses

Mock responses send cross-origin headers only to trusted origins: `localhost` and `*.localhost`, loopback IPs, pages on the same Host as the request, pages on the same IP as the request on another port, and the names in `hosts`. Private-network IPs are trusted only while the LAN switch is on (its initial value comes from `lan`, `MOCK_LAN=1`, or `--lan`), so a page served by another machine on your LAN cannot read mock responses by default. easy-mok never echoes an arbitrary `Origin`.

Other web pages get no `access-control-allow-origin`, so the browser blocks them from reading the response. This keeps any website you happen to open from reading mock and proxy responses with your credentials. If your frontend runs on a custom domain, add it to `MOCK_HOSTS`.
