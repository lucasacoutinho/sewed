import { Binding, NativeTheme, WindowControls } from "sewed";
import { ClockProtocol } from "./contracts.js";

export const Clock = Binding.slot("clock", ClockProtocol);
export const Controls = WindowControls.capability.slot;
export const Theme = NativeTheme.capability.slot;

export const bindings = [Clock, Controls, Theme];
