# Separate STAGING worker; use the repository root as Docker build context.
# Deliberately COPY only public source files needed at runtime, never secrets or .env.
FROM node:22.16.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node onboarding/confirmation.js onboarding/confirmation.js
COPY --chown=node:node workers/onboarding-notifications/outbox.js workers/onboarding-notifications/outbox.js
COPY --chown=node:node workers/onboarding-notifications/airtable-candidates.js workers/onboarding-notifications/airtable-candidates.js
COPY --chown=node:node workers/onboarding-notifications/paced-fetch.js workers/onboarding-notifications/paced-fetch.js
COPY --chown=node:node workers/onboarding-notifications/firestore-store.js workers/onboarding-notifications/firestore-store.js
COPY --chown=node:node workers/onboarding-notifications/server.js workers/onboarding-notifications/server.js
USER node
EXPOSE 8080
CMD ["node", "workers/onboarding-notifications/server.js"]
