<template>
    <video ref="localVideo" autoplay playsinline muted></video>
    <video ref="remoteVideo" autoplay playsinline></video>
</template>

<script lang="ts">
interface Data {
    localStream: MediaStream | null;
    userId: number;
    makingOffer: boolean;
    ignoreOffer: boolean;
    polite: boolean;
    localVideo?: HTMLVideoElement;
    remoteVideo?: HTMLVideoElement;
}

import { type Signal, type MessagePayload, MessageType } from "../models/p2pIntefaces.js";
import { P2pSignalService } from '../service/p2p-signal.service'
import { onUnmounted, ref } from 'vue'


export default {
    
    setup() {
        const pc = ref<RTCPeerConnection>()
        const p2pSignalService = ref(new P2pSignalService())

        const localVideo = ref<HTMLVideoElement>()
        const remoteVideo = ref<HTMLVideoElement>()

        onUnmounted(() => {
            if (pc.value) {
                pc.value.close();
                pc.value = undefined;
            }
            
            p2pSignalService.value.close();
        });

        return {
            p2pSignalService,
            pc,
            localVideo,
            remoteVideo
        }
    },
    data(): Data {
        return {
            localStream: null,
            userId: this.generateId(),
            makingOffer: false,
            ignoreOffer: false,
            polite: Boolean(window.localStorage.getItem('polite'))
        };
    },
    mounted() {
        this.init();
    },
    methods: {
        async init() {
            this.onSignal();

            await this.createLocalMediaStream()

            this.createPeerConnection();
        },
        generateId() {
            return Math.random().toString(36).substring(2, 15);
        },
        async createLocalMediaStream() {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
            }
        },
        onSignal() {
            this.p2pSignalService.onMessage(async (signal) => {
                try {
                    if (this.userId === signal.userId) {
                        return;
                    }
                    switch (signal.type) {
                        case MessageType.offer:
                            await this.createAndSendAnswer(signal.payload.description);
                            break;
                        case MessageType.answer:
                            this.setRemoteDescription(signal.payload.description);
                            break;
                        case MessageType.candidate:
                            this.addIceCandidate(signal.payload.candidate);
                            break;
                    }
                } catch (error) {
                    console.error('Error during processing signal', error);
                }
            });
        },
        async createAndSendAnswer(description?: RTCSessionDescription | null): Promise<void> {
            if (!this.pc) {
                return;
            }
            const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
            this.ignoreOffer = !this.polite && offerCollision;

            if (this.ignoreOffer) {

                this.p2pSignalService.send({
                    type: MessageType.offer,
                    payload: {
                        description: this.pc?.localDescription
                    },
                    userId: this.userId
                });

                return;
            }

            await this.setRemoteDescription(description);
            await this.setLocalDescription();

            this.p2pSignalService.send({
                type: MessageType.answer,
                payload: {
                    description: this.pc.localDescription,
                },
                userId: this.userId
            });
        },
        async setRemoteDescription(description?: RTCSessionDescription | null): Promise<void> {
            if (description?.type === 'answer') {
                this.ignoreOffer = false;
            }
            if (!description || !this.pc) {
                return;
            }

            await this.pc.setRemoteDescription(description);
        },
        async setLocalDescription(): Promise<void> {
            if (this.pc) {
                await this.pc.setLocalDescription();
            }
        },
        addIceCandidate(candidate?: RTCIceCandidate | null): void {
            try {
                if (!candidate || !this.pc || !this.pc.remoteDescription) {
                    return;
                }

                this.pc.addIceCandidate(candidate);
            } catch (error) {
                if (!this.ignoreOffer) {
                    console.error('Error add ice candidate', error);
                }
            }
        },
        createPeerConnection(): void {
            this.pc = new RTCPeerConnection({
                iceServers: [
                    {
                        "urls": "stun:stun.l.google.com:19302"
                    }
                ],
            });

            this.pc.onnegotiationneeded = async () => {
                try {
                    this.makingOffer = true;
                    await this.setLocalDescription();

                    this.p2pSignalService.send({
                        type: MessageType.offer,
                        payload: {
                            description: this.pc?.localDescription,
                        },
                        userId: this.userId
                    });
                } catch (error) {
                    console.error('Error during setting local description', error);
                } finally {
                    this.makingOffer = false;
                }
            };

            this.pc.onicecandidate = event => {
                if (event.candidate) {
                    this.p2pSignalService.send({
                        type: MessageType.candidate,
                        payload: {
                            candidate: event.candidate
                        },
                        userId: this.userId
                    });
                } else {
                    this.p2pSignalService.send({
                        type: MessageType.candidate,
                        payload: {
                            candidate: null
                        },
                        userId: this.userId
                    });
                }
            };

            this.pc.onconnectionstatechange = () => {
                if (!this.pc) {
                    return;
                }
                console.log({
                    type: 'connectionState',
                    state: this.pc.connectionState,
                })
            };

            this.pc.ontrack = event => {
                if (this.remoteVideo) {
                    this.remoteVideo.srcObject = event.streams[0];
                }
            };

            this.pc.onicecandidateerror = event => {
                const iceEvent = event as RTCPeerConnectionIceErrorEvent;
                console.error({
                    type: 'iceCandidateError',
                    error: {
                        address: iceEvent.address,
                        errorCode: iceEvent.errorCode,
                        errorText: iceEvent.errorText,
                        port: iceEvent.port,
                        url: iceEvent.url,
                    },
                })
            };

            this.pc.oniceconnectionstatechange = () => {
                console.log({
                    type: 'iceConnectionStateChange',
                    iceConnectionState: this.pc?.iceConnectionState,
                })
            };

            this.pc.onsignalingstatechange = () => {
                console.log({
                    type: 'signalingStateChange',
                    signalState: this.pc?.signalingState,
                })
            };


            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    if (this.pc && this.localStream) {
                        this.pc.addTrack(track, this.localStream);
                    }
                });
            }
        },
    }
}
</script>