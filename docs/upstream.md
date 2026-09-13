# Alchemy basis

Sewed was cloned from https://github.com/alchemy-run/alchemy at
`2fa500db9e0c6fce5bc4acd819a40458195b26c8` (Alchemy 2.0.0-beta.77).
The shallow clone retains the upstream commit and Git metadata, Apache-2.0 license and attribution notices.

`packages/alchemy` becomes `packages/sewed`. The starting source files retained
for adaptation are `Binding.ts`, `RuntimeContext.ts`, `Runtime.ts`,
`InstanceId.ts`, and `Util/effect.ts`. The callable Context-service construction,
Effect requirement propagation, instance identity, and scoped runtime assembly
are the basis for the Electron host.

Cloud providers, deployment reconciliation, persistent stack state, the cloud CLI,
cloud emulators/SDK submodules, release/deployment workflows, website and examples
are removed. Desktop resources use Effect scopes instead of cloud reconciliation.
The Electron trial is a separate sibling consumer in `../sewed-playground`.

Effect remains pinned to the upstream version, `4.0.0-rc.112`.
