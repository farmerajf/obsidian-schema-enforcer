import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, type PluginSettings, type FolderSchema } from "./types";
import { SchemaEnforcerSettingTab } from "./settings";

export default class SchemaEnforcerPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private observer: MutationObserver | null = null;
	private pendingCheck = false;
	private isApplyingClasses = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new SchemaEnforcerSettingTab(this.app, this));
		this.updateCSSVariables();

		// Set up observer when switching files or layout changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.setupObserver();
				this.scheduleCheck();
				const file = this.app.workspace.getActiveFile();
				if (file) this.injectRequiredProperties(file);
			})
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.setupObserver();
			})
		);

		// Re-check when metadata changes for the active file
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && file.path === activeFile.path) {
					this.scheduleCheck();
				}
			})
		);

		// Auto-inject required properties on file creation
		this.registerEvent(
			this.app.vault.on("create", (abstractFile) => {
				if (abstractFile instanceof TFile && abstractFile.extension === "md") {
					this.injectRequiredProperties(abstractFile);
				}
			})
		);

		// Initial setup once layout is ready
		this.app.workspace.onLayoutReady(() => {
			this.setupObserver();
			this.scheduleCheck();
		});
	}

	onunload(): void {
		this.teardownObserver();
		this.clearAllViolationClasses();
		this.removeStyleEl();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.scheduleCheck();
	}

	updateCSSVariables(): void {
		this.removeStyleEl();
		const styleEl = document.createElement("style");
		styleEl.id = "schema-enforcer-styles";
		styleEl.textContent = `
			.metadata-property.schema-key-violation,
			.metadata-property.schema-key-violation .metadata-property-key,
			.metadata-property.schema-key-violation .metadata-property-key input,
			.metadata-property.schema-key-violation .metadata-property-value,
			.metadata-property.schema-key-violation .metadata-property-value input,
			.metadata-property.schema-key-violation .metadata-property-value select,
			.metadata-property.schema-key-violation .metadata-property-value .multi-select-pill {
				color: ${this.settings.keyViolationColor} !important;
				border-color: ${this.settings.keyViolationColor} !important;
			}
			.metadata-property.schema-key-violation {
				background-color: ${this.settings.keyViolationColor}15 !important;
			}
			.metadata-property.schema-value-violation,
			.metadata-property.schema-value-violation .metadata-property-value,
			.metadata-property.schema-value-violation .metadata-property-value input,
			.metadata-property.schema-value-violation .metadata-property-value select,
			.metadata-property.schema-value-violation .metadata-property-value .multi-select-pill {
				color: ${this.settings.valueViolationColor} !important;
				border-color: ${this.settings.valueViolationColor} !important;
			}
			.metadata-property.schema-value-violation {
				background-color: ${this.settings.valueViolationColor}15 !important;
			}
			.schema-enforcer-folder-block {
				border: 1px solid var(--background-modifier-border);
				border-radius: 8px;
				padding: 12px;
				margin-bottom: 16px;
			}
			.schema-enforcer-props {
				padding-left: 12px;
			}
			.schema-enforcer-msg {
				font-size: var(--font-smallest);
				padding: 4px 12px 2px 31px;
				opacity: 0.85;
				width: 100%;
				display: block;
			}
			.metadata-property:has(.schema-enforcer-msg) {
				flex-wrap: wrap;
			}
			.schema-key-violation .schema-enforcer-msg {
				color: ${this.settings.keyViolationColor};
			}
			.schema-value-violation .schema-enforcer-msg {
				color: ${this.settings.valueViolationColor};
			}
			.schema-enforcer-props .setting-item .setting-item-info {
				display: none;
			}
			.schema-enforcer-props .setting-item .setting-item-control {
				width: 100%;
				display: flex;
				gap: 6px;
			}
			.schema-enforcer-props .setting-item-control input[placeholder*="Property"] {
				flex: 0 0 150px;
			}
			.schema-enforcer-props .setting-item-control input[placeholder*="allowed values"] {
				flex: 1;
			}
		`;
		document.head.appendChild(styleEl);
	}

	private removeStyleEl(): void {
		document.getElementById("schema-enforcer-styles")?.remove();
	}

	private setupObserver(): void {
		this.teardownObserver();

		// Find the metadata container in the active view
		const container = document.querySelector(".workspace-leaf.mod-active .metadata-container")
			?? document.querySelector(".metadata-container");

		if (!container) return;

		this.observer = new MutationObserver(() => {
			if (!this.isApplyingClasses) {
				this.scheduleCheck();
			}
		});

		this.observer.observe(container, {
			childList: true,
			subtree: true,
		});
	}

	private teardownObserver(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
	}

	private scheduleCheck(): void {
		if (this.pendingCheck) return;
		this.pendingCheck = true;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				this.pendingCheck = false;
				this.checkActiveFile();
			});
		});
	}

	private getSchemaForFile(file: TFile): FolderSchema | null {
		const rawPath = file.parent?.path ?? "";
		const fileFolderPath = rawPath === "/" ? "" : rawPath;
		for (const [folderPath, schema] of Object.entries(this.settings.schemas)) {
			if (fileFolderPath === folderPath) {
				return schema;
			}
		}
		return null;
	}

	private checkActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			this.applyClasses(() => this.clearAllViolationClasses());
			return;
		}

		const schema = this.getSchemaForFile(file);
		if (!schema || Object.keys(schema.allowed).length === 0) {
			this.applyClasses(() => this.clearAllViolationClasses());
			return;
		}

		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter ?? {};

		// Build a lowercase lookup map since Obsidian lowercases data-property-key in the DOM
		const allowedLower = new Map<string, string>();
		for (const key of Object.keys(schema.allowed)) {
			allowedLower.set(key.toLowerCase(), key);
		}

		this.applyClasses(() => {
			const propertyEls = document.querySelectorAll(
				".metadata-property[data-property-key]"
			);

			propertyEls.forEach((el) => {
				const key = el.getAttribute("data-property-key");
				if (!key) return;

				el.classList.remove("schema-key-violation", "schema-value-violation");
				el.querySelector(".schema-enforcer-msg")?.remove();

				const originalKey = allowedLower.get(key.toLowerCase());
				if (!originalKey) {
					el.classList.add("schema-key-violation");
					this.addViolationMsg(el, `"${key}" is not in the schema`);
				} else {
					const rule = schema.allowed[originalKey];
					const fmKey = Object.keys(frontmatter).find(
						(k) => k.toLowerCase() === key.toLowerCase()
					) ?? key;
					const value = frontmatter[fmKey];
					const isEmpty = value == null || value === "" || (Array.isArray(value) && value.length === 0);

					if (isEmpty && !rule?.allowEmpty) {
						el.classList.add("schema-value-violation");
						this.addViolationMsg(el, "Value cannot be empty");
					} else if (!isEmpty && rule?.allowedValues && rule.allowedValues.length > 0) {
						const invalid = this.getInvalidValues(value, rule.allowedValues);
						if (invalid !== null) {
							el.classList.add("schema-value-violation");
							this.addViolationMsg(el, `Invalid: ${invalid.join(", ")}. Expected: ${rule.allowedValues.join(", ")}`);
						}
					}
				}
			});
		});
	}

	private applyClasses(fn: () => void): void {
		this.isApplyingClasses = true;
		fn();
		this.isApplyingClasses = false;
	}

	// Returns null if valid, or an array of invalid values if not
	private getInvalidValues(value: unknown, allowedValues: string[]): string[] | null {
		if (Array.isArray(value)) {
			const bad = value
				.map((v) => String(v))
				.filter((v) => !allowedValues.includes(v));
			return bad.length > 0 ? bad : null;
		}
		const strValue = value != null ? String(value) : "";
		return allowedValues.includes(strValue) ? null : [strValue];
	}

	private addViolationMsg(el: Element, msg: string): void {
		const msgEl = document.createElement("div");
		msgEl.className = "schema-enforcer-msg";
		msgEl.textContent = msg;
		el.appendChild(msgEl);
	}

	private clearAllViolationClasses(): void {
		document
			.querySelectorAll(".schema-key-violation, .schema-value-violation")
			.forEach((el) => {
				el.classList.remove("schema-key-violation", "schema-value-violation");
				el.querySelector(".schema-enforcer-msg")?.remove();
			});
	}

	private async injectRequiredProperties(file: TFile): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 200));

		const schema = this.getSchemaForFile(file);
		if (!schema || Object.keys(schema.allowed).length === 0) return;

		const schemaKeys = Object.keys(schema.allowed);

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			// Build a lowercase map of existing keys
			const existingLower = new Map<string, string>();
			for (const k of Object.keys(frontmatter)) {
				existingLower.set(k.toLowerCase(), k);
			}

			// Add missing properties
			let changed = false;
			for (const key of schemaKeys) {
				if (!existingLower.has(key.toLowerCase())) {
					if (key.toLowerCase() === "created") {
						frontmatter[key] = new Date().toISOString().split("T")[0];
					} else {
						frontmatter[key] = null;
					}
					changed = true;
				}
			}

			// Reorder: schema keys first in schema order, then any extra keys
			const currentKeys = Object.keys(frontmatter);
			const ordered: string[] = [];

			// Add schema keys in order (using the actual frontmatter key casing)
			for (const schemaKey of schemaKeys) {
				const fmKey = currentKeys.find(
					(k) => k.toLowerCase() === schemaKey.toLowerCase()
				);
				if (fmKey) ordered.push(fmKey);
			}

			// Add any remaining keys not in schema
			for (const k of currentKeys) {
				if (!ordered.includes(k)) ordered.push(k);
			}

			// Check if order changed
			const needsReorder = currentKeys.some((k, i) => k !== ordered[i]);

			if (!changed && !needsReorder) return;

			// Rebuild in order
			const values = ordered.map((k) => [k, frontmatter[k]] as const);
			for (const k of currentKeys) {
				delete frontmatter[k];
			}
			for (const [k, v] of values) {
				frontmatter[k] = v;
			}
		});
	}
}
