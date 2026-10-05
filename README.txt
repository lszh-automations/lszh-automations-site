LSZH Automations – Render Deployment

Produktionsstruktur:
/                  Website
/onboarding/       Kunden-Onboarding
/api/lead          Server-seitiger Proxy zum Make Lead-Webhook
/api/onboarding    Server-seitiger Proxy zum Make Onboarding-Webhook

Render Web Service:
Runtime: Node
Build command: echo no-build
Start command: node server.js
Region: Frankfurt

Erforderliche geheime Environment Variables auf Render:
MAKE_LEAD_WEBHOOK
MAKE_ONBOARDING_WEBHOOK

Die Make-Webhook-Adressen gehören NICHT ins Repository oder ins Browser-HTML.
