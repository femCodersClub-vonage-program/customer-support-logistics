import type { StorageObject, StorageService } from '../../src/storage/storage.service.js';

export class FakeStorageService implements StorageService {
  readonly objects = new Map<string, StorageObject>();
  readonly prefixes = new Map<string, Uint8Array>();

  async createUploadUrl(key: string): Promise<string> {
    return `https://storage.test/upload/${key}`;
  }
  async createDownloadUrl(key: string): Promise<string> {
    return `https://storage.test/download/${key}`;
  }
  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    this.prefixes.delete(key);
  }
  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const object = this.objects.get(sourceKey);
    if (!object) throw new Error('Object not found');
    this.objects.set(destinationKey, { ...object });
    const prefix = this.prefixes.get(sourceKey);
    if (prefix) this.prefixes.set(destinationKey, prefix.slice());
  }
  async headObject(key: string): Promise<StorageObject | undefined> {
    return this.objects.get(key);
  }
  async readPrefix(key: string): Promise<Uint8Array | undefined> {
    return this.prefixes.get(key);
  }
}
