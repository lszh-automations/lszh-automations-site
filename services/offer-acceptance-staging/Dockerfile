# Strictly isolated STAGING diagnostic. NEVER deploy without separate approval.
# Both OCI index digests independently checked by GitHub Actions on 2026-10-15.
# Reassess/update digests and CVE scan before every actual deploy.
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS deps
WORKDIR /app
COPY services/offer-acceptance-staging/package.json services/offer-acceptance-staging/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && node -e "require('@google-cloud/firestore').Firestore"

# Runtime excludes npm CLI, shell, apt, build tools and their vulnerable packages.
# Distroless Node entrypoint already invokes node, so CMD is just the JS file.
FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:ec2313763dd43931543bd03830466e0c409ce73a487e8d46f10db72d3b816c1c
ENV NODE_ENV=production \
    LSZH_STAGING_READ_PROBE_ENABLED=no \
    LSZH_FIRESTORE_STAGING_WRITE_ENABLED=false
WORKDIR /app
COPY --from=deps --chown=65532:65532 /app/node_modules ./node_modules
COPY --chown=65532:65532 stagingOfferSchema.js stagingFirestoreConnection.js ./
COPY --chown=65532:65532 services/offer-acceptance-staging/app.js services/offer-acceptance-staging/index.js services/offer-acceptance-staging/offerLinks.js services/offer-acceptance-staging/stagingReadProbe.js services/offer-acceptance-staging/startupReadProof.js ./services/offer-acceptance-staging/
COPY --chown=65532:65532 offerte-annehmen/index.html ./offerte-annehmen/index.html
USER 65532:65532
EXPOSE 8080
CMD ["services/offer-acceptance-staging/index.js"]
