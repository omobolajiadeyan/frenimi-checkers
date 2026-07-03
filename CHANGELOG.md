# Changelog

## [Unreleased]

### Security

- Added configurable global HTTP rate limiting before API and static-file
  handlers, while retaining stricter session and gameplay action limits.
- Added server-side online session revocation, matchmaking cleanup, and
  realtime disconnect behavior.
- Removed bearer tokens from exported/imported player data.
