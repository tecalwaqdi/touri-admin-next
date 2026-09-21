export interface DriverDocumentRepository {
  read(objectPath: string): Promise<{
    body: ReadableStream<Uint8Array> | Uint8Array;
    contentType: string;
  }>;
}
