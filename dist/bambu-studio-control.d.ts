export type OfficialStudioFan = "part" | "auxiliary" | "right_auxiliary" | "chamber";
export type OfficialStudioTemperatureComponent = "bed";
export declare function normalizeOfficialStudioFan(fan: string | number): OfficialStudioFan;
export declare function setFanSpeedViaOfficialBambuStudio(fan: string | number, speed: number): Promise<{
    status: string;
    route: string;
    fan: OfficialStudioFan;
    requested_speed: number;
    speed: number;
    message: string;
}>;
export declare function setTemperatureViaOfficialBambuStudio(component: string, temperature: number): Promise<{
    status: string;
    route: string;
    component: OfficialStudioTemperatureComponent;
    requested_temperature: number;
    temperature: number;
    message: string;
}>;
