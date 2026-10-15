# Isolated STAGING read-only image. DO NOT deploy without explicit approval.
# Base-image OCI index digest independently checked via docker buildx imagetools.
# Re-pin to a freshly reviewed/security-scanned image on each maintenance update.
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

ENV NODE_ENV=production \
    LSZH_STAGING_READ_PROBE_ENABLED=no \
    LSZH_FIRESTORE_STAGING_WRITE_ENABLED=false
WORKDIR /app

# Isolated runtime manifest + integrity-checked transitive dependency lock.
# The root website's package.json is deliberately not used for this image.
COPY services/offer-acceptance-staging/package.json services/offer-acceptance-staging/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force \
 && node -e "require('@google-cloud/firestore').Firestore"

COPY --chown=node:node stagingOfferSchema.js stagingFirestoreConnection.js ./
COPY --chown=node:node services/offer-acceptance-staging/app.js services/offer-acceptance-staging/index.js services/offer-acceptance-staging/offerLinks.js services/offer-acceptance-staging/stagingReadProbe.js ./services/offer-acceptance-staging/
COPY --chown=node:node offerte-annehmen/index.html ./offerte-annehmen/index.html
USER node
EXPOSE 8080
CMD ["node","services/offer-acceptance-staging/index.js"]
