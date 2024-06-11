import type { Signal } from "@/models/p2pIntefaces";

export class P2pSignalService extends BroadcastChannel {
    constructor(){
        super('p2p-message-channel')
    }

    send(messagePayload: Signal){
        const clonedPayload = JSON.parse(JSON.stringify(messagePayload));
        this.postMessage(clonedPayload);
    }

    onMessage(callback: (message: Signal) => void) {
        this.onmessage = async (event: MessageEvent) => {
            await callback(event.data as Signal);
        };
    }
}