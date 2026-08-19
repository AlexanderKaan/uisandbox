# Security

UISandbox runs someone's built web app inside the tool, for real — its scripts execute, in a service-worker sandbox that is same-origin with the host page by necessity. What a dropped archive can and cannot do, measured with a hostile fixture, is written down in [notes/security.md](notes/security.md): top-navigation denied, worker takeover denied, zip-slip normalised, host DOM reachable by design (and holding nothing worth taking), the repo route as the one thing that leaves the tab.

## Reporting

Found a way for a dropped archive to reach beyond what that document says — steal something from the host origin, escape the sandbox, take over the worker, or make the 1:1 check lie? Please report it privately:

- GitHub: **Security → Report a vulnerability** on this repository (private advisory), or
- e-mail: amkaan@gmail.com — subject "UISandbox security".

Say what you dropped, what happened, and in which browser; a fixture zip is the best report. You will hear back within a few days; fixes land on `main` and at uisandbox.org in the same push, and the hold-out runner gets a fixture so it stays fixed.

## Scope

In scope: uisandbox.org, this repository, the `uisandbox-mcp` package. Out of scope: the content of archives you drop (they are yours), and findings that require a malicious archive to harm only the person who dropped it on their own machine — that is the threat model, and it is documented.
