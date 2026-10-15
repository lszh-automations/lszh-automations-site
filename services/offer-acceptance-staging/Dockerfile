# STAGING draft only: do NOT deploy without separate IAM, ingress and image review.
# Build from repo root: docker build -f services/offer-acceptance-staging/Dockerfile .
# Before deployment pin the base image and firestore library to reviewed exact digests/versions.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
# Firestore SDK uses metadata-based Cloud Run service identity, no JSON private key.
# Version range intentionally requires pinning and review before any deployment.
RUN npm install --no-save --no-package-lock --omit=dev --ignore-scripts @google-cloud/firestore@7
COPY --chown=node:node stagingOfferSchema.js stagingFirestoreConnection.js /app/
COPY --chown=node:node services/offer-acceptance-staging/app.js services/offer-acceptance-staging/index.js services/offer-acceptance-staging/offerLinks.js services/offer-acceptance-staging/stagingReadProbe.js /app/services/offer-acceptance-staging/
COPY --chown=node:node offerte-annehmen/index.html /app/offerte-annehmen/index.html
USER node
EXPOSE 8080
CMD ["node","services/offer-acceptance-staging/index.js"]
