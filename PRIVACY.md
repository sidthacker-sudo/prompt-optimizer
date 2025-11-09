# Privacy Policy for Prompt Optimizer

**Last Updated**: January 2025

## Overview

Prompt Optimizer is a Chrome extension that helps users improve their prompts for AI chat applications. We take your privacy seriously and are committed to protecting your data.

## Data Collection

### What We Collect
- **Prompt Text**: Only the prompts you explicitly choose to optimize or save
- **Prompt Library**: Templates and conversation chains you save locally
- **Settings**: Your Anthropic API key (stored locally, encrypted by Chrome)

### What We DON'T Collect
- We do NOT collect any personal information
- We do NOT track your browsing history
- We do NOT collect data from chat conversations unless you explicitly click "Optimize"
- We do NOT store your data on our servers
- We do NOT sell or share any data with third parties

## Data Storage

### Local Storage
- All data is stored locally on your device using Chrome's secure storage API
- Your prompt library, favorites, and settings are stored in Chrome's local storage
- Your Anthropic API key is stored using Chrome's encrypted storage

### Cloud Processing
- When you click "Optimize", your prompt is sent to our API server
- The server forwards it to Anthropic's Claude AI for processing
- NO data is stored on our servers
- The server processes requests in real-time and does not log prompts

## Third-Party Services

### Anthropic Claude AI
- We use Anthropic's Claude AI API to improve prompts
- Your prompts are sent to Anthropic for processing
- Anthropic's privacy policy: https://www.anthropic.com/legal/privacy
- You provide your own API key - we never have access to it on our servers

### Railway (Hosting)
- Our API server is hosted on Railway.app
- Railway only sees encrypted HTTPS traffic
- No user data is stored on Railway servers
- Railway's privacy policy: https://railway.app/legal/privacy

## Data Security

- All communications use HTTPS encryption
- CORS restrictions prevent unauthorized access
- Rate limiting prevents abuse
- Your API key is never transmitted to or stored on our servers

## Your Rights

You have the right to:
- **Access**: View all data stored locally in Chrome DevTools
- **Delete**: Clear all stored data by removing the extension
- **Export**: Use the export feature to download your prompt library
- **Control**: Choose what prompts to optimize and save

## Data Retention

- Data is retained locally until you:
  - Clear your browser data
  - Uninstall the extension
  - Use the delete features in the extension
- No server-side data retention

## Children's Privacy

This extension is not directed at children under 13. We do not knowingly collect information from children.

## Changes to Privacy Policy

We may update this policy. Check the "Last Updated" date above. Continued use after changes constitutes acceptance.

## Contact

For privacy concerns or questions:
- GitHub Issues: https://github.com/sidthacker-sudo/prompt-optimizer/issues
- Email: [Your contact email]

## Permissions Explained

### Required Permissions:
- **storage**: To save your prompt library and settings locally
- **host_permissions** (chatgpt.com, claude.ai): To inject the optimization button on AI chat pages
- **host_permissions** (Railway API): To send prompts for optimization

## Compliance

- GDPR compliant (no personal data collection)
- CCPA compliant (no data selling)
- Chrome Web Store policies compliant

---

**Summary**: We collect nothing. Your data stays on your device. We only process what you explicitly send us, and we don't store it.
