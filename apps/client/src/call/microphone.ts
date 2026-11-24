export type MicrophoneAccess = 'granted' | 'denied' | 'unavailable';

const DENIED_ERRORS = new Set(['NotAllowedError', 'SecurityError']);

export async function queryMicrophonePermission(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export async function requestMicrophone(): Promise<MicrophoneAccess> {
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return 'unavailable';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    for (const track of stream.getTracks()) {
      track.stop();
    }

    return 'granted';
  } catch (error) {
    return error instanceof DOMException && DENIED_ERRORS.has(error.name)
      ? 'denied'
      : 'unavailable';
  }
}
