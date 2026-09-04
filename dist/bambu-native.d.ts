export type BambuNativePrintOptions = {
    host: string;
    serial: string;
    token: string;
    filePath: string;
    projectName: string;
    presetName: string;
    plateIndex: number;
    bedType: string;
    useAMS: boolean;
    amsMapping?: string;
    amsMapping2?: string;
    amsMappingInfo?: string;
    nozzleMapping?: string;
    nozzlesInfo?: string;
    bedLeveling?: boolean;
    flowCalibration?: boolean;
    vibrationCalibration?: boolean;
    layerInspect?: boolean;
    timelapse?: boolean;
};
export type BambuNativeControlOptions = {
    host: string;
    serial: string;
    token: string;
    messageJson: string;
    qos?: number;
    flag?: number;
};
export declare function validateBambuNativeControlMessage(messageJson: string): {
    messageJson: string;
    command: string;
};
export declare function sendCommandWithBambuNative(options: BambuNativeControlOptions): Promise<Record<string, unknown>>;
export declare function probeBambuNative(host: string, token: string): Promise<Record<string, unknown>>;
export declare function printWithBambuNative(options: BambuNativePrintOptions): Promise<Record<string, unknown>>;
export declare function uploadWithBambuNative(options: BambuNativePrintOptions): Promise<Record<string, unknown>>;
