# Contributing

Thanks for looking. The most useful thing you can send is **a build that does
not work**: an archive UISandbox refuses, renders wrong, or turns badly. That is
the whole job of this tool and every real build is a new opinion about CSS.

There is a [build report template](.github/ISSUE_TEMPLATE/build-report.md), and
the app fills most of it in for you: the stage foot has a *Report this build*
link that carries what it read. A public repo URL or a link to the build is worth
more than a description of it.

Questions and ideas go in
[Discussions](https://github.com/Ideelab/uisandbox/discussions). Security issues
do not: see [SECURITY.md](SECURITY.md).

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5190
pnpm test       # vitest + node:test, no browser needed
pnpm typecheck
pnpm build
```

`pnpm test` is fast and needs nothing but the repo. Run it before anything else.

## The 1:1 gate

Everything here rests on one claim: a build in the sandbox renders **exactly** as
it does on its own. Every CSS literal is replaced by a variable holding that same
literal, so at rest nothing has changed, and the app has a button that proves it
by diffing the computed styles of every element against the untouched build.

If you touch `src/sandbox/` at all, and especially `rewrite.ts`, run the gate:

```bash
cp public/samples/*.zip fixtures/ && pnpm holdouts
```

Three real builds ship with the repo (the Bootstrap 5.3 docs, vitepress.dev, and
an SB Admin dashboard) and that takes about 25 seconds. It loads each one in
headless Chromium, runs the 1:1 check and the reach meter, and holds the verdicts
against [`scripts/holdouts.expect.json`](scripts/holdouts.expect.json). Anything
expected `ok` that is not `ok` exits non-zero.

Add your own builds by dropping more zips in `fixtures/` (they are gitignored, so
they stay yours) and recording what they do:

```bash
pnpm holdouts -- --only my-build --record
```

`--record` merges: it writes verdicts only for what it just ran, and leaves the
rest of the file alone. A fixture whose verdict is not `ok` is not automatically
a bug: `no-load` and `refused` are real answers for source trees, native
projects and archives without a build. What matters is that a verdict does not
CHANGE because of your patch.

The maintainer's own corpus is 165 archives from public repos. It is not in the
repo, because it is a few gigabytes of other people's code, so the three samples
are what a pull request is held to here.

## What tends to go wrong

Two failure modes have cost more time here than anything else, and both are worth
knowing before you start.

**"It changed after my edit" is a hypothesis.** The revert is what turns it into
an answer. If a fixture flips, put the file back and run it again before you
believe your own change caused it. Some of these builds are genuinely
non-deterministic and the control frame moves on its own.

**The instrument lies as often as the thing measured.** If a probe reports zero,
ask whether it ran at all. A checker that cannot tell "it did not work" from "I
did not run it" will hand you a confident wrong answer. Include a control: a
build where nothing should change, a knob that should not move.

## The notes

[`notes/decisions.md`](notes/decisions.md) is a numbered log of every decision
and every trap, including the ones that had to be undone. If your change is more
than a typo, add an entry: what you changed, what you measured, and what you
measured it against. It is the most useful file in the repo and the reason
anyone can pick this up later.

[`notes/design.md`](notes/design.md) is the chrome's design system. The app
around the sandbox must never compete with the design it is showing, so a new
floating surface is a `.popcard` or a `.dialog`, every colour goes through a
token, and card titles are one size.

## House style

Plain sentences. Colons and semicolons rather than em dashes, and `·` as the
separator in metadata rows. British spelling in prose, American in CSS
properties, because that is what CSS is.

A label may not promise more than the thing does. If a claim in the interface
cannot be checked by the person reading it, either make it checkable or do not
make it.
