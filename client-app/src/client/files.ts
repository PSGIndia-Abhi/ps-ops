import { NativeModules } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { ApiError } from '../api/httpClient';
import { getToken } from '../auth/tokenStorage';
import { API_BASE_URL } from '../config/env';

/**
 * Portal files (shared documents, audit reports) stream only with the login token,
 * so they are downloaded into the app's cache first, then opened / saved / shared -
 * the same way as Helpdesk attachments and quotations.
 */

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'document';

/** Downloads `path` (an /api/client-portal/... address) to the cache; returns the local file path. */
export async function downloadPortalFile(path: string, name: string): Promise<string> {
  const target = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/client-docs/${safeName(name)}`;
  const token = await getToken();
  const res = await ReactNativeBlobUtil.config({ path: target, overwrite: true, timeout: 60000 }).fetch(
    'GET',
    `${API_BASE_URL}${path}`,
    token ? { Authorization: `Bearer ${token}` } : {},
  );
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    await ReactNativeBlobUtil.fs.unlink(target).catch(() => undefined);
    throw new ApiError(status === 404 ? 'This file is no longer available.' : 'Could not download the file. Please try again.', status);
  }
  return target;
}

/** Opens a downloaded file in the phone's viewer. */
export async function openLocalFile(localPath: string, mimeType: string): Promise<void> {
  const opened = await ReactNativeBlobUtil.android.actionViewIntent(localPath, mimeType || 'application/octet-stream');
  if (opened === false) throw new ApiError('No app on this phone can open this file. Use "Save to Downloads" instead.');
}

/** Copies a downloaded file to Downloads/BestServe. */
export async function saveLocalFile(localPath: string, mimeType: string): Promise<void> {
  const name = localPath.split('/').pop() || 'document';
  await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
    { name, parentFolder: 'BestServe', mimeType: mimeType || 'application/octet-stream' } as unknown as Parameters<typeof ReactNativeBlobUtil.MediaCollection.copyToMediaStore>[0],
    'Download',
    localPath,
  );
}

// Android's own share sheet for a file (android/.../filesharer/FileSharerModule.kt).
const { FileSharer } = NativeModules as {
  FileSharer?: { share(path: string, mimeType: string, title: string, message: string | null): Promise<boolean> };
};

/** Opens the share sheet (WhatsApp, email…); older app builds without the module open the viewer. */
export async function shareLocalFile(localPath: string, mimeType: string, title: string): Promise<void> {
  if (!FileSharer) return openLocalFile(localPath, mimeType);
  await FileSharer.share(localPath, mimeType || 'application/octet-stream', title, null);
}
