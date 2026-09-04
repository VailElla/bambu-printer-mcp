# Local X2D adapter

This checkout is a local, pinned adapter for the X2D printer in the sibling
`bambu-monitor/` project. It is not the upstream npm package.

## What is adapted

- Adds the Bambu Studio `x2d` machine preset and the `N6 -> X2D` model mapping.
- Routes X2D pre-sliced projects through the dual-nozzle `project_file` path with
  project-level `ams_mapping` and the parallel `ams_mapping2` array.
- Includes X2D in AMS profile resolution and the RTSP camera family.
- Uses the pinned BBL Device CA from `bambu-monitor/certs/` for MQTT and FTPS;
  certificate verification is required.
- Reads the LAN access code just-in-time from macOS Keychain through
  `launch-bambu-mcp.zsh`; the code is never stored in this checkout.
- X2D LAN sending uses the installed Bambu Studio networking plug-in's
  `bambu:///local` tunnel and internal `emmc` route. Both `print_3mf` (start a
  print) and `upload_file` with `connection_mode=bambu_native` (upload only)
  use the plug-in ABI, so the latter does not accidentally start a print. The
  legacy direct FTPS upload is retained for older machines but is not used for
  X2D because the firmware authenticates FTP while rejecting `STOR` with `553`.
- X2D pause, resume, stop, and AMS controls use the same local plug-in session
  through `x2d_native_control`. The tool accepts only the task commands and
  AMS operations used by Bambu Studio; unrelated device JSON and arbitrary
  G-code are rejected before the native helper starts.
- The public `reread_ams_rfid` and `set_ams_drying` MCP tools also use the
  native route on X2D. They accept AMS ids 0–3 and the X2D AMS-HT id 128.

## Codex registration

The global Codex MCP entry is named `bambu-x2d` and launches:

```text
/Users/ella/Documents/ChatGPT/3D/bambu-mcp/launch-bambu-mcp.zsh
```

After changing the MCP configuration, start a new Codex local session before
expecting the tools to appear in the tool inventory.

## Safety boundary

Read-only status, AMS inventory, file listing, slicing, and the native generic
message path have been smoke tested against the local printer. No print-start,
pause, cancel, temperature, or AMS movement command was sent during control
bridge verification. Actual printing remains an explicit user-confirmed action.

The MCP is configured for stdio only; its HTTP transport is not enabled.

For X2D native sending, `native/bambu-native-print` is the runtime adapter
behind the `bambu_native` `print_3mf` connection mode and the
`connection_mode=bambu_native` `upload_file` route. It refuses to replace an
already-running print on the print-start route and requires the installed
Bambu Studio networking plug-in.
