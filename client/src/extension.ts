import * as path from "path";
import { workspace, ExtensionContext, window, WebviewPanel, Uri } from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
	NotificationType
} from "vscode-languageclient/node";
import { Messenger } from "vscode-messenger";
import { LspWebviewPanelManager, LspWebviewPanelManagerOptions } from "sprotty-vscode/lib/lsp";
import { SprottyDiagramIdentifier, createFileUri, createWebviewPanel, registerDefaultCommands, registerTextEditorSync } from "sprotty-vscode";

let client: LanguageClient;

class WebviewPanelManager extends LspWebviewPanelManager {

	constructor(options: LspWebviewPanelManagerOptions) {
		super(options)
		options.languageClient.onNotification(new NotificationType("diagram/action"), message => {
			console.log("wtf");
			this.acceptFromLanguageServer(message as any)
		});
	}

	protected override createWebview(identifier: SprottyDiagramIdentifier): WebviewPanel {
		const extensionPath = this.options.extensionUri.fsPath;
        return createWebviewPanel(identifier, {
            localResourceRoots: [ createFileUri(extensionPath) ],
            scriptUri: createFileUri(extensionPath, 'webview', "out", 'webview.js')
        });
	}

	protected async createDiagramIdentifier(uri: Uri, diagramType?: string): Promise<SprottyDiagramIdentifier> {
		const res = await super.createDiagramIdentifier(uri, diagramType);
		return {
			...res,
			uri: uri.toString()
		}
	}
}

export function activate(context: ExtensionContext) {
	const languageClient = createLanguageClient(context)

	const webviewViewProvider = new WebviewPanelManager({
		extensionUri: context.extensionUri,
		languageClient: languageClient,
		supportedFileExtensions: [".hyl", ".hylimo"],
		messenger: new Messenger({ignoreHiddenViews: false})
	});
	registerDefaultCommands(webviewViewProvider, context, { extensionPrefix: "hylimo" });
	registerTextEditorSync(webviewViewProvider, context);
}

function createLanguageClient(context: ExtensionContext): LanguageClient {
		// The server is implemented in node
		const serverModule = context.asAbsolutePath(
			path.join("server", "out", "server.js")
		);
	
		// If the extension is launched in debug mode then the debug server options are used
		// Otherwise the run options are used
		const serverOptions: ServerOptions = {
			run: { module: serverModule, transport: TransportKind.ipc },
			debug: {
				module: serverModule,
				transport: TransportKind.ipc,
			}
		};
	
		// Options to control the language client
		const clientOptions: LanguageClientOptions = {
			// Register the server for plain text documents
			documentSelector: [{ language: "hylimo" }],
		};
	
		// Create the language client and start the client.
		client = new LanguageClient(
			"hylimo",
			"HyLiMo Language Server",
			serverOptions,
			clientOptions
		);
	
		// Start the client. This will also launch the server
		client.start();
		return client
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}