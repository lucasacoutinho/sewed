# Origin

Sewed started as a clone of https://github.com/alchemy-run/alchemy at
`2fa500db9e0c6fce5bc4acd819a40458195b26c8` (Alchemy 2.0.0-beta.77), an
infrastructure library built on Effect. The Git history retains that commit, and
the Apache-2.0 license and attribution notices are kept; see [NOTICE](../NOTICE)
and [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).

`packages/alchemy` became `packages/sewed`. The retained source files were
`Binding.ts`, `RuntimeContext.ts`, `Runtime.ts`, `InstanceId.ts`, and
`Util/effect.ts`: the callable Context-service construction, Effect requirement
propagation, instance identity, and scoped runtime assembly became the basis for
the Electron host. Everything else in this repository was written for Electron.

Cloud providers, deployment reconciliation, persistent stack state, the cloud
CLI, emulators and SDK submodules, release and deployment workflows, the website,
and the examples were removed. Desktop resources use Effect scopes instead of
cloud reconciliation, and no cloud operation exists in this repository. The
Electron consumer is the separate sibling project `../sewed-playground`.

The clone started on Effect `4.0.0-rc.112`; the pin now follows the current release candidate, `4.0.0-rc.115`.
