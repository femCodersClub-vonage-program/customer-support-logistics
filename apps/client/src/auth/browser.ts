export function isOnWifi(): boolean {
  const connection: unknown = 'connection' in navigator ? navigator.connection : undefined;

  return (
    typeof connection === 'object' &&
    connection !== null &&
    'type' in connection &&
    connection.type === 'wifi'
  );
}

export function goTo(url: string): void {
  window.location.assign(url);
}
