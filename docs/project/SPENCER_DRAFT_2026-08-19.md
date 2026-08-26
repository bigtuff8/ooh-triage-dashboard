# Draft to Spencer — 2026-08-20 (review before sending; only needed if James can't patch the secret himself)

**Subject:** OOH dashboard — one k8s secret fix to finish go-live

Hi Spencer,

Thanks for sorting the claim — the OOH dashboard now signs me in correctly as an OOH Handler, so authorisation is fully working.

One small thing left, and it's a secret update I don't have rights for (the `deployer-ooh` service account can deploy but can't read/write secrets):

**The `ZENDESK_API_TOKEN` currently in the k8s secret `ooh-dashboard-secrets` (ns `iot-services`) is being rejected by Zendesk (401 on every call).** The app auth is fine now — it uses the standard `email/token:apiToken` scheme like the rest of our estate — but the loaded token value is stale/invalid. Could you replace the Zendesk creds in that secret with the known-good ones we use for the other integrations (`theairedalegroup` / `jonathan.wilkinson@airedale-group.co.uk` + the working API token), i.e. set `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, then `kubectl -n iot-services rollout restart deployment/ooh-dashboard`?

Once that's in, I can run the final write-path check and merge to main. Everything else — deploy, SSO, token validation, Cosmos connectivity — is verified live.

(Separately and non-blocking: ThingsBoard read auth is down — `/healthz` shows TB `read:false` while the bridge is healthy — so device-inventory/site search is degraded. Worth a look when you get a chance, but it doesn't block go-live.)

Thanks,
James
