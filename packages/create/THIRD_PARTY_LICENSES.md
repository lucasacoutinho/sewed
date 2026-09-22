# Third-Party Licenses

Sewed is licensed under the Apache License 2.0. The portions listed below are
derived from other projects and remain subject to their license notices.

## Alchemy

The callable Context-service construction, Effect requirement propagation,
instance identity, and scoped runtime assembly in `packages/sewed/src/Binding.ts`,
`RuntimeContext.ts`, `Runtime.ts`, `InstanceId.ts`, and `Util/effect.ts` are
adapted from Alchemy, cloned at commit
[`2fa500db9e0c6fce5bc4acd819a40458195b26c8`](https://github.com/alchemy-run/alchemy/tree/2fa500db9e0c6fce5bc4acd819a40458195b26c8)
(Alchemy 2.0.0-beta.77).

Copyright 2026 Functionless Corp.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
these files except in compliance with the License. You may obtain a copy of the
License at <http://www.apache.org/licenses/LICENSE-2.0>. Unless required by
applicable law or agreed to in writing, software distributed under the License
is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.

Alchemy's own third-party attributions covered code in its cloud providers,
frontend framework adapters, and emulators. None of that code is present in
Sewed, so those attributions are not reproduced here.
