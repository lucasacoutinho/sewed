import { Effect, Layer } from "effect";
import * as Capability from "../Capability.ts";
import * as Cookie from "../Cookie.ts";
import type { MainContext } from "../RuntimeContext.ts";
import type { SewedError } from "../SewedError.ts";
import * as CookiePolicy from "./CookiePolicy.ts";
import * as Cookies from "./Cookies.ts";
import type { Handle } from "./Session.ts";
import { resolved } from "./SessionSettings.ts";

export {
  Cause,
  Change,
  Cookie,
  Details,
  Filter,
  Policy,
  SameSite,
  capability,
  protocol,
} from "../Cookie.ts";

/**
 * The cookie capability for main. Unlike the ambient surfaces, this one is scoped to a session, so
 * the Layer threads an acquired handle rather than a plain options bag: it resolves the handle in
 * main, then compiles the policy once over that session's store. The policy lives in this Layer,
 * not in a separate host, so `Capability.serve(Cookie.capability)` gives a document exactly the
 * rules a main-side call obeys.
 */
export const native = (
  session: Handle,
  policy: Cookie.Policy,
): Layer.Layer<typeof Cookie.capability, SewedError, MainContext> =>
  Capability.fromHandlers(Cookie.capability, (implement) =>
    implement(
      Effect.map(
        Effect.flatMap(resolved(session), (store) =>
          CookiePolicy.operations(policy, Cookies.make(store)),
        ),
        (operations) => ({
          get: ({ filter }) => operations.get(filter),
          set: ({ details }) => operations.set(details),
          remove: ({ url, name }) => operations.remove(url, name),
          flush: () => operations.flush,
          changes: () => operations.changes,
        }),
      ),
    ),
  );
