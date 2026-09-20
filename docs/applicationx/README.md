# ApplicationX planning package

Status: v0.4, 2026-09-20. Documentation and implementation plans.

ApplicationX is a separate companion application to Calricula for employer and
career collaboration. Staff use its workspace inside Calricula's interface;
employers and (later) students retain a separate entry point. The documents
specify proposed behavior; they do not establish deployed integrations,
provider access, institutional adoption, or production readiness.

## Read in this order

1. [Product requirements](PRD.md): users, workflows, scope, phases, and acceptance criteria.
2. [Technical specification](TECHNICAL-SPEC.md): stack, data contracts, graph,
   permissions, agents, and integration design.
3. [Sources and integration coverage](SOURCE-INVENTORY.md): every data family
   with its evidence level, phase and coverage obligation.
4. [Embedded staff interface](EMBEDDED-INTERFACE.md): the binding design for
   navigation, shared UI components, sign-in, context and host acceptance tests.
5. [Research report](research/2026-09-20-applicationx-deep-research.md) and its
   [proposal deck](research/deck/index.html): owner vision vs. build, data-source
   feasibility, competitive landscape, compliance fit, recommendations.
6. Implementation plans in [plans/](plans/): the [P2–P4 roadmap](plans/2026-09-17-p1b-p4-roadmap.md)
   and the [workspace package publishing plan](plans/2026-09-19-workspace-ui-github-packages-and-task8.md).
7. [ADR-0001 auth stack](ADR-0001-auth-stack-logto.md): Logto (OIDC) for both
   applications, with the [ApplicationX swap plan](plans/2026-09-18-auth-oidc-logto-applicationx.md)
   and the [Calricula migration plan](plans/2026-09-18-auth-logto-calricula-migration.md).

## Status (2026-09-20)

The sibling repository `applicationx` (private, github.com/johnnyrobot/applicationx)
implements P1: identity (Logto OIDC, dev tokens), organizations, workspaces and
program mappings, the host-context handshake, row-level security, the connector
contract with the Calricula labor-market connector, the `@johnnyrobot/workspace-ui`
package and the standalone app. Calricula hosts the staff route behind
`APPLICATIONX_EMBED_ENABLED` (broker, routes, navigation, host states) — see the
tracked deployer doc `docs/APPLICATIONX-EMBED.md`. P2 (employer collaboration)
is the next phase.

## Decisions

- ApplicationX owns employer collaboration, evidence, and agent tasks.
- Staff open those features inside Calricula's layout through shared React
  components. Employers and students use standalone ApplicationX.
- Calricula owns curriculum records and approvals. Calipar owns program reviews,
  planning, and resource-request workflows.
- Reuse the Next.js / FastAPI / PostgreSQL stack with Logto (OIDC) for identity
  (ADR-0001), with dedicated ApplicationX data and authorization.
- Build a versioned evidence graph in PostgreSQL first. Add a separate Neo4j
  projection only if measured relationship queries justify it.
- Sources are in-process HTTP connectors with typed contracts; no licensed
  employer or posting feed is assumed until contracted.
- There is no public question-answering surface; assistants act only inside an
  authorized workspace.
