# Security Policy

## Supported versions

Job Search Terminal is currently in early public development. Security fixes will target the current `main` branch unless release branches are added later.

## Reporting a vulnerability

If you discover a security issue, please do not open a public issue containing sensitive details.

Report privately by contacting the maintainers through the repository owner's preferred contact channel.

Include:

- Description of the issue
- Steps to reproduce
- Potential impact
- Affected files or workflows
- Suggested fix, if known

## Sensitive data

Job Search Terminal may store sensitive personal information locally, including resumes, job applications, generated documents, career history, and API keys.

Do not commit or share:

- API keys
- Local database files
- Resume PDFs
- Generated resumes
- Application exports
- Personal contact details
- Screenshots exposing private information

## AI provider keys

If an API key is exposed:

1. Revoke or rotate it immediately with the provider.
2. Remove it from any public files or screenshots.
3. Check provider usage logs for unexpected activity.

## Security-sensitive contribution areas

Extra review is required for changes involving:

- AI provider settings
- API key storage
- File uploads
- PDF generation
- Job scanning
- External URLs
- Database backups and exports
- Data deletion and reset behavior
