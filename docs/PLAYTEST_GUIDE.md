# Public Playtest Guide

FreNiMi Checkers needs useful feedback, not vague engagement. This guide helps
testers report results that improve the game and create honest public evidence.

## What To Test

Use the public offline demo first:

https://omobolajiadeyan.github.io/frenimi-checkers/

Focus on:

- board rendering on desktop and mobile;
- legal moves, captures, multi-jumps, and king movement;
- AI difficulty and game balance;
- installability as a Progressive Web App;
- keyboard and screen-reader usability;
- offline behavior after first load;
- any browser console errors.

The static demo does not provide ranked multiplayer. For server-backed
multiplayer, use the Node.js deployment and the
[deployment smoke test](DEPLOYMENT_SMOKE_TEST.md).

## How To Report Feedback

Comment on the public playtest issue:

https://github.com/omobolajiadeyan/frenimi-checkers/issues/4

Useful reports include:

- browser and operating system;
- device type and screen size;
- what mode you tested;
- steps to reproduce any problem;
- whether the game remained playable offline;
- screenshots only if they do not expose private data.

## What Counts As Strong Evidence

Strong playtest evidence:

- a reproducible bug report from a real tester;
- accessibility feedback with browser/device details;
- a public deployment smoke-test result;
- a pull request that improves a verified issue;
- a short public demo using `docs/SESSION_REVOCATION_DEMO.md`.

Weak evidence:

- empty stars or forks;
- generic comments without test details;
- private screenshots that cannot be verified;
- automated traffic or artificial engagement.

## Safety Notes

Do not post credentials, private URLs, real user data, or server logs containing
tokens. Report exploitable security issues privately through `SECURITY.md`.
