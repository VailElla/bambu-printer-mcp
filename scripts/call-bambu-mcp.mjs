#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const launcher = process.env.BAMBU_MCP_LAUNCHER || path.join(root, "..", "launch-bambu-mcp.zsh");
const [toolName, ...rawArgs] = process.argv.slice(2);

if (!toolName) {
  console.error("usage: call-bambu-mcp.mjs <tool> [key=value ...]");
  process.exit(64);
}

const args = {};
const booleanArguments = new Set([
  "use_ams",
  "auto_match_ams",
  "bed_leveling",
  "flow_calibration",
  "vibration_calibration",
  "layer_inspect",
  "timelapse",
  "confirm",
  "confirm_during_print",
]);
const numericArguments = new Set(["speed", "temperature", "plate_index", "qos", "flag"]);
const jsonArguments = new Set(["ams_mapping", "ams_slots"]);
for (const item of rawArgs) {
  const separator = item.indexOf("=");
  if (separator <= 0) {
    console.error(`invalid argument: ${item}`);
    process.exit(64);
  }
  const key = item.slice(0, separator);
  const value = item.slice(separator + 1);
  if (booleanArguments.has(key)) {
    if (value !== "true" && value !== "false") {
      console.error(`invalid boolean argument: ${key}=${value}`);
      process.exit(64);
    }
    args[key] = value === "true";
  } else if (numericArguments.has(key)) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      console.error(`invalid numeric argument: ${key}=${value}`);
      process.exit(64);
    }
    args[key] = number;
  } else if (jsonArguments.has(key)) {
    try {
      args[key] = JSON.parse(value);
    } catch {
      console.error(`invalid JSON argument: ${key}`);
      process.exit(64);
    }
  } else {
    args[key] = value;
  }
}

const transport = new StdioClientTransport({
  command: launcher,
  args: [],
  stderr: "pipe",
});
const client = new Client({ name: "qingxiao-bambu-bridge", version: "1.0.0" });

try {
  await client.connect(transport);
  const streamsNativeProgress = toolName === "print_3mf" || toolName === "upload_file";
  const requestOptions = streamsNativeProgress
    ? {
        timeout: 330_000,
        resetTimeoutOnProgress: true,
        onprogress: ({ message }) => {
          const match = /^native_update status=(-?\d+) code=(-?\d+) msg=(.*)$/.exec(message || "");
          if (!match) return;
          const safeMessage = match[3].replace(/[\t\r\n]+/g, " ");
          process.stdout.write(`QINGXIAO_MCP_PROGRESS\t${match[1]}\t${match[2]}\t${safeMessage}\n`);
        },
      }
    : undefined;
  const result = await client.callTool(
    { name: toolName, arguments: args },
    undefined,
    requestOptions
  );
  const output = result.content?.find((entry) => entry.type === "text")?.text || "";
  if (result.isError) {
    console.error(output || `MCP tool ${toolName} failed`);
    process.exitCode = 1;
  } else if (output) {
    // Keep the helper useful for diagnostics without exposing credentials.
    console.log(output);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
