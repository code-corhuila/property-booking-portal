# property-booking-portal

> booking bounded context: web UI (remote)

Part of the **Property** distributed system — Grupo 2 · Angular 21 (zoneless) · Native Federation 21 · Node 22 or 24.
Documentation: [`property-docs`](https://github.com/code-corhuila/property-docs), `12-ux-ui/navigation-map.md` and `design-system.md`.

## How the container mounts it

| Federation name | Local address | Exposed module | Exports |
|---|---|---|---|
| `booking` | `http://localhost:4202` | `./routes` → `src/app/booking/booking.routes.ts` | `BOOKING_FORM_ROUTES` (`/propiedades/:propiedadId/reservar`), `BOOKINGS_ROUTES` (`/reservas`) |

**This portal never calls `provideHttpClient()`.** Mounted in `property-front`, it runs inside the container's
injector and receives its client with the interceptor (gateway URL, token, `X-Correlation-Id`, time limit,
one error shape: `src/app/shell-contract.ts`). A client of its own would send requests without the interceptor.

`package.json` and `package-lock.json` hold the same versions as `property-front`: the
shared libraries are strict singletons, so a different Angular does not load.

## Install, build, test and run

```bash
npm ci          # installs exactly what package-lock.json records
npm run build   # dist/booking; also rewrites tsconfig.federation.json
npm test        # unit tests, one run (Vitest)
npm start       # http://localhost:4202/remoteEntry.json
```

Inside the container: run `npm start` here and in `property-front`, sign in at `http://localhost:4200` and open
`/reservas`. `deploy/` builds the image (`npm ci`, then nginx) as the service `booking-portal` on `platform`.

## Run with Docker

Build the image on its own, from the root of this repository:

```bash
docker build -f deploy/Dockerfile -t property-booking-portal:dev .
```

`.dockerignore` keeps `node_modules`, `dist`, `.angular` and `.git` out of the image: it
installs its own dependencies with `npm ci`. `deploy/compose.yml` publishes no port and
expects the external `platform` network, so to see this portal inside the container
use [`property-infra`](https://github.com/code-corhuila/property-infra).

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `property-docs`.
