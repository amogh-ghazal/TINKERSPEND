// Receipt originals stay on this device (IndexedDB in the browser / app-private WebView storage on Android).
const DB = "tinkerspend-receipts";
const STORE = "images";
export const MAX_UPLOAD_BYTES = 750 * 1024;
const MAX_EDGE = 2000;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const q = fn(db.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const saveReceipt = (draftId: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, draftId));
export const loadReceipt = (draftId: string) => tx<Blob | undefined>("readonly", (s) => s.get(draftId) as IDBRequest<Blob | undefined>);
export const deleteReceipt = (draftId: string) => tx("readwrite", (s) => s.delete(draftId));
export const clearReceipts = () => tx("readwrite", (s) => s.clear());

/** Re-encodes to JPEG (drops EXIF/location), applies orientation, caps the long edge and the upload size. */
export async function normalizeReceipt(file: Blob): Promise<Blob> {
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error("Use a JPEG or PNG photo.");
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  let edge = MAX_EDGE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.72, 0.6]) {
      const out = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));
      if (out && out.size <= MAX_UPLOAD_BYTES) { bmp.close(); return out; }
    }
    edge = Math.round(edge * 0.75);
  }
  bmp.close();
  throw new Error("Couldn't shrink this photo under 750 KiB.");
}
