import "reflect-metadata";
import "sprotty-vscode-webview/css/sprotty-vscode.css";

import { SprottyDiagramIdentifier } from "sprotty-vscode-webview";
import { SprottyStarter } from "sprotty-vscode-webview";
import { LspNotification } from "sprotty-vscode-protocol/lib/lsp";
import { createContainer } from "@hylimo/diagram-ui";
import { Container } from "inversify";
import { HOST_EXTENSION } from "vscode-messenger-common";

export class HylimoSprottyStarter extends SprottyStarter {
    protected override createContainer(diagramIdentifier: SprottyDiagramIdentifier) {
        return createContainer(diagramIdentifier.clientId);
    }

    protected addVscodeBindings(container: Container, diagramIdentifier: SprottyDiagramIdentifier): void {
        super.addVscodeBindings(container, diagramIdentifier);
        console.log("send shit");
        this.messenger.sendNotification(LspNotification, HOST_EXTENSION, {
            jsonrpc: "2.0",
            method: "diagram/open",
            params: {
                clientId: diagramIdentifier.clientId,
                diagramUri: diagramIdentifier.uri
            }
        });
    }
}

new HylimoSprottyStarter().start();
