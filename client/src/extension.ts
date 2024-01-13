import * as path from "path";
import { workspace, ExtensionContext, window, WebviewPanel, Uri, Range, TextEditorRevealType, commands } from "vscode";

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";
import { Messenger } from "vscode-messenger";
import { LspWebviewEndpoint, LspWebviewPanelManager, LspWebviewPanelManagerOptions } from "sprotty-vscode/lib/lsp";
import {
    SprottyDiagramIdentifier,
    createFileUri,
    createWebviewPanel,
    registerDefaultCommands,
} from "sprotty-vscode";
import { ActionMessage } from "sprotty-protocol";
import {
    DiagramActionNotification,
    DiagramRequest,
    DiagramResponseMessage,
    PublishDocumentRevealNotification,
    PublishDocumentRevealParams,
    RemoteNotification,
    RemoteRequest,
    SetLanguageServerIdNotification
} from "@hylimo/diagram-protocol";
import { PDFRenderer } from "@hylimo/diagram-render-pdf";
import { SVGRenderer } from "@hylimo/diagram-render-svg";

let clients: LanguageClient[] = [];
const pdfRenderer = new PDFRenderer();
const svgRenderer = new SVGRenderer();

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

    protected async createDiagramIdentifier(uri: Uri, diagramType?: string): Promise<SprottyDiagramIdentifier | undefined> {
        const res = await super.createDiagramIdentifier(uri, diagramType);
        if (res == undefined) {
            return undefined;
        }
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
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: "hylimo" }]
    };
    const languageClient = createLanguageClient(context, "hylimo", clientOptions);
    languageClient.onNotification(
        PublishDocumentRevealNotification.type.method,
        (params: PublishDocumentRevealParams) => {
            const textEditor = window.visibleTextEditors.find((editor) => editor.document.uri.toString() == params.uri);
            if (textEditor != undefined) {
                const range = params.range;
                textEditor.revealRange(
                    new Range(
                        range.start.line + 1,
                        range.start.character + 1,
                        range.end.line + 1,
                        range.end.character + 1
                    ),
                    TextEditorRevealType.InCenterIfOutsideViewport
                );
            }
        }
    );

    const languageClient2 = createLanguageClient(context, "hylimo", {
        documentSelector: [
            {
                language: "hylimo",
                pattern: "_invalid_"
            }
        ]
    });
    setupSecondaryLanguageServer(languageClient, languageClient2);

    const webviewViewProvider = new WebviewPanelManager({
        extensionUri: context.extensionUri,
        languageClient: languageClient,
        supportedFileExtensions: [".hyl", ".hylimo"],
        messenger: new Messenger({ ignoreHiddenViews: false })
    });
    registerDefaultCommands(webviewViewProvider, context, { extensionPrefix: "hylimo" });
    registerRenderCommands(context);
}

function registerRenderCommands(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand("hylimo.export.svg", async args => {
        const filePath = args.path;
        const uri = Uri.parse(filePath).toString();
        const diagramRes = (await clients[0].sendRequest(DiagramRequest.type.method, { diagramUri: uri})) as DiagramResponseMessage;
        if (diagramRes.diagram != undefined) {
            const renderedDiagram = svgRenderer.render(diagramRes.diagram.rootElement);
            const svgFilePath = filePath.replace(/\.hyl(imo)?$/, ".svg");
            await workspace.fs.writeFile(Uri.parse(svgFilePath), Buffer.from(renderedDiagram));
        }
    }))

    context.subscriptions.push(commands.registerCommand("hylimo.export.pdf", async args => {
        const filePath = args.path;
        const uri = Uri.parse(filePath).toString();
        const diagramRes = (await clients[0].sendRequest(DiagramRequest.type.method, { diagramUri: uri})) as DiagramResponseMessage;
        if (diagramRes.diagram != undefined) {
            const renderedDiagram = await pdfRenderer.render(diagramRes.diagram.rootElement, "#000000");
            const pdfFilePath = filePath.replace(/\.hyl(imo)?$/, ".pdf");
            const renderedDiagramConcatenated = Buffer.concat(renderedDiagram);
            await workspace.fs.writeFile(Uri.parse(pdfFilePath), renderedDiagramConcatenated);
        }
    }))
}

function createLanguageClient(
    context: ExtensionContext,
    id: string,
    clientOptions: LanguageClientOptions
): LanguageClient {
    const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc
        }
    };

    const client = new LanguageClient(id, "HyLiMo Language Server - " + id, serverOptions, clientOptions);
    clients.push(client);
    client.start();
    return client;
}

function setupSecondaryLanguageServer(primary: LanguageClient, secondary: LanguageClient) {
    primary.onNotification(RemoteNotification.type.method, (message) => {
        secondary.sendNotification(RemoteNotification.type.method, message);
    });
    secondary.onNotification(RemoteNotification.type.method, (message) => {
        primary.sendNotification(RemoteNotification.type.method, message);
    });
    primary.onRequest(RemoteRequest.type.method, async (request) => {
        return secondary.sendRequest(RemoteRequest.type.method, request);
    });
    secondary.onRequest(RemoteRequest.type.method, (request) => {
        return primary.sendRequest(RemoteRequest.type.method, request);
    });
    secondary.sendNotification(SetLanguageServerIdNotification.type.method, 1);
}

export function deactivate(): Promise<any> {
    return Promise.all(clients.map((client) => client.stop()));
}
