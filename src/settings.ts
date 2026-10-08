import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFolder } from "obsidian";
import type SchemaEnforcerPlugin from "./main";
import type { FolderSchema, PropertyRule } from "./types";

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private selectCallback: (folder: TFolder) => void;
	private textInputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement, selectCallback: (folder: TFolder) => void) {
		super(app, inputEl);
		this.textInputEl = inputEl;
		this.selectCallback = selectCallback;
	}

	getSuggestions(query: string): TFolder[] {
		const folders: TFolder[] = [];
		const lowerQuery = query.toLowerCase();
		this.app.vault.getAllFolders().forEach((folder) => {
			if (folder.path.toLowerCase().includes(lowerQuery)) {
				folders.push(folder);
			}
		});
		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.textInputEl.value = folder.path;
		this.textInputEl.trigger("input");
		this.selectCallback(folder);
		this.close();
	}
}

export class SchemaEnforcerSettingTab extends PluginSettingTab {
	plugin: SchemaEnforcerPlugin;

	constructor(app: App, plugin: SchemaEnforcerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Violation colors
		new Setting(containerEl)
			.setName("Key violation color")
			.setDesc("Color for properties not in the schema")
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.keyViolationColor)
					.onChange(async (value) => {
						this.plugin.settings.keyViolationColor = value;
						await this.plugin.saveSettings();
						this.plugin.updateCSSVariables();
					})
			);

		new Setting(containerEl)
			.setName("Value violation color")
			.setDesc("Color for properties with values not in the allowed list")
			.addColorPicker((color) =>
				color
					.setValue(this.plugin.settings.valueViolationColor)
					.onChange(async (value) => {
						this.plugin.settings.valueViolationColor = value;
						await this.plugin.saveSettings();
						this.plugin.updateCSSVariables();
					})
			);

		// Schema mappings
		containerEl.createEl("h3", { text: "Folder schemas" });

		const schemas = this.plugin.settings.schemas;

		for (const folderPath of Object.keys(schemas)) {
			this.renderFolderSchema(containerEl, folderPath, schemas[folderPath]!);
		}

		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText("Add folder schema").onClick(async () => {
				this.plugin.settings.schemas[""] = {
					allowed: {},
				};
				await this.plugin.saveSettings();
				this.display();
			})
		);
	}

	private renderFolderSchema(
		containerEl: HTMLElement,
		folderPath: string,
		schema: FolderSchema
	): void {
		const schemaContainer = containerEl.createDiv({
			cls: "schema-enforcer-folder-block",
		});

		// Folder path + delete button
		new Setting(schemaContainer)
			.setName("Folder path")
			.setDesc("Vault-relative path (e.g. Bases/Tasks)")
			.addText((text) => {
				text.setValue(folderPath);
				const renameFolderKey = async (newPath: string) => {
					if (newPath === folderPath) return;
					const schemas = this.plugin.settings.schemas;
					const existing = schemas[folderPath];
					if (!existing) return; // already renamed by another handler
					delete schemas[folderPath];
					schemas[newPath] = existing;
					await this.plugin.saveSettings();
					this.display();
				};
				new FolderSuggest(this.app, text.inputEl, (folder) => {
					renameFolderKey(folder.path);
				});
				text.inputEl.addEventListener("blur", () => {
					renameFolderKey(text.getValue());
				});
			})
			.addButton((btn) =>
				btn
					.setButtonText("Remove folder")
					.setWarning()
					.onClick(async () => {
						delete this.plugin.settings.schemas[folderPath];
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// Properties list
		const propsContainer = schemaContainer.createDiv({
			cls: "schema-enforcer-props",
		});
		propsContainer.createEl("h4", { text: "Properties" });

		const propNames = Object.keys(schema.allowed);
		propNames.forEach((propName, index) => {
			this.renderProperty(
				propsContainer,
				folderPath,
				propName,
				schema.allowed[propName]!,
				index,
				propNames.length
			);
		});

		new Setting(propsContainer).addButton((btn) =>
			btn.setButtonText("Add property").onClick(async () => {
				schema.allowed[""] = {};
				await this.plugin.saveSettings();
				this.display();
			})
		);
	}

	private renderProperty(
		containerEl: HTMLElement,
		folderPath: string,
		propName: string,
		rule: PropertyRule,
		index: number,
		total: number
	): void {
		const schema = this.plugin.settings.schemas[folderPath]!;

		const setting = new Setting(containerEl)
			.addExtraButton((btn) =>
				btn
					.setIcon("arrow-up")
					.setTooltip("Move up")
					.setDisabled(index === 0)
					.onClick(async () => {
						this.moveProperty(schema, propName, -1);
						await this.plugin.saveSettings();
						this.display();
					})
			)
			.addExtraButton((btn) =>
				btn
					.setIcon("arrow-down")
					.setTooltip("Move down")
					.setDisabled(index === total - 1)
					.onClick(async () => {
						this.moveProperty(schema, propName, 1);
						await this.plugin.saveSettings();
						this.display();
					})
			)
			.addText((text) => {
				text.setPlaceholder("Property name").setValue(propName);
				text.inputEl.addEventListener("blur", async () => {
					const value = text.getValue();
					if (value === propName) return;
					const oldRule = schema.allowed[propName]!;
					delete schema.allowed[propName];
					schema.allowed[value] = oldRule;
					await this.plugin.saveSettings();
					this.display();
				});
			})
			.addText((text) => {
				text.setPlaceholder("Comma-separated allowed values")
					.setValue(rule.allowedValues?.join(", ") ?? "");
				text.inputEl.addEventListener("blur", async () => {
					const value = text.getValue();
					if (value.trim() === "") {
						delete rule.allowedValues;
					} else {
						rule.allowedValues = value
							.split(",")
							.map((v) => v.trim())
							.filter((v) => v.length > 0);
					}
					await this.plugin.saveSettings();
				});
			})
			.addToggle((toggle) => {
				toggle
					.setValue(rule.allowEmpty ?? false)
					.onChange(async (value) => {
						rule.allowEmpty = value;
						await this.plugin.saveSettings();
					});
				toggle.toggleEl.insertAdjacentText("beforebegin", "Allow empty");
			})
			.addButton((btn) =>
				btn
					.setIcon("trash")
					.setTooltip("Remove property")
					.onClick(async () => {
						delete schema.allowed[propName];
						await this.plugin.saveSettings();
						this.display();
					})
			);

		setting.nameEl.remove();
	}

	private moveProperty(schema: FolderSchema, propName: string, direction: number): void {
		const keys = Object.keys(schema.allowed);
		const idx = keys.indexOf(propName);
		const newIdx = idx + direction;
		if (newIdx < 0 || newIdx >= keys.length) return;

		// Swap
		const temp = keys[idx]!;
		keys[idx] = keys[newIdx]!;
		keys[newIdx] = temp;

		// Rebuild allowed in new order
		const newAllowed: Record<string, PropertyRule> = {};
		for (const key of keys) {
			newAllowed[key] = schema.allowed[key]!;
		}
		schema.allowed = newAllowed;
	}
}
