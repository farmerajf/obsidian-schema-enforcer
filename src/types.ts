export interface PropertyRule {
	allowedValues?: string[];
	allowEmpty?: boolean;
}

export interface FolderSchema {
	allowed: Record<string, PropertyRule>;
}

export interface SchemaConfig {
	[folderPath: string]: FolderSchema;
}

export interface PluginSettings {
	schemas: SchemaConfig;
	keyViolationColor: string;
	valueViolationColor: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	schemas: {},
	keyViolationColor: "#e53e3e",
	valueViolationColor: "#dd6b20",
};
