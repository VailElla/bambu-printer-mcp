import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export function normalizeOfficialStudioFan(fan) {
    const value = String(fan).trim().toLowerCase();
    if (value === "1" || value === "part" || value === "part_cooling")
        return "part";
    if (value === "2" || value === "aux" || value === "auxiliary" || value === "left_auxiliary")
        return "auxiliary";
    if (value === "10" || value === "right_aux" || value === "right_auxiliary")
        return "right_auxiliary";
    if (value === "3" || value === "chamber" || value === "exhaust")
        return "chamber";
    throw new Error("Unsupported X2D fan. Use part, auxiliary, right_auxiliary, chamber, 1, 2, 3, or 10.");
}
export async function setFanSpeedViaOfficialBambuStudio(fan, speed) {
    if (process.platform !== "darwin") {
        throw new Error("The official Bambu Studio control bridge is available only on macOS.");
    }
    const normalizedFan = normalizeOfficialStudioFan(fan);
    const roundedSpeed = Math.round(speed / 10) * 10;
    if (!Number.isFinite(speed) || speed < 0 || speed > 100) {
        throw new Error("Fan speed must be between 0 and 100 percent.");
    }
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const scriptPath = process.env.BAMBU_OFFICIAL_STUDIO_CONTROL_SCRIPT ||
        path.resolve(moduleDir, "..", "scripts", "bambu-studio-fan-control.applescript");
    const { stdout } = await execFileAsync("/usr/bin/osascript", [scriptPath, normalizedFan, String(roundedSpeed)], { timeout: 30000, maxBuffer: 64 * 1024 });
    return {
        status: "success",
        route: "official_bambu_studio",
        fan: normalizedFan,
        requested_speed: speed,
        speed: roundedSpeed,
        message: stdout.trim() || `Official Bambu Studio set ${normalizedFan} fan to ${roundedSpeed}%.`,
    };
}
export async function setTemperatureViaOfficialBambuStudio(component, temperature) {
    if (process.platform !== "darwin") {
        throw new Error("The official Bambu Studio control bridge is available only on macOS.");
    }
    const normalizedComponent = component.trim().toLowerCase();
    if (normalizedComponent !== "bed") {
        throw new Error("The official X2D bridge currently supports only the bed component.");
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 120) {
        throw new Error("Bed temperature must be between 0 and 120°C.");
    }
    const roundedTemperature = Math.round(temperature);
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const scriptPath = process.env.BAMBU_OFFICIAL_STUDIO_TEMPERATURE_SCRIPT ||
        path.resolve(moduleDir, "..", "scripts", "bambu-studio-temperature-control.applescript");
    const { stdout } = await execFileAsync("/usr/bin/osascript", [scriptPath, normalizedComponent, String(roundedTemperature)], { timeout: 30000, maxBuffer: 64 * 1024 });
    return {
        status: "success",
        route: "official_bambu_studio",
        component: normalizedComponent,
        requested_temperature: temperature,
        temperature: roundedTemperature,
        message: stdout.trim() || `Official Bambu Studio set bed target to ${roundedTemperature}°C.`,
    };
}
