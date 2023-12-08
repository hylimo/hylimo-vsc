import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind } from "vscode-languageserver/node";
import { LanguageServer } from "@hylimo/language-server";
import { classDiagramModule } from "@hylimo/diagram";

const connection = createConnection(ProposedFeatures.all);

const languageServer = new LanguageServer({
    defaultConfig: {
        diagramConfig: {
            theme: "dark"
        },
        settings: {}
    },
    connection,
    additionalInterpreterModules: [classDiagramModule],
    maxExecutionSteps: 1000000
});
languageServer.listen();
