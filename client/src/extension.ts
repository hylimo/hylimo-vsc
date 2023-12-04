import * as path from "path";
import { workspace, ExtensionContext, window, WebviewPanel, Uri, Range, TextEditorRevealType } from "vscode";

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    NotificationType
} from "vscode-languageclient/node";
import { Messenger } from "vscode-messenger";
import { LspWebviewEndpoint, LspWebviewPanelManager, LspWebviewPanelManagerOptions } from "sprotty-vscode/lib/lsp";
import {
    SprottyDiagramIdentifier,
    createFileUri,
    createWebviewPanel,
    registerDefaultCommands,
    registerTextEditorSync
} from "sprotty-vscode";
import { ActionMessage } from "sprotty-protocol";
import {
    DiagramActionNotification,
    PublishDocumentRevealNotification,
    PublishDocumentRevealParams
} from "@hylimo/diagram-protocol";

let client: LanguageClient;

class WebviewEndpoint extends LspWebviewEndpoint {
    async receiveAction(message: ActionMessage): Promise<void> {
        await super.receiveAction(message);
        await this.languageClient.sendNotification(DiagramActionNotification.type.method, message);
    }
}

class WebviewPanelManager extends LspWebviewPanelManager {
    constructor(options: LspWebviewPanelManagerOptions) {
        super(options);
        options.languageClient.onNotification(DiagramActionNotification.type.method, (message) => {
            this.acceptFromLanguageServer(message as any);
        });
    }

    protected override createWebview(identifier: SprottyDiagramIdentifier): WebviewPanel {
        const extensionPath = this.options.extensionUri.fsPath;
        return createWebviewPanel(identifier, {
            localResourceRoots: [createFileUri(extensionPath)],
            scriptUri: createFileUri(extensionPath, "webview", "out", "webview.js")
        });
    }

    protected async createDiagramIdentifier(uri: Uri, diagramType?: string): Promise<SprottyDiagramIdentifier> {
        const res = await super.createDiagramIdentifier(uri, diagramType);
        return {
            ...res,
            uri: uri.toString()
        };
    }

    override createEndpoint(identifier: SprottyDiagramIdentifier): LspWebviewEndpoint {
        const webviewContainer = this.createWebview(identifier);
        const participant = this.messenger.registerWebviewPanel(webviewContainer);
        return new WebviewEndpoint({
            languageClient: this.languageClient,
            webviewContainer,
            messenger: this.messenger,
            messageParticipant: participant,
            identifier
        });
    }
}

export function activate(context: ExtensionContext) {
    const languageClient = createLanguageClient(context);

    const webviewViewProvider = new WebviewPanelManager({
        extensionUri: context.extensionUri,
        languageClient: languageClient,
        supportedFileExtensions: [".hyl", ".hylimo"],
        messenger: new Messenger({ ignoreHiddenViews: false })
    });
    registerDefaultCommands(webviewViewProvider, context, { extensionPrefix: "hylimo" });
    registerTextEditorSync(webviewViewProvider, context);
}

function createLanguageClient(context: ExtensionContext): LanguageClient {
    const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: "hylimo" }]
    };

    client = new LanguageClient("hylimo", "HyLiMo Language Server", serverOptions, clientOptions);

    client.onNotification(PublishDocumentRevealNotification.type.method, (params: PublishDocumentRevealParams) => {
        console.log(params);
        const textEditor = window.visibleTextEditors.find((editor) => editor.document.uri.toString() == params.uri);
        if (textEditor != undefined) {
            const range = params.range;
            textEditor.revealRange(
                new Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1),
                TextEditorRevealType.InCenterIfOutsideViewport
            );
        }
    });

    client.start();
    return client;
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
