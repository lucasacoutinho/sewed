import * as Worker from "sewed/worker";
import { handlers, jsonProtocol } from "./protocol.mjs";

export default Worker.define(jsonProtocol, handlers);
