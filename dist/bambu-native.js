import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function firstExistingExecutable(candidates) {
    return candidates.find((candidate) => {
        try {
            return fs.statSync(candidate).isFile() && (fs.statSync(candidate).mode & 0o111) !== 0;
        }
        catch {
            return false;
        }
    });
}
function resolveNativeHelper() {
    const configured = process.env.BAMBU_NATIVE_HELPER?.trim();
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const candidates = [
        configured,
        path.resolve(process.cwd(), "native/bambu-native-print"),
        path.resolve(process.cwd(), "../native/bambu-native-print"),
        path.resolve(packageRoot, "native/bambu-native-print"),
    ].filter((value) => Boolean(value));
    const helper = firstExistingExecutable(candidates);
    if (!helper) {
        throw new Error("Bambu native helper is not installed. Build native/bambu-native-print with clang++ or set BAMBU_NATIVE_HELPER.");
    }
    return helper;
}
function boolEnv(value, fallback) {
    return String(value === undefined ? fallback : value);
}
function tail(value, maxLength = 4000) {
    return value.length > maxLength ? value.slice(-maxLength) : value;
}
function runNativeHelper(mode, env, timeoutMs, onUpdate) {
    const helper = resolveNativeHelper();
    return new Promise((resolve, reject) => {
        const child = spawn(helper, [mode], {
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const updates = [];
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill("SIGTERM");
            reject(new Error(`Bambu native helper timed out after ${timeoutMs} ms.`));
        }, timeoutMs);
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
            const lines = stdout.split(/\r?\n/);
            stdout = lines.pop() || "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    updates.push(trimmed);
                    onUpdate?.(trimmed);
                }
            }
        });
        child.stderr.on("data", (chunk) => {
            stderr = tail(stderr + chunk.toString("utf8"));
        });
        child.on("error", (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code, signal) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            const trailing = stdout.trim();
            if (trailing) {
                updates.push(trailing);
                onUpdate?.(trailing);
            }
            resolve({ resultCode: code ?? (signal ? 1 : 0), updates, stderr });
        });
    });
}
const X2D_NATIVE_PRINT_COMMANDS = new Set([
    "pause",
    "resume",
    "stop",
    "ams_change_filament",
    "ams_user_setting",
    "ams_filament_setting",
    "ams_get_rfid",
    "ams_control",
    "ams_reset",
    "ams_filament_drying",
    "auto_stop_ams_dry",
]);
export function validateBambuNativeControlMessage(messageJson) {
    let parsed;
    try {
        parsed = JSON.parse(messageJson);
    }
    catch {
        throw new Error("X2D native control message_json must be valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("X2D native control message_json must be a JSON object.");
    }
    const envelope = parsed;
    if (Object.keys(envelope).length !== 1 || !envelope.print || typeof envelope.print !== "object" || Array.isArray(envelope.print)) {
        throw new Error("X2D native control accepts exactly one print command envelope.");
    }
    const print = envelope.print;
    const command = typeof print.command === "string" ? print.command : "";
    if (X2D_NATIVE_PRINT_COMMANDS.has(command)) {
        return { messageJson: JSON.stringify(parsed), command };
    }
    if (command === "print_option") {
        if (!("auto_switch_filament" in print) && !("air_print_detect" in print)) {
            throw new Error("X2D native print_option is limited to AMS options.");
        }
        return { messageJson: JSON.stringify(parsed), command };
    }
    if (command === "gcode_line") {
        const param = typeof print.param === "string" ? print.param.trim() : "";
        if (!/^M620\s+[CRP]\d+\s*$/i.test(param)) {
            throw new Error("X2D native gcode_line is limited to AMS M620 C/R/P commands.");
        }
        return { messageJson: JSON.stringify(parsed), command };
    }
    throw new Error(`X2D native control command is not allowed: ${command || "<missing>"}.`);
}
export async function sendCommandWithBambuNative(options) {
    const validated = validateBambuNativeControlMessage(options.messageJson);
    const qos = options.qos === undefined ? 0 : Math.trunc(options.qos);
    const flag = options.flag === undefined ? 0 : Math.trunc(options.flag);
    if (!Number.isFinite(qos) || !Number.isFinite(flag) || qos < 0 || qos > 1 || flag < 0 || flag > 1) {
        throw new Error("X2D native control qos and flag must be 0 or 1.");
    }
    const result = await runNativeHelper("--command", {
        ...process.env,
        BAMBU_NATIVE_COMMAND_CONFIRM: "1",
        BAMBU_NATIVE_HOST: options.host,
        BAMBU_NATIVE_SERIAL: options.serial,
        BAMBU_NATIVE_ACCESS_CODE: options.token,
        BAMBU_NATIVE_COMMAND_JSON: validated.messageJson,
        BAMBU_NATIVE_COMMAND_QOS: String(qos),
        BAMBU_NATIVE_COMMAND_FLAG: String(flag),
    }, 30000);
    if (result.resultCode !== 0) {
        const detail = [
            ...result.updates,
            ...(result.stderr ? [result.stderr.trim()] : []),
        ]
            .filter((line) => line.startsWith("native_error=") || line.startsWith("native_command result=") || line.startsWith("local MQTT connection"))
            .join("; ");
        throw new Error(`Bambu native X2D control failed (${result.resultCode})${detail ? `: ${detail}` : "."}`);
    }
    return {
        status: "success",
        route: "bambu:///local",
        command: validated.command,
        updates: result.updates,
    };
}
export async function probeBambuNative(host, token) {
    const result = await runNativeHelper("--probe", {
        ...process.env,
        BAMBU_NATIVE_HOST: host,
        BAMBU_NATIVE_ACCESS_CODE: token,
    }, 20000);
    if (result.resultCode !== 0) {
        throw new Error(`Bambu native local tunnel probe failed (${result.resultCode}).`);
    }
    return { status: "ok", route: "bambu:///local", updates: result.updates };
}
export async function printWithBambuNative(options, onUpdate) {
    const result = await runNativeHelper("--print", {
        ...process.env,
        BAMBU_NATIVE_CONFIRM: "1",
        BAMBU_NATIVE_HOST: options.host,
        BAMBU_NATIVE_SERIAL: options.serial,
        BAMBU_NATIVE_ACCESS_CODE: options.token,
        BAMBU_NATIVE_FILE: options.filePath,
        BAMBU_NATIVE_PROJECT_NAME: options.projectName,
        BAMBU_NATIVE_PRESET_NAME: options.presetName,
        BAMBU_NATIVE_PLATE_INDEX: String(options.plateIndex + 1),
        BAMBU_NATIVE_BED_TYPE: options.bedType,
        BAMBU_NATIVE_USE_AMS: String(options.useAMS),
        BAMBU_NATIVE_AMS_MAPPING: options.amsMapping || "",
        BAMBU_NATIVE_AMS_MAPPING2: options.amsMapping2 || "",
        BAMBU_NATIVE_AMS_MAPPING_INFO: options.amsMappingInfo || "",
        BAMBU_NATIVE_NOZZLE_MAPPING: options.nozzleMapping || "",
        BAMBU_NATIVE_NOZZLES_INFO: options.nozzlesInfo || "",
        BAMBU_NATIVE_BED_LEVELING: boolEnv(options.bedLeveling, true),
        BAMBU_NATIVE_FLOW_CALIBRATION: boolEnv(options.flowCalibration, true),
        BAMBU_NATIVE_VIBRATION_CALIBRATION: boolEnv(options.vibrationCalibration, true),
        BAMBU_NATIVE_LAYER_INSPECT: boolEnv(options.layerInspect, false),
        BAMBU_NATIVE_TIMELAPSE: boolEnv(options.timelapse, false),
    }, 300000, onUpdate);
    if (result.resultCode !== 0) {
        const detail = [
            ...result.updates,
            ...(result.stderr ? [result.stderr.trim()] : []),
        ]
            .filter((line) => line.startsWith("native_error=") || line.startsWith("native_print result=") || line.startsWith("local MQTT connection"))
            .join("; ");
        throw new Error(`Bambu native local print failed (${result.resultCode})${detail ? `: ${detail}` : "."}`);
    }
    return {
        status: "success",
        route: "bambu:///local",
        updates: result.updates,
    };
}
export async function uploadWithBambuNative(options, onUpdate) {
    const result = await runNativeHelper("--upload", {
        ...process.env,
        BAMBU_NATIVE_UPLOAD_CONFIRM: "1",
        BAMBU_NATIVE_HOST: options.host,
        BAMBU_NATIVE_SERIAL: options.serial,
        BAMBU_NATIVE_ACCESS_CODE: options.token,
        BAMBU_NATIVE_FILE: options.filePath,
        BAMBU_NATIVE_PROJECT_NAME: options.projectName,
        BAMBU_NATIVE_PRESET_NAME: options.presetName,
        BAMBU_NATIVE_PLATE_INDEX: String(options.plateIndex + 1),
        BAMBU_NATIVE_BED_TYPE: options.bedType,
        BAMBU_NATIVE_USE_AMS: String(options.useAMS),
        BAMBU_NATIVE_AMS_MAPPING: options.amsMapping || "",
        BAMBU_NATIVE_AMS_MAPPING2: options.amsMapping2 || "",
        BAMBU_NATIVE_AMS_MAPPING_INFO: options.amsMappingInfo || "",
        BAMBU_NATIVE_NOZZLE_MAPPING: options.nozzleMapping || "",
        BAMBU_NATIVE_NOZZLES_INFO: options.nozzlesInfo || "",
        BAMBU_NATIVE_BED_LEVELING: boolEnv(options.bedLeveling, true),
        BAMBU_NATIVE_FLOW_CALIBRATION: boolEnv(options.flowCalibration, true),
        BAMBU_NATIVE_VIBRATION_CALIBRATION: boolEnv(options.vibrationCalibration, true),
        BAMBU_NATIVE_LAYER_INSPECT: boolEnv(options.layerInspect, false),
        BAMBU_NATIVE_TIMELAPSE: boolEnv(options.timelapse, false),
    }, 300000, onUpdate);
    if (result.resultCode !== 0) {
        const detail = [
            ...result.updates,
            ...(result.stderr ? [result.stderr.trim()] : []),
        ]
            .filter((line) => line.startsWith("native_error=") || line.startsWith("native_upload result=") || line.startsWith("local MQTT connection"))
            .join("; ");
        throw new Error(`Bambu native local upload failed (${result.resultCode})${detail ? `: ${detail}` : "."}`);
    }
    return {
        status: "success",
        route: "bambu:///local",
        updates: result.updates,
    };
}
