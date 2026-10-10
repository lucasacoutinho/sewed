import * as Worker from "sewed/worker";
import { binaryProtocol, handlers } from "./protocol.mjs";

export default Worker.define(binaryProtocol, handlers);
