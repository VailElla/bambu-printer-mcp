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
function runNativeHelper(mode, env, timeoutMs) {
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
                if (trimmed)
                    updates.push(trimmed);
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
            if (trailing)
                updates.push(trailing);
            resolve({ resultCode: code ?? (signal ? 1 : 0), updates, stderr });
        });
    });
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
export async function printWithBambuNative(options) {
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
    }, 300000);
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
