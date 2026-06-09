# Security Policy

## Reporting

Do not open a public issue for a vulnerability that could put players or
systems at risk. Email `omobolaji.adeyan@gmail.com` with the affected version,
impact, and reproduction steps using synthetic data.

## Supported Version

The latest release and the current `main` branch receive security fixes.

## Design

- No default accounts, passwords, private datasets, or production secrets
- Random session tokens stored as hashes
- Strict CORS and WebSocket origin validation
- Security headers and restrictive Content Security Policy
- Global HTTP rate limiting before API and static-file handlers
- Additional session and gameplay action limits
- Request-body and WebSocket payload limits
- Parameterized SQLite queries
- Dependency auditing and CodeQL in CI
