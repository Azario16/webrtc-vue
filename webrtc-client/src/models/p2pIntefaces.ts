export interface Signal {
    payload: MessagePayload;
    type: MessageType;
    userId: number;
}

export interface MessagePayload {
    description?: RTCSessionDescription | null;
    candidate?: RTCIceCandidate | null;
}

export enum MessageType {
    offer = 'offer',
    answer = 'answer',
    candidate = 'candidate',
}
