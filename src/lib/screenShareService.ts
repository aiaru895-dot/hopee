export type ScreenShareState = {
  enabled: boolean;
  mode: 'mock';
  warning: string;
};

export class ScreenShareService {
  private state: ScreenShareState = {
    enabled: false,
    mode: 'mock',
    warning: 'Mock screen sharing: WebRTC/signaling можно подключить позже.',
  };

  startScreenShare(): ScreenShareState {
    this.state = { ...this.state, enabled: true };
    return this.state;
  }

  stopScreenShare(): ScreenShareState {
    this.state = { ...this.state, enabled: false };
    return this.state;
  }
}
