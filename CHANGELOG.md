# Changelog

## [Unreleased]

### Security

- Added configurable global HTTP rate limiting before API and static-file
  handlers, while retaining stricter session and gameplay action limits.
- Added server-side online session revocation, matchmaking cleanup, and
  realtime disconnect behavior.
- Removed bearer tokens from exported/imported player data.

### Testing

- Added WebSocket abuse-case coverage (#10): malformed JSON payloads are
  rejected with a predictable error while the connection stays usable, and
  oversized frames are closed at the protocol level (`maxPayload`) before
  reaching application logic.
