import "reflect-metadata";
import "sprotty-vscode-webview/css/sprotty-vscode.css";

import { SprottyDiagramIdentifier, VscodeDiagramServer } from "sprotty-vscode-webview";
import { SprottyStarter } from "sprotty-vscode-webview";
import { LspNotification } from "sprotty-vscode-protocol/lib/lsp";
import { createContainer } from "@hylimo/diagram-ui";
import { Container } from "inversify";
import { HOST_EXTENSION } from "vscode-messenger-common";
import {
    AxisAlignedSegmentEditAction,
    LineMoveAction,
    NavigateToSourceAction,
    ResizeAction,
    RotationAction,
    TranslationMoveAction
} from "@hylimo/diagram-protocol";
import { injectable } from "inversify";
import { ActionHandlerRegistry, TYPES, DiagramServerProxy } from "sprotty";

import "../css/diagram.css";

@injectable()
export class HyLiMoDiagramServerProxy extends VscodeDiagramServer {
    override initialize(registry: ActionHandlerRegistry): void {
        super.initialize(registry);

        registry.register(TranslationMoveAction.KIND, this);
        registry.register(LineMoveAction.KIND, this);
        registry.register(RotationAction.KIND, this);
        registry.register(ResizeAction.KIND, this);
        registry.register(AxisAlignedSegmentEditAction.KIND, this);
        registry.register(NavigateToSourceAction.KIND, this);
    }
}

export class HylimoSprottyStarter extends SprottyStarter {
    protected override createContainer(diagramIdentifier: SprottyDiagramIdentifier) {
        const container = createContainer(diagramIdentifier.clientId);
        return container;
    }

    protected addVscodeBindings(container: Container, diagramIdentifier: SprottyDiagramIdentifier): void {
        super.addVscodeBindings(container, diagramIdentifier);
        container.rebind(VscodeDiagramServer).to(HyLiMoDiagramServerProxy).inSingletonScope();
        container.rebind(TYPES.ModelSource).toService(VscodeDiagramServer);
        container.rebind(DiagramServerProxy).toService(VscodeDiagramServer);
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
