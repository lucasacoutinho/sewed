import { Binding, NativeTheme, WindowControls } from "sewed";
import { ClockProtocol } from "./contracts.js";

export const Clock = Binding.slot("clock", ClockProtocol);
export const Controls = Binding.slot("window", WindowControls.protocol);
export const Theme = Binding.slot("theme", NativeTheme.protocol);

export const bindings = [Clock, Controls, Theme];
