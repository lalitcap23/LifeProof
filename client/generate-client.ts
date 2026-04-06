// @ts-nocheck
import { mkdir } from "node:fs/promises";
import { AnchorIdl, rootNodeFromAnchorWithoutDefaultVisitor } from "@codama/nodes-from-anchor";
import { renderJavaScriptUmiVisitor, renderJavaScriptVisitor, renderRustVisitor } from "@codama/renderers";
import { visit } from "@codama/visitors-core";
import anchorIdl from "../target/idl/proof_pol.json";

async function generateClients() {
    const node = rootNodeFromAnchorWithoutDefaultVisitor(anchorIdl as AnchorIdl);

    const clients = [
        { type: "JS", dir: "client/generated/js/src", renderVisitor: renderJavaScriptVisitor },
        // { type: "Umi", dir: "client/generated/umi/src", renderVisitor: renderJavaScriptUmiVisitor },
        // { type: "Rust", dir: "client/generated/rust/src", renderVisitor: renderRustVisitor },
    ];

    for (const client of clients) {
        try {
            await mkdir(client.dir, { recursive: true });
            await visit(node, await client.renderVisitor(client.dir));
            console.log(`Generated ${client.type} client in ${client.dir}`);
        } catch (error) {
            console.error(`Failed to generate ${client.type} client`, error);
            throw error;
        }
    }
}

generateClients().catch((error) => {
    console.error("Client generation failed", error);
    process.exit(1);
});
